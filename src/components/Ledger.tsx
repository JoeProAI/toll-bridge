"use client";

import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import Link from "next/link";
import { useMemo } from "react";
import type { CallView } from "@/lib/client/api";

ModuleRegistry.registerModules([AllCommunityModule]);

const theme = themeQuartz.withParams({
  fontFamily: "var(--font-body), sans-serif",
  headerFontFamily: "var(--font-display), sans-serif",
  headerFontWeight: 800,
  headerFontSize: 13,
  fontSize: 14,
  backgroundColor: "#FFFFFF",
  foregroundColor: "#2B0A3D",
  headerBackgroundColor: "#2B0A3D",
  headerTextColor: "#D4FF3F",
  borderColor: "#2B0A3D",
  rowBorder: { color: "#E6D6F2", width: 1, style: "solid" },
  oddRowBackgroundColor: "#FBF5FF",
  accentColor: "#FF2E93",
  rowHoverColor: "#F2FFCB",
  wrapperBorderRadius: 0,
  wrapperBorder: { color: "#2B0A3D", width: 3, style: "solid" },
  spacing: 7,
  cellHorizontalPadding: 12,
});

function Verdict(p: ICellRendererParams<CallView>) {
  const v = p.data?.verdict;
  return <span className={`pill pill-${v}`}>{v === "pass" ? "Pass" : "Fail"}</span>;
}

function CaptureCell(p: ICellRendererParams<CallView>) {
  const d = p.data;
  if (!d) return null;
  if (!d.capture_id) return <span className="cell-muted">{d.charge_error ? `none (${d.charge_error})` : "none"}</span>;
  return (
    <Link className="cell-id" href={`/receipt/${encodeURIComponent(d.capture_id)}`}>
      {d.capture_id}
    </Link>
  );
}

function ReceiptCell(p: ICellRendererParams<CallView>) {
  const d = p.data;
  if (!d) return null;
  return (
    <Link className="cell-link" href={`/receipt/${encodeURIComponent(d.capture_id ?? d.call_id)}`}>
      Receipt
    </Link>
  );
}

export default function Ledger({ calls }: { calls: CallView[] }) {
  const cols = useMemo<ColDef<CallView>[]>(
    () => [
      { headerName: "#", valueGetter: (p) => (p.node?.rowIndex ?? 0) + 1, width: 58, pinned: "left", sortable: false },
      { headerName: "Source", valueGetter: (p) => p.data?.title ?? "(no brief)", minWidth: 170, flex: 1.4, tooltipValueGetter: (p) => p.data?.title ?? "" },
      { headerName: "Verdict", field: "verdict", cellRenderer: Verdict, width: 110 },
      { headerName: "Score", field: "score", width: 92, valueFormatter: (p) => (p.value == null ? "-" : String(p.value)) },
      { headerName: "Charged", field: "charged", width: 104, cellClass: (p) => (p.data?.capture_id ? "cell-charged" : "cell-free") },
      { headerName: "PayPal capture", field: "capture_id", cellRenderer: CaptureCell, minWidth: 190, flex: 1.4 },
      { headerName: "Status", field: "capture_status", width: 124, valueFormatter: (p) => p.value ?? "-" },
      { headerName: "Why", valueGetter: (p) => (p.data?.verdict === "pass" ? "All checks passed" : p.data?.reasons.join("; ")), minWidth: 220, flex: 2, wrapText: true, autoHeight: true, cellClass: "cell-why" },
      { headerName: "Time", field: "at", width: 104, valueFormatter: (p) => new Date(p.value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) },
      { headerName: "", cellRenderer: ReceiptCell, width: 96, sortable: false, pinned: "right" },
    ],
    [],
  );
  return (
    <div className="ledger-grid">
      <AgGridReact<CallView>
        theme={theme}
        rowData={calls}
        columnDefs={cols}
        getRowId={(p) => p.data.call_id}
        domLayout="autoHeight"
        defaultColDef={{ sortable: true, resizable: true }}
        tooltipShowDelay={300}
        suppressCellFocus
      />
    </div>
  );
}
