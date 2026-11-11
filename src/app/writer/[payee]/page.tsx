"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";

interface Ledger {
  payee: { recipient_type: string; receiver: string };
  ledger: "kv" | null;
  note?: string;
  accrued?: string;
  paid?: string;
  unpaid?: string;
  earnings?: { call_id: string; source_url: string | null; page_sha256: string | null; amount: string; sentences: string[]; at: string }[];
  payouts?: { tab_id: string; amount: string; payout_batch_id: string | null; payout_item_id: string | null; status: string | null; payout_item_fee: string | null }[];
}

export default function WriterPage({ params }: { params: Promise<{ payee: string }> }) {
  const { payee } = use(params);
  const [l, setL] = useState<Ledger | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/writers/${payee}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error?.message ?? `HTTP ${r.status}`);
        setL(j);
      })
      .catch((e) => setErr((e as Error).message));
  }, [payee]);

  if (err)
    return (
      <section className="app">
        <div className="panel error-block" role="alert">
          <p className="empty-big">No ledger.</p>
          <p>{err}</p>
        </div>
      </section>
    );
  if (!l)
    return (
      <section className="app" aria-busy="true">
        <div className="skeleton skeleton-receipt" />
      </section>
    );

  return (
    <section className="app">
      <article className="receipt receipt-pass">
        <header className="receipt-head">
          <p className="kicker">Writer royalties · PayPal sandbox</p>
          <h1 className="h-big">{l.payee.receiver}</h1>
        </header>
        {l.ledger ? (
          <dl className="receipt-rows">
            <Row k="Earned" v={`${l.accrued} USD`} />
            <Row k="Paid out" v={`${l.paid} USD`} />
            <Row k="Waiting for threshold" v={`${l.unpaid} USD`} />
          </dl>
        ) : (
          <p className="lede">{l.note}</p>
        )}
        <p className="panel-sub">
          Payouts to an email with no PayPal account show as UNCLAIMED. Sign up for PayPal with that email to claim the money. If nobody claims it within 30 days, PayPal returns it.
        </p>
      </article>

      {l.ledger && (
        <div className="panel">
          <p className="kicker">Sentences that earned money</p>
          {l.earnings!.length === 0 && <p className="hint">Nothing yet. You earn when a verified answer quotes your page.</p>}
          {l.earnings!.map((e) => (
            <dl className="receipt-rows" key={e.call_id}>
              <Row k="Earned" v={`${e.amount} USD on ${new Date(e.at).toLocaleString()}`} />
              <Row k="Page" v={e.source_url ?? "-"} mono />
              <Row k="Page SHA-256" v={e.page_sha256 ?? "-"} mono />
              <Row k="Quoted" v={e.sentences.map((s) => `"${s}"`).join("  ")} />
              <Row k="Call" v={e.call_id} mono />
            </dl>
          ))}
        </div>
      )}

      {l.ledger && (
        <div className="panel">
          <p className="kicker">PayPal Payouts</p>
          {l.payouts!.length === 0 && <p className="hint">No payouts yet.</p>}
          {l.payouts!.map((p, i) => (
            <dl className="receipt-rows" key={`${p.payout_batch_id}-${i}`}>
              <Row k="Amount" v={`${p.amount} USD`} />
              <Row k="Status" v={p.status ?? "sending"} />
              <Row k="Payout batch" v={p.payout_batch_id ?? "-"} mono />
              <Row k="Payout item" v={p.payout_item_id ?? "-"} mono />
              <Row k="PayPal item fee" v={p.payout_item_fee ? `${p.payout_item_fee} USD (paid by Toll Bridge)` : "-"} />
            </dl>
          ))}
        </div>
      )}
      <Link href="/writers/new" className="btn btn-plum">
        Make a license for your page
      </Link>
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
