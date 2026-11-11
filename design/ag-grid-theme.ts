// Toll Note theme for the AG Grid ledger (ag-grid-community 36.3.0, Theming API).
// Drop-in for src/components/Ledger.tsx: replace the existing `theme` const with
// `tollNoteTheme`, and use `ledgerColumns()` for column defs. Display only.
// Nothing here reads or writes money state; it formats CallView fields that
// already exist in src/lib/client/api.ts.
import { themeQuartz, type ColDef, type ValueFormatterParams } from "ag-grid-community";
import type { CallView } from "@/lib/client/api";

export const tollNoteTheme = themeQuartz.withParams({
  // next/font exposes these as CSS variables in layout.tsx (see SPEC.md 3.1)
  fontFamily: "var(--font-body), 'Public Sans', sans-serif",
  headerFontFamily: "var(--font-display), 'Archivo', sans-serif",
  cellFontFamily: "var(--font-body), 'Public Sans', sans-serif",
  fontSize: 14,
  dataFontSize: 14,
  headerFontSize: 12,
  headerFontWeight: 800,

  backgroundColor: "#FFFFFF",
  foregroundColor: "#0A231C",
  chromeBackgroundColor: "#FFFFFF",

  headerBackgroundColor: "#0B3B2D",
  headerTextColor: "#FFFFFF",
  headerCellHoverBackgroundColor: "#11523F",
  headerColumnBorder: { color: "#1A6B52", width: 1, style: "solid" },
  headerColumnResizeHandleColor: "#1A6B52",
  headerRowBorder: { color: "#F2B33D", width: 3, style: "solid" }, // gold rule under the header

  borderColor: "#0B3B2D",
  columnBorder: false,
  rowBorder: { color: "#C9DDD3", width: 1, style: "solid" },
  oddRowBackgroundColor: "#F2F7F4",
  rowHoverColor: "#FFF1CC",
  selectedRowBackgroundColor: "#FFE7A8",
  accentColor: "#2A3BAE",
  focusShadow: { radius: 0, spread: 3, color: "#2A3BAE" },

  // Totals row: pinned bottom, banknote green with a gold rule on top
  pinnedRowBackgroundColor: "#072B21",
  pinnedRowTextColor: "#FFFFFF",
  pinnedRowFontWeight: 700,
  pinnedRowBorder: { color: "#F2B33D", width: 3, style: "solid" },
  pinnedColumnBorder: { color: "#0B3B2D", width: 1.5, style: "solid" },

  wrapperBorder: { color: "#0B3B2D", width: 1.5, style: "solid" },
  wrapperBorderRadius: 4,
  rowHeight: 56,
  headerHeight: 44,
  cellHorizontalPadding: 14,
  spacing: 6,
  iconSize: 14,
});

/** Collapse raw first-line junk ("Accept all | Manage preferences\n\nFLASH SALE...") for display. */
export const cleanTitle = (s?: string) => (s ?? "(no brief)").replace(/\s+/g, " ").trim();

/** PayPal capture status to a human label and a status class from SPEC.md. */
export const CAPTURE_STATUS: Record<string, { cls: "st-paid" | "st-held" | "st-refused"; label: string }> = {
  COMPLETED: { cls: "st-paid", label: "Captured" },
  PENDING: { cls: "st-held", label: "Pending" },
  VOIDED: { cls: "st-held", label: "Voided" },
  DECLINED: { cls: "st-refused", label: "Declined" },
  FAILED: { cls: "st-refused", label: "Failed" },
};

export const CHECK_LETTERS: Record<string, string> = { schema: "S", spans: "P", grounding: "G", coverage: "C", judge: "J" };

export const timeET = (p: ValueFormatterParams<CallView>) =>
  p.value ? new Date(p.value).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }) : "";

/** Pinned bottom totals row. Sums the `charged` strings already on CallView. */
export function totalsRow(calls: CallView[], heldUsd: string) {
  const paid = calls.filter((c) => c.capture_id);
  const cents = paid.reduce((s, c) => s + Math.round(Number(c.charged) * 100), 0);
  return [{ call_id: "__total", title: `${calls.length} calls, ${paid.length} paid`, charged: (cents / 100).toFixed(2), capture_id: `of $${heldUsd} held` } as unknown as CallView];
}

/** Column sets. `wide` for >= 640px containers, `slim` below. Renderers live in Ledger.proposed.tsx. */
export function ledgerColumns(r: {
  Call: ColDef<CallView>["cellRenderer"]; Verdict: ColDef<CallView>["cellRenderer"]; Checks: ColDef<CallView>["cellRenderer"];
  Amount: ColDef<CallView>["cellRenderer"]; Capture: ColDef<CallView>["cellRenderer"]; Status: ColDef<CallView>["cellRenderer"];
  Receipt: ColDef<CallView>["cellRenderer"]; Mobile: ColDef<CallView>["cellRenderer"];
}): { wide: ColDef<CallView>[]; slim: ColDef<CallView>[] } {
  return {
    wide: [
      { headerName: "#", valueGetter: (p) => (p.node?.rowPinned ? "" : (p.node?.rowIndex ?? 0) + 1), width: 56, pinned: "left", sortable: false, cellClass: "cell-n" },
      { headerName: "Call", colId: "call", valueGetter: (p) => cleanTitle(p.data?.title), cellRenderer: r.Call, minWidth: 170, flex: 1.5, tooltipValueGetter: (p) => cleanTitle(p.data?.title) },
      { headerName: "Verdict", field: "verdict", cellRenderer: r.Verdict, width: 96 },
      { headerName: "Quote check", field: "score", cellRenderer: r.Checks, width: 164 },
      { headerName: "Charged", field: "charged", cellRenderer: r.Amount, width: 136, type: "rightAligned" },
      { headerName: "PayPal capture", field: "capture_id", cellRenderer: r.Capture, minWidth: 160, flex: 1 },
      { headerName: "Status", field: "capture_status", cellRenderer: r.Status, width: 128 },
      { headerName: "Time", field: "at", width: 92, valueFormatter: timeET, cellClass: "cell-time" },
      { headerName: "", colId: "receipt", cellRenderer: r.Receipt, width: 100, pinned: "right", sortable: false },
    ],
    slim: [
      { headerName: "Call", colId: "call", valueGetter: (p) => cleanTitle(p.data?.title), cellRenderer: r.Mobile, flex: 1, minWidth: 140, autoHeight: true, wrapText: true },
      { headerName: "Charged", field: "charged", cellRenderer: r.Amount, cellRendererParams: { narrow: true }, width: 100, type: "rightAligned" },
    ],
  };
}
