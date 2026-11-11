"use client";

import { useMemo, useState } from "react";
import { generateRsl, licenseLinkTag, USAGE_CHOICES, validateLicense, type UsageToken } from "@/lib/rsl/generate";

interface Check {
  status: string;
  reason: string;
  licenseUrl?: string;
  via?: string;
  royaltyCents?: number;
  payee?: { receiver: string };
}

export default function NewWriterLicense() {
  const [amount, setAmount] = useState("0.05");
  const [kind, setKind] = useState<"EMAIL" | "PAYPAL_ID">("EMAIL");
  const [receiver, setReceiver] = useState("");
  const [owner, setOwner] = useState("");
  const [permits, setPermits] = useState<UsageToken[]>(["ai-input", "search"]);
  const [href, setHref] = useState("https://your-site.example/license.xml");
  const [pageUrl, setPageUrl] = useState("");
  const [check, setCheck] = useState<Check | null>(null);
  const [checkErr, setCheckErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const input = { amount, payee: { recipient_type: kind, receiver }, permits, owner };
  const problem = receiver ? validateLicense(input) : "Add the PayPal email or PayPal ID you want paid.";
  const xml = useMemo(() => (problem ? "" : generateRsl(input)), [problem, amount, kind, receiver, owner, permits]); // eslint-disable-line react-hooks/exhaustive-deps

  async function runCheck() {
    setBusy(true);
    setCheck(null);
    setCheckErr(null);
    try {
      const r = await fetch(`/api/rsl/check?url=${encodeURIComponent(pageUrl.trim())}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error?.message ?? `HTTP ${r.status}`);
      setCheck(j);
    } catch (e) {
      setCheckErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="app">
      <div className="panel">
        <p className="kicker">For writers</p>
        <h1 className="h-big">Get paid when an agent quotes you</h1>
        <p className="lede">
          Make an RSL 1.0 license for your page. When a Toll Bridge answer quotes your page and the quote checks out, you earn your price per use, paid with PayPal Payouts. If the answer fails its checks, nobody pays and you aren&apos;t credited.
        </p>
        <label className="hint" htmlFor="amount">Price per verified use (USD)</label>
        <input id="amount" className="custom" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        <p className="hint">Get paid at</p>
        <div className="actions">
          <label>
            <input type="radio" checked={kind === "EMAIL"} onChange={() => setKind("EMAIL")} /> PayPal email
          </label>
          <label>
            <input type="radio" checked={kind === "PAYPAL_ID"} onChange={() => setKind("PAYPAL_ID")} /> PayPal ID
          </label>
        </div>
        <input className="custom" aria-label={kind === "EMAIL" ? "PayPal email" : "PayPal ID"} value={receiver} onChange={(e) => setReceiver(e.target.value)} placeholder={kind === "EMAIL" ? "you@example.com" : "e.g. 7ZJ4K2QX9ABCD"} />
        <p className="hint">Uses you allow (anything unticked is prohibited)</p>
        {USAGE_CHOICES.map((u) => (
          <label key={u.token} style={{ display: "block" }}>
            <input type="checkbox" checked={permits.includes(u.token)} onChange={(e) => setPermits(e.target.checked ? [...permits, u.token] : permits.filter((p) => p !== u.token))} />{" "}
            <span className="mono">{u.token}</span>: {u.label}
          </label>
        ))}
        {!permits.includes("ai-input") && <p className="hint">Without ai-input, Toll Bridge refuses to use your page, and there&apos;s no royalty.</p>}
        <label className="hint" htmlFor="owner">Your name (optional)</label>
        <input id="owner" className="custom" value={owner} onChange={(e) => setOwner(e.target.value)} />
        <label className="hint" htmlFor="href">Where you&apos;ll host the license file</label>
        <input id="href" className="custom" value={href} onChange={(e) => setHref(e.target.value)} />
      </div>

      <div className="panel">
        <p className="kicker">1. Save this as your license file</p>
        {problem ? <p className="hint">{problem}</p> : <textarea className="custom" rows={16} readOnly value={xml} aria-label="RSL license XML" />}
        <p className="kicker">2. Put this in your page&apos;s &lt;head&gt;</p>
        <textarea className="custom" rows={2} readOnly value={licenseLinkTag(href)} aria-label="License link tag" />
        <p className="hint">
          The payee block uses <span className="mono">application/vnd.tollbridge.paypal-payout+json</span>. That&apos;s Toll Bridge&apos;s proposed media type, not part of RSL or PayPal.
        </p>
        <p className="hint">If your PayPal email has no PayPal account yet, the payout shows as UNCLAIMED. Sign up for PayPal with that email to claim it. PayPal returns unclaimed payouts after 30 days.</p>
      </div>

      <div className="panel">
        <p className="kicker">3. Check my page</p>
        <input className="custom" aria-label="Your page URL" value={pageUrl} onChange={(e) => setPageUrl(e.target.value)} placeholder="https://your-site.example/post" />
        <button className="btn btn-plum" onClick={runCheck} disabled={busy || !/^https?:\/\//.test(pageUrl.trim())}>
          {busy ? "Checking..." : "Check my page"}
        </button>
        {checkErr && (
          <p className="hint" role="alert">
            {checkErr}
          </p>
        )}
        {check && (
          <dl className="receipt-rows" aria-live="polite">
            <div className="row">
              <dt>Status</dt>
              <dd className="mono">{check.status}</dd>
            </div>
            <div className="row">
              <dt>What it means</dt>
              <dd>{check.reason}</dd>
            </div>
            <div className="row">
              <dt>Found via</dt>
              <dd>{check.via ?? "-"}</dd>
            </div>
            <div className="row">
              <dt>License</dt>
              <dd className="mono">{check.licenseUrl ?? "-"}</dd>
            </div>
          </dl>
        )}
      </div>
    </section>
  );
}
