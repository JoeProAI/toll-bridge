"use client";

import { useState } from "react";

interface Check {
  name: string;
  pass: boolean | null;
  detail: string;
}
interface Result {
  ok: boolean;
  checks: Check[];
  snapshot_from: string | null;
  key_kid: string;
  receipt: {
    call_id: string;
    verdict: string;
    input_url: string | null;
    tool_fee: string;
    royalty: string;
    payee: { receiver: string } | null;
  };
}

export default function VerifyPage() {
  const [text, setText] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    setErr(null);
    setRes(null);
    try {
      const raw = JSON.parse(text);
      const receipt = raw.receipt?.receipt ? raw.receipt : raw;
      const r = await fetch("/api/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ receipt }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message ?? `HTTP ${r.status}`);
      setRes(j);
    } catch (e) {
      setErr(
        e instanceof SyntaxError
          ? "That isn't JSON. Paste the whole receipt."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="app">
      <div className="panel">
        <p className="kicker">Check a receipt</p>
        <h1 className="h-big">Verify</h1>
        <p className="lede">
          Paste or upload a Toll Bridge receipt. We check its Ed25519 signature
          against the key at{" "}
          <a href="/.well-known/toll-bridge-receipt-key.json" className="mono">
            /.well-known/toll-bridge-receipt-key.json
          </a>
          , hash the page snapshot, and look for every quoted span at its
          offsets. Offline:{" "}
          <span className="mono">npm run verify-receipt receipt.json</span>.
        </p>
        <textarea
          className="custom"
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{"receipt": {...}, "signature": {...}, "snapshot": "..."}'
          aria-label="Receipt JSON"
          disabled={busy}
        />
        <p>
          <input
            type="file"
            accept="application/json,.json"
            aria-label="Upload a receipt file"
            onChange={async (e) =>
              setText((await e.target.files?.[0]?.text()) ?? "")
            }
          />
        </p>
        <button
          className="btn btn-plum"
          onClick={check}
          disabled={busy || !text.trim()}
        >
          {busy ? "Checking..." : "Verify receipt"}
        </button>
      </div>
      {err && (
        <div className="panel error-block" role="alert">
          <p>{err}</p>
        </div>
      )}
      {res && (
        <article
          className={`receipt ${res.ok ? "receipt-pass" : "receipt-fail"}`}
          aria-live="polite"
        >
          <header className="receipt-head">
            <p className="kicker">Receipt {res.receipt.call_id}</p>
            <h2 className="h-big">
              {res.ok ? "Checks out" : "Doesn't check out"}
            </h2>
            <span className={`stamp ${res.ok ? "stamp-paid" : "stamp-free"}`}>
              {res.ok ? "Valid" : "Invalid"}
            </span>
          </header>
          <dl className="receipt-rows">
            {res.checks.map((c) => (
              <div className="row" key={c.name}>
                <dt>{c.name.replace("_", " ")}</dt>
                <dd>
                  {c.pass === null ? "not checked" : c.pass ? "ok" : "FAILED"}:{" "}
                  {c.detail}
                </dd>
              </div>
            ))}
            <div className="row">
              <dt>snapshot</dt>
              <dd>
                {res.snapshot_from ?? "none"}
                {res.snapshot_from === "fetched now"
                  ? " (only matches if the page hasn't changed since the call)"
                  : ""}
              </dd>
            </div>
            <div className="row">
              <dt>charged</dt>
              <dd>
                tool {res.receipt.tool_fee}, royalty {res.receipt.royalty}
                {res.receipt.payee ? ` to ${res.receipt.payee.receiver}` : ""}
              </dd>
            </div>
            <div className="row">
              <dt>key</dt>
              <dd className="mono">{res.key_kid}</dd>
            </div>
          </dl>
        </article>
      )}
    </section>
  );
}
