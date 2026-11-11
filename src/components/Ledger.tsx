"use client";
// Proposed replacement for src/components/Ledger.tsx. Styling and display only.
// Same props, same data, same receipt links. Adds: Toll Note theme, status and
// amount renderers, quote-check pips, pinned totals row, a slim column set
// under 640px. Needs the CSS classes in SPEC.md section 5.
import { AllCommunityModule, ModuleRegistry, type ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CallView } from "@/lib/client/api";
import { CAPTURE_STATUS, CHECK_LETTERS, cleanTitle, ledgerColumns, tollNoteTheme, totalsRow } from "./ag-grid-theme";

ModuleRegistry.registerModules([AllCommunityModule]);
type P = ICellRendererParams<CallView>;
const pinned = (p: P) => !!p.node.rowPinned;
const isNarrow = (p: P) => !!(p as P & { narrow?: boolean }).narrow; // set via cellRendererParams on the slim column

const Call = (p: P) =>
  pinned(p) ? <span className="tot">{p.data?.title}</span> : (
    <span className="cell-call"><b>{cleanTitle(p.data?.title)}</b><span>{p.data?.tool} &middot; {p.data?.quote_id}</span></span>
  );
const Verdict = (p: P) => (pinned(p) ? null : p.data?.verdict === "pass" ? <span className="st st-paid">Pass</span> : <span className="st st-refused">Fail</span>);
const Checks = (p: P) => {
  if (pinned(p) || !p.data) return null;
  const e = Object.entries(p.data.checks);
  return (
    <span className="pips" aria-label={e.map(([k, v]) => `${k} ${v ? "ok" : "failed"}`).join(", ")}>
      {e.map(([k, v]) => <span key={k} className={`pip ${v ? "" : "x"}`} title={k}>{CHECK_LETTERS[k] ?? k[0].toUpperCase()}</span>)}
      <span className="cell-muted pip-score">{p.data.score ?? "-"}</span>
    </span>
  );
};
const Amount = (p: P) => {
  if (!p.data) return null;
  if (pinned(p)) return <span className="amt amt-total">${p.data.charged}</span>;
  if (p.data.capture_id) return <span className="amt">${p.data.charged}</span>;
  if (isNarrow(p)) return <span className="amt amt-none">$0.00<span className="amt-sub">not charged</span></span>;
  return <span className="amt amt-none"><s>${p.data.price}</s> $0.00<span className="sr-only"> not charged</span></span>;
};
const Capture = (p: P) => {
  const d = p.data;
  if (!d) return null;
  if (pinned(p)) return <span className="tot">{d.capture_id}</span>;
  if (!d.capture_id) return <span className="cell-muted">{d.charge_error ? `none (${d.charge_error})` : "none, not captured"}</span>;
  return <Link className="cell-id" href={`/receipt/${encodeURIComponent(d.capture_id)}`}>{d.capture_id}</Link>;
};
const Status = (p: P) => {
  if (pinned(p)) return null;
  if (!p.value) return <span className="cell-muted">-</span>;
  const s = CAPTURE_STATUS[p.value] ?? { cls: "st-held", label: String(p.value) };
  return <span className={`st ${s.cls}`}>{s.label}</span>;
};
const Receipt = (p: P) => (pinned(p) || !p.data ? null : <Link className="rcpt" href={`/receipt/${encodeURIComponent(p.data.capture_id ?? p.data.call_id)}`}>Receipt &rarr;</Link>);
const Mobile = (p: P) => {
  const d = p.data;
  if (!d) return null;
  if (pinned(p)) return <span className="tot">{d.title}</span>;
  return (
    <Link className="cell-call cell-wrap" href={`/receipt/${encodeURIComponent(d.capture_id ?? d.call_id)}`}>
      <b>{cleanTitle(d.title)}</b>
      <span>{d.capture_id ?? d.reasons[0] ?? "not captured"}</span>
      {d.verdict === "pass" ? <span className="st st-paid">Pass</span> : <span className="st st-refused">Fail</span>}
    </Link>
  );
};

export default function Ledger({ calls, held }: { calls: CallView[]; held?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 640));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const cols = useMemo(() => ledgerColumns({ Call, Verdict, Checks, Amount, Capture, Status, Receipt, Mobile }), []);
  const totals = useMemo(() => totalsRow(calls, held ?? "0.00"), [calls, held]);
  return (
    <div className="ledger-grid" ref={box}>
      <AgGridReact<CallView>
        theme={tollNoteTheme}
        rowData={calls}
        columnDefs={narrow ? cols.slim : cols.wide}
        pinnedBottomRowData={totals}
        getRowId={(p) => p.data.call_id}
        domLayout="autoHeight"
        defaultColDef={{ sortable: true, resizable: !narrow, suppressMovable: true }}
        tooltipShowDelay={300}
        suppressCellFocus
        animateRows
      />
    </div>
  );
}
