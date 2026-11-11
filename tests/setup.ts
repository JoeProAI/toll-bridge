import { beforeAll } from "vitest";

// Fixtures mode means no network. Any stray fetch fails the test.
beforeAll(() => {
  globalThis.fetch = (async (url: string | URL | Request) => {
    throw new Error(`network blocked in tests: ${String(url)}`);
  }) as typeof fetch;
});
