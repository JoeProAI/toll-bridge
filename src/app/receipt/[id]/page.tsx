"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ApiError, api, type CallView } from "@/lib/client/api";

interface Receipt {
  call: CallView;
  capture: { id: string; status: string; amount: { value: string; currency_code: string }; final_capture?: boolean; invoice_id?: string; create_time?: string; update_time?: string } | null;
  order_id: string;
  authorization_id: string;
  mode: string;
}

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [r, setR] = useState<Receipt | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<Receipt>(`/api/receipts/${encodeURIComponent(id)}`)
      .then(setR)
      .catch((e) => setErr(e instanceof ApiError ? e.message : "Couldn't load that receipt."));
  }, [id]);

  if (err)
    return (
      <section className="app">
        <div className="panel error-block" role="alert">
          <p className="empty-big">No receipt.</p>
          <p>{err} Receipts live with the tab that made them, in this browser.</p>
          <Link href="/tab" className="btn btn-plum">
            Back to the tab
          </Link>
        </div>
      </section>
    );
  if (!r)
    return (
      <section className="app" aria-busy="true">
        <div className="skeleton skeleton-receipt" />
      </section>
    );

  const c = r.call;
  const pass = c.verdict === "pass";
  return (
    <section className="app">
      <article className={`receipt ${pass ? "receipt-pass" : "receipt-fail"}`}>
        <header className="receipt-head">
          <p className="kicker">Toll Bridge receipt · {r.mode === "fixtures" ? "fixtures" : "PayPal sandbox"}</p>
          <h1 className="h-big">{pass ? `Paid ${c.charged}` : "Not charged"}</h1>
          <span className={`stamp ${pass ? "stamp-paid" : "stamp-free"}`}>{pass ? "Verified" : "Rejected"}</span>
        </header>
        <dl className="receipt-rows">
          <Row k="Tool" v={`${c.tool} at ${c.price} USD`} />
          <Row k="Source" v={c.title ?? "(no brief)"} />
          <Row k="Verdict" v={`${c.verdict.toUpperCase()}${c.score != null ? `, judge ${c.score}` : ""}`} />
          <Row k="Checks" v={Object.entries(c.checks).map(([k, v]) => `${k} ${v ? "ok" : "failed"}`).join(" · ")} />
          {!pass && <Row k="Why" v={c.reasons.join("; ")} />}
          <Row k="Model" v={c.model ?? "-"} />
          <Row k="Time" v={new Date(c.at).toLocaleString()} />
          <Row k="Order" v={r.order_id} mono />
          <Row k="Authorization" v={r.authorization_id} mono />
          {r.capture ? (
            <>
              <Row k="Capture" v={r.capture.id} mono />
              <Row k="Capture status" v={r.capture.status} />
              <Row k="Amount" v={`${r.capture.amount.value} ${r.capture.amount.currency_code}`} />
              <Row k="final_capture" v={String(r.capture.final_capture ?? false)} mono />
              <Row k="Invoice" v={r.capture.invoice_id ?? "-"} mono />
              <Row k="Captured at" v={r.capture.create_time ?? "-"} />
            </>
          ) : (
            <Row k="Capture" v="none. PayPal was never asked to move money for this call." />
          )}
        </dl>
        <p className="panel-sub">Capture details were just read back from PayPal, not from our own records.</p>
        <Link href="/tab" className="btn btn-plum">
          Back to the tab
        </Link>
      </article>
    </section>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="row">
      <dt>{k}</dt>
      <dd className={mono ? "mono" : undefined}>{v}</dd>
    </div>
  );
}
