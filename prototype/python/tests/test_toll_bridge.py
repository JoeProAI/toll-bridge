"""Tests for toll-bridge. No network, no keys, fully mocked.

Run: python -m unittest discover -s tests -v   (from rigs/toll-bridge/)
"""

import json
import sys
import unittest
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from toll_bridge.core import MODES, chunk_input, wring
from toll_bridge.ledger import JsonlLedger, MemoryLedger
from toll_bridge.mcp_server import make_handler as make_mcp_handler
from toll_bridge.models import FakeModel
from toll_bridge.payments import MockPayPalClient, PaymentError
from toll_bridge.runner import DaytonaRunner, LocalRunner, MockDaytonaClient
from toll_bridge.schema import WRUNG_RESULT_SCHEMA, validate
from toll_bridge.toll import PaymentRequired, TollGate

ARTICLE = (
    "The bridge opened in 1937 and cost $35 million to build. "
    "Engineers claim it was the longest suspension span of its era. "
    "Traffic has increased 40% since 1990, according to the transit authority. "
    "What happens when the toll exceeds the value of the crossing?\n\n"
    "Maintenance records show the cables are inspected yearly. "
    "The report found corrosion on 12 of 276 suspender ropes."
)


class TestWringCore(unittest.TestCase):
    def test_all_modes_schema_valid(self):
        for mode in MODES:
            result = wring(ARTICLE, mode)
            validate(result)
            self.assertEqual(result["mode"], mode)
            self.assertEqual(len(result["result_hash"]), 64)
            self.assertEqual(len(result["input_hash"]), 64)

    def test_claims_have_spans_into_input(self):
        result = wring(ARTICLE, "claims")
        self.assertTrue(result["claims"])
        for claim in result["claims"]:
            self.assertEqual(
                ARTICLE.strip()[claim["span"]["start"] : claim["span"]["end"]],
                claim["text"],
            )

    def test_brief_has_questions_and_confidence(self):
        result = wring(ARTICLE, "brief")
        self.assertTrue(any(q.endswith("?") for q in result["open_questions"]))
        self.assertIn(result["confidence"]["level"], ("low", "medium", "high"))

    def test_deterministic(self):
        self.assertEqual(wring(ARTICLE, "brief"), wring(ARTICLE, "brief"))

    def test_empty_input(self):
        result = wring("", "brief")
        self.assertEqual(result["confidence"]["level"], "low")

    def test_chunking_splits_long_input(self):
        chunks = chunk_input(ARTICLE * 50, chunk_chars=500)
        self.assertGreater(len(chunks), 3)
        self.assertTrue(all(len(c) <= 500 for c in chunks))

    def test_fake_model_drives_pipeline(self):
        model = FakeModel(
            [{"summary": "s", "claims": [{"text": "c1", "span": {"start": 0, "end": 2}}],
              "questions": ["q?"]}]
        )
        result = wring(ARTICLE, "brief", model=model)
        self.assertEqual(result["claims"][0]["text"], "c1")
        self.assertEqual(result["open_questions"], ["q?"])
        self.assertTrue(model.calls)

    def test_bad_mode_rejected(self):
        with self.assertRaises(ValueError):
            wring(ARTICLE, "everything")


class TestTollGate(unittest.TestCase):
    def setUp(self):
        self.payments = MockPayPalClient()
        self.ledger = MemoryLedger()
        self.gate = TollGate(
            payments=self.payments, runner=LocalRunner(), ledger=self.ledger
        )

    def test_unpaid_call_returns_402_quote(self):
        with self.assertRaises(PaymentRequired) as ctx:
            self.gate.call(ARTICLE, "brief")
        quote = ctx.exception.quote
        self.assertEqual(quote["amount"]["value"], "0.05")
        self.assertEqual(quote["amount"]["currency_code"], "USD")
        self.assertIn("quote_id", quote)
        events = [e["event"] for e in self.ledger.entries()]
        self.assertEqual(events, ["quote"])

    def test_paid_call_returns_result_and_logs(self):
        quote = self.gate.quote("brief")
        receipt = self.gate.pay(quote["quote_id"])
        out = self.gate.call(ARTICLE, "brief", payment=receipt)
        self.assertEqual(out["receipt"]["capture_id"], receipt.capture_id)
        self.assertIn("claims", out["result"])
        events = [e["event"] for e in self.ledger.entries()]
        self.assertEqual(events, ["quote", "payment", "wring"])
        last = self.ledger.entries()[-1]
        self.assertEqual(last["payment_id"], receipt.capture_id)
        self.assertEqual(last["cost"], "0.05")
        self.assertEqual(last["result_hash"], out["result"]["result_hash"])

    def test_failed_payment_raises_and_no_wring(self):
        quote = self.gate.quote("brief")
        order = self.payments.create_order("0.05", "USD", quote["quote_id"])
        auth = self.payments.authorize_order(order["id"])
        self.payments.fail_capture = True
        with self.assertRaises(PaymentError):
            self.payments.capture_authorization(auth["authorization_id"])

    def test_refund_on_wring_error(self):
        class ExplodingRunner:
            def run_wring(self, *_a, **_k):
                raise RuntimeError("sandbox exploded")

        gate = TollGate(
            payments=self.payments, runner=ExplodingRunner(), ledger=self.ledger
        )
        quote = gate.quote("brief")
        receipt = gate.pay(quote["quote_id"])
        with self.assertRaises(RuntimeError):
            gate.call(ARTICLE, "brief", payment=receipt)
        self.assertEqual(len(self.payments.refunds), 1)
        self.assertEqual(
            self.payments.captures[receipt.capture_id]["status"], "REFUNDED"
        )
        events = [e["event"] for e in self.ledger.entries()]
        self.assertEqual(events, ["quote", "payment", "refund"])
        self.assertEqual(self.ledger.entries()[-1]["cost"], "0.00")

    def test_forged_receipt_rejected(self):
        with self.assertRaises(PaymentRequired):
            self.gate.call(
                ARTICLE, "brief",
                payment={"quote_id": "x", "order_id": "y", "capture_id": "z"},
            )


class TestRunners(unittest.TestCase):
    def test_local_runner(self):
        result = LocalRunner().run_wring(ARTICLE, "brief")
        validate(result)

    def test_daytona_runner_mocked_sandbox(self):
        client = MockDaytonaClient()
        runner = DaytonaRunner(daytona_client=client)
        result = runner.run_wring(ARTICLE, "summary")
        validate(result)
        sb = client.sandboxes[0]
        self.assertTrue(sb.deleted)
        self.assertTrue(sb.fs.uploads)
        self.assertTrue(sb.process.runs)


class TestHttpServer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import threading

        from toll_bridge.http_server import serve
        cls.server = serve(port=0, gate=TollGate())
        cls.port = cls.server.server_address[1]
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def _post(self, path, body):
        req = urllib.request.Request(
            f"http://127.0.0.1:{self.port}{path}",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req) as resp:
                return resp.status, json.loads(resp.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_agent_flow_over_http(self):
        status, quote = self._post("/wring", {"input": ARTICLE})
        self.assertEqual(status, 402)
        self.assertEqual(quote["error"], "payment_required")
        status, receipt = self._post("/pay", {"quote_id": quote["quote"]["quote_id"]})
        self.assertEqual(status, 200)
        status, out = self._post(
            "/wring", {"input": ARTICLE, "mode": "brief", "receipt": receipt}
        )
        self.assertEqual(status, 200)
        validate(out["result"])


class TestMcpServer(unittest.TestCase):
    def setUp(self):
        self.handle = make_mcp_handler(TollGate())

    def _call(self, method, params=None, id_=1):
        return self.handle({"jsonrpc": "2.0", "id": id_, "method": method,
                            **({"params": params} if params else {})})

    def test_initialize_and_tools_list(self):
        init = self._call("initialize")
        self.assertEqual(init["result"]["serverInfo"]["name"], "toll-bridge")
        tools = self._call("tools/list")["result"]["tools"]
        self.assertEqual({t["name"] for t in tools},
                         {"wring_quote", "wring_pay", "wring"})

    def test_agent_flow_over_mcp(self):
        quote_resp = self._call(
            "tools/call", {"name": "wring_quote", "arguments": {"mode": "brief"}}
        )
        quote = json.loads(quote_resp["result"]["content"][0]["text"])
        err = self._call(
            "tools/call",
            {"name": "wring", "arguments": {"input": ARTICLE, "receipt": {
                "quote_id": "q", "order_id": "o", "capture_id": "c"}}},
        )
        self.assertEqual(err["error"]["code"], -32000)
        pay = self._call(
            "tools/call", {"name": "wring_pay",
                           "arguments": {"quote_id": quote["quote_id"]}}
        )
        receipt = json.loads(pay["result"]["content"][0]["text"])
        out = self._call(
            "tools/call",
            {"name": "wring", "arguments": {"input": ARTICLE, "receipt": receipt}},
        )
        result = json.loads(out["result"]["content"][0]["text"])
        validate(result["result"])

    def test_unknown_tool(self):
        resp = self._call("tools/call", {"name": "nope", "arguments": {}})
        self.assertEqual(resp["error"]["code"], -32602)


class TestLedger(unittest.TestCase):
    def test_jsonl_roundtrip(self):
        import tempfile

        with tempfile.TemporaryDirectory() as td:
            ledger = JsonlLedger(Path(td) / "ledger.jsonl")
            ledger.record({"event": "wring", "cost": "0.05"})
            ledger.record({"event": "refund", "cost": "0.00"})
            entries = ledger.entries()
            self.assertEqual([e["event"] for e in entries], ["wring", "refund"])
            self.assertTrue(all("ts" in e for e in entries))


if __name__ == "__main__":
    unittest.main()
