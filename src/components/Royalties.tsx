"use client";

import { AgGridReact } from "ag-grid-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import type { CallView, TabView } from "@/lib/client/api";
import { tollNoteTheme as theme } from "./ag-grid-theme";

export interface RoyaltyRow {
  id: string;
  n: number;
  source: string;
  rsl: string;
  quote: string;
  payee: string;
  royalty: string;
  earned: string;
  payout: string;
  payoutItem: string;
}

const sum = (xs: string[]) => xs.reduce((s, x) => s + Number(x || 0), 0).toFixed(2);

export function royaltyRows(view: TabView): RoyaltyRow[] {
  const items = view.payout?.items ?? [];
  const accruing = view.payout?.accruing ?? [];
  const payoutFor = (receiver: string) => {
    const it = items.find((i) => i.payee.receiver === receiver);
    if (it) return { status: it.status ?? "sending", item: it.payout_item_id ?? "" };
    if (accruing.some((a) => a.payee.receiver === receiver)) return { status: "accruing", item: "" };
    return { status: view.tab.status === "open" ? "pays at close" : "-", item: "" };
  };
  return view.calls.flatMap((c: CallView, idx) => {
    const r = c.royalty;
    const base = { n: idx + 1, source: c.source_url ?? "(pasted text)", rsl: c.rsl?.status ?? "-", payee: r?.payee.receiver ?? "-" };
    const p = r?.earned ? payoutFor(r.payee.receiver) : { status: "-", item: "" };
    const spans = c.verified_spans ?? [];
    if (!spans.length) {
      const why = (c.verdict as string) === "refused" ? "refused before running" : c.verdict === "fail" ? "no verified quote (call failed)" : "no quote";
      return [{ ...base, id: c.call_id, quote: why, royalty: "0.00", earned: "no", payout: "-", payoutItem: "" }];
    }
    return spans.map((s, i) => ({
      ...base,
      id: `${c.call_id}-${i}`,
      quote: s.quote,
      royalty: i === 0 && r?.earned ? r.amount : "0.00",
      earned: r?.earned ? "yes" : "no",
      payout: p.status,
      payoutItem: p.item,
    }));
  });
}

function totalsRows(view: TabView): Partial<RoyaltyRow>[] {
  const t = view.tab;
  const released = view.final_capture ? (Number(t.held) - Number(t.captured)).toFixed(2) : t.voided;
  const paid = sum((view.payout?.items ?? []).filter((i) => i.status === "SUCCESS").map((i) => i.amount));
  return [
    ["Held", t.held],
    ["Captured", t.captured],
    [view.final_capture ? "Released" : "Voided", released],
    [view.tab.mode === "fixtures" ? "PayPal fees (fixtures)" : "PayPal fees (sandbox reported)", view.fees?.total ?? "0.00"],
    ["Royalties accrued", t.royalties_earned ?? "0.00"],
    ["Royalties paid", paid],
  ].map(([k, v]) => ({ id: `total-${k}`, quote: k, royalty: v }));
}

function Payee(p: ICellRendererParams<RoyaltyRow>) {
  const v = p.value as string;
  if (!v || v === "-" || p.node.rowPinned) return <span className="cell-muted">{v}</span>;
  return (
    <Link className="cell-link" href={`/writer/${encodeURIComponent(v)}`}>
      {v}
    </Link>
  );
}

export default function Royalties({ view }: { view: TabView }) {
  const grid = useRef<AgGridReact<RoyaltyRow>>(null);
  const [filter, setFilter] = useState("");
  const rows = useMemo(() => royaltyRows(view), [view]);
  const totals = useMemo(() => totalsRows(view), [view]);
  const cols = useMemo<ColDef<RoyaltyRow>[]>(
    () => [
      { headerName: "#", field: "n", width: 58, pinned: "left" },
      { headerName: "Quote", field: "quote", minWidth: 240, flex: 2, wrapText: true, autoHeight: true, cellClass: "cell-why" },
      { headerName: "Source", field: "source", minWidth: 180, flex: 1.2, tooltipField: "source" },
      { headerName: "RSL", field: "rsl", width: 130 },
      { headerName: "Writer", field: "payee", minWidth: 200, flex: 1, cellRenderer: Payee },
      { headerName: "Royalty", field: "royalty", width: 100, cellClass: "cell-charged" },
      { headerName: "Earned", field: "earned", width: 92 },
      { headerName: "Payout", field: "payout", width: 130, enableCellChangeFlash: true },
      { headerName: "Payout item", field: "payoutItem", minWidth: 150, cellClass: "cell-id", enableCellChangeFlash: true },
    ],
    [],
  );
  return (
    <>
      <div className="actions">
        <input className="custom" aria-label="Filter royalties" placeholder="Filter: writer, page, status..." value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button type="button" className="btn btn-ghost" onClick={() => grid.current?.api.exportDataAsCsv({ fileName: `toll-bridge-royalties-${view.tab.tab_id}.csv` })}>
          Export CSV
        </button>
      </div>
      <div className="ledger-grid">
        <AgGridReact<RoyaltyRow>
          ref={grid}
          theme={theme}
          rowData={rows}
          pinnedBottomRowData={totals as RoyaltyRow[]}
          columnDefs={cols}
          getRowId={(p) => p.data.id}
          quickFilterText={filter}
          domLayout="autoHeight"
          defaultColDef={{ sortable: true, resizable: true }}
          tooltipShowDelay={300}
          suppressCellFocus
        />
      </div>
      <p className="panel-sub">
        One row per quote that passed the span check. A writer earns their RSL price once per verified call. Payee blocks use Toll Bridge&apos;s proposed media type application/vnd.tollbridge.paypal-payout+json, not part of RSL or PayPal.
      </p>
    </>
  );
}
