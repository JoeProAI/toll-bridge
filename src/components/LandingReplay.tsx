"use client";

import { useEffect, useState } from "react";
import { HoldMeter, type MeterCall } from "./HoldMeter";

const STEPS: { calls: MeterCall[]; closed: boolean; fresh: string | null; note: string; inflight?: "run" }[] = [
  { calls: [], closed: false, fresh: null, note: "You approve a 2.00 hold in PayPal. Nothing is spent yet." },
  { calls: [], closed: false, fresh: null, inflight: "run", note: "Your agent asks for a quote: 0.50 per call." },
  { calls: [{ id: "a", verdict: "pass", capture_id: "8MC585209K746392H" }], closed: false, fresh: "a", note: "Call 1 passes its checks. PayPal captures 0.50." },
  { calls: [{ id: "a", verdict: "pass", capture_id: "8MC585209K746392H" }, { id: "b", verdict: "pass", capture_id: "2GG279541U471931P" }], closed: false, fresh: "b", note: "Call 2 passes. Another 0.50." },
  {
    calls: [
      { id: "a", verdict: "pass", capture_id: "8MC585209K746392H" },
      { id: "b", verdict: "pass", capture_id: "2GG279541U471931P" },
      { id: "c", verdict: "fail", capture_id: null },
    ],
    closed: false,
    fresh: "c",
    note: "Call 3 makes things up. It bounces. You pay nothing.",
  },
  {
    calls: [
      { id: "a", verdict: "pass", capture_id: "8MC585209K746392H" },
      { id: "b", verdict: "pass", capture_id: "2GG279541U471931P" },
      { id: "c", verdict: "fail", capture_id: null },
    ],
    closed: true,
    fresh: "close",
    note: "Close the tab. PayPal voids the last 1.00 back to you.",
  },
];

export function LandingReplay() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setI((x) => (x + 1) % STEPS.length), i === STEPS.length - 1 ? 4200 : 2400);
    return () => clearTimeout(t);
  }, [i, paused]);
  const s = STEPS[i];
  const captured = s.calls.filter((c) => c.verdict === "pass").length * 50;
  return (
    <div className="replay">
      <div className="replay-head">
        <span className="tag">Replay</span>
        <button type="button" className="btn-link" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
          {paused ? "Play" : "Pause"}
        </button>
      </div>
      <HoldMeter heldCents={200} priceCents={50} capturedCents={captured} closed={s.closed} voidedCents={s.closed ? 200 - captured : 0} calls={s.calls} freshId={s.fresh} inflight={s.inflight} />
      <p className="replay-note" aria-live="polite">
        <span className="replay-step">{i + 1}/{STEPS.length}</span> {s.note}
      </p>
    </div>
  );
}
