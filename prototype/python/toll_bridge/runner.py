"""Sandbox runner: where the wring job executes.

`LocalRunner` runs the pipeline in-process — the no-keys fallback.
`DaytonaRunner` runs it inside a Daytona sandbox via the official SDK
(`Daytona().create()`, `sandbox.process.code_run(...)`), reading
DAYTONA_API_KEY from env. `MockDaytonaClient` mirrors the SDK surface for
tests so no sandbox is ever created in CI.
"""

from __future__ import annotations

import json
import os
from typing import Protocol

from .core import wring


class Runner(Protocol):
    def run_wring(self, input_text: str, mode: str) -> dict: ...


class LocalRunner:
    """In-process fallback. Works with zero keys."""

    def __init__(self, model=None):
        self.model = model

    def run_wring(self, input_text: str, mode: str) -> dict:
        return wring(input_text, mode, model=self.model)


_WRING_SNIPPET = """
import json, sys
sys.path.insert(0, '/opt/toll-bridge')
from toll_bridge.core import wring
print(json.dumps(wring(json.loads(sys.argv[1]), sys.argv[2])))
"""


class DaytonaRunner:
    """Runs wring inside a Daytona sandbox (real SDK; not used in tests)."""

    def __init__(self, daytona_client=None):
        # Lazy import: tests inject MockDaytonaClient and never need the SDK.
        if daytona_client is None:
            from daytona import Daytona  # noqa: PLC0415

            daytona_client = Daytona()  # reads DAYTONA_API_KEY from env
        self._daytona = daytona_client

    def run_wring(self, input_text: str, mode: str) -> dict:
        sandbox = self._daytona.create()
        try:
            for root, _dirs, files in os.walk(os.path.dirname(__file__)):
                for name in files:
                    if name.endswith(".py"):
                        path = os.path.join(root, name)
                        rel = os.path.relpath(path, os.path.dirname(os.path.dirname(__file__)))
                        sandbox.fs.upload_file(path, f"/opt/toll-bridge/{rel}")
            code = (
                "import json, sys; sys.path.insert(0, '/opt/toll-bridge');"
                "from toll_bridge.core import wring;"
                f"print(json.dumps(wring({json.dumps(input_text)}, {json.dumps(mode)})))"
            )
            response = sandbox.process.code_run(code)
            return json.loads(response.result)
        finally:
            sandbox.delete()


class MockDaytonaClient:
    """Mirrors the Daytona SDK surface used by DaytonaRunner."""

    def __init__(self):
        self.sandboxes: list[MockSandbox] = []

    def create(self, params=None, timeout=60):
        sb = MockSandbox()
        self.sandboxes.append(sb)
        return sb


class MockProcess:
    def __init__(self):
        self.runs: list[str] = []

    def code_run(self, code: str):
        self.runs.append(code)
        # Execute locally but through the same return shape, with the package
        # importable as it would be inside the real sandbox.
        import subprocess

        pkg_parent = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        code = code.replace("/opt/toll-bridge", pkg_parent)
        env = {**os.environ, "PYTHONPATH": pkg_parent}
        out = subprocess.run(
            ["python3", "-c", code], capture_output=True, text=True, check=True, env=env
        )

        class R:
            result = out.stdout

        return R()


class MockFS:
    def __init__(self):
        self.uploads: list[tuple[str, str]] = []

    def upload_file(self, local: str, remote: str):
        self.uploads.append((local, remote))


class MockSandbox:
    def __init__(self):
        self.process = MockProcess()
        self.fs = MockFS()
        self.deleted = False

    def delete(self):
        self.deleted = True


def default_runner() -> Runner:
    """Daytona when a key exists, else local. Never raises for missing keys."""
    if os.environ.get("DAYTONA_API_KEY"):
        try:
            return DaytonaRunner()
        except Exception:
            pass
    return LocalRunner()
