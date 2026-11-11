"use client";

import { useMemo } from "react";
import { shortId } from "@/lib/client/api";

export interface MeterCall {
  id: string;
  verdict: "pass" | "fail";
  capture_id: string | null;
}

interface Props {
  heldCents: number;
  priceCents: number;
  capturedCents: number;
  closed: boolean;
  voidedCents: number;
  calls: MeterCall[];
  freshId?: string | null;
  inflight?: "quote" | "run" | null;
  caption?: string;
}

const money = (c: number) => (c / 100).toFixed(2);

// The hold, drawn as a deck of toll-sized chunks. A verified call bites a
// chunk off; a failed call bounces off the deck; closing sends the rest home.
export function HoldMeter({ heldCents, priceCents, capturedCents, closed, voidedCents, calls, freshId, inflight, caption }: Props) {
  const slots = Math.max(1, Math.ceil(heldCents / priceCents));
  const bitten = Math.min(slots, Math.round(capturedCents / priceCents));
  const passed = calls.filter((c) => c.verdict === "pass" && c.capture_id);
  const failed = calls.filter((c) => c.verdict === "fail");
  const remaining = heldCents - capturedCents;
  const freshPass = passed.findIndex((c) => c.id === freshId);

  const label = useMemo(
    () =>
      `PayPal hold of ${money(heldCents)} USD. ${money(capturedCents)} captured by ${passed.length} verified calls. ${failed.length} failed calls not charged. ` +
      (closed ? `${money(voidedCents)} voided back to the payer.` : `${money(remaining)} still held.`),
    [heldCents, capturedCents, passed.length, failed.length, closed, voidedCents, remaining],
  );

  return (
    <figure className={`meter ${closed ? "is-closed" : ""}`} aria-label={label} role="img">
      <div className="note-top">
        <span className="fig-k">PayPal hold · Orders v2 AUTHORIZE</span>
      </div>
      <div className="note-amt">
        <small>$</small>
        {money(heldCents)}
      </div>
      <div className="meter-figures">
        <Fig k="Held" v={money(heldCents)} />
        <Fig k="Captured" v={money(capturedCents)} tone="plum" />
        {closed ? <Fig k="Voided" v={money(voidedCents)} tone="cobalt" /> : <Fig k="Left" v={money(remaining)} />}
      </div>

      <div className="meter-lane" aria-hidden="true">
        {failed.length === 0 ? (
          <span className="lane-hint">{closed ? "No failed calls" : "Failed calls bounce off here, free"}</span>
        ) : (
          failed.map((c) => (
            <span key={c.id} className={`bounce ${c.id === freshId ? "is-fresh" : ""}`}>
              <b>0.00</b> not charged
            </span>
          ))
        )}
      </div>

      <div className="deck" style={{ ["--n" as string]: slots }} aria-hidden="true">
        {Array.from({ length: slots }, (_, i) => {
          const isBitten = i < bitten;
          const isNext = !closed && i === bitten && !!inflight;
          const state = isBitten ? "bitten" : closed ? "home" : isNext ? "hook" : "held";
          const cap = isBitten ? passed[i]?.capture_id : null;
          const fresh = (isBitten && i === freshPass) || (state === "home" && freshId === "close");
          return (
            <span key={i} className={`chunk is-${state} ${fresh ? "is-fresh" : ""}`} style={{ ["--i" as string]: i }}>
              <span className="chunk-val">{isBitten ? shortId(cap, 4) || "paid" : state === "home" ? "void" : money(Math.min(priceCents, heldCents - i * priceCents))}</span>
            </span>
          );
        })}
      </div>

      <div className="meter-rails" aria-hidden="true">
        <span className="rail rail-capture" style={{ ["--w" as string]: `${(capturedCents / heldCents) * 100}%` }}>
          {capturedCents > 0 && <>PayPal captured {money(capturedCents)}</>}
        </span>
        {closed && voidedCents > 0 && (
          <span className={`rail rail-home ${freshId === "close" ? "is-fresh" : ""}`} style={{ ["--w" as string]: `${(voidedCents / heldCents) * 100}%` }}>
            {money(voidedCents)} back to the payer
          </span>
        )}
      </div>
      {caption && <figcaption className="meter-caption">{caption}</figcaption>}
    </figure>
  );
}

function Fig({ k, v, tone }: { k: string; v: string; tone?: "plum" | "cobalt" }) {
  return (
    <div className={`fig ${tone ? `fig-${tone}` : ""}`}>
      <span className="fig-k">{k}</span>
      <span className="fig-v">
        <small>$</small>
        {v}
      </span>
    </div>
  );
}
