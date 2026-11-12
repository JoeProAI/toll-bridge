// Toll Note v2 theme for the AG Grid ledger (ag-grid-community 36.3.0, Theming API).
// Drop-in for src/components/Ledger.tsx: replace the existing `theme` const with
// `tollNoteTheme`, and use `ledgerColumns()` for column defs. Display only.
// Nothing here reads or writes money state; it formats CallView fields that
// already exist in src/lib/client/api.ts.
import { themeQuartz, type ColDef, type ValueFormatterParams } from "ag-grid-community";
import type { CallView } from "@/lib/client/api";

export const tollNoteTheme = themeQuartz.withParams({
  // next/font exposes these as CSS variables in layout.tsx
  fontFamily: "var(--font-body), 'Public Sans', sans-serif",
  headerFontFamily: "var(--font-mono), 'IBM Plex Mono', monospace",
  cellFontFamily: "var(--font-body), 'Public Sans', sans-serif",
  fontSize: 14,
  dataFontSize: 14,
  headerFontSize: 11.5,
  headerFontWeight: 500,

  // v2: every color is a --tb-* token from globals.css, so swapping
  // tokens-optionA.css for tokens-optionB.css restyles the grid too.
  backgroundColor: "var(--tb-surface)",
  foregroundColor: "var(--tb-ink)",
  chromeBackgroundColor: "var(--tb-surface)",

  headerBackgroundColor: "var(--tb-head-bg)",
  headerTextColor: "var(--tb-head-fg-2)",
  headerCellHoverBackgroundColor: "var(--tb-head-bg)",
  headerColumnBorder: false,
  headerColumnResizeHandleColor: "var(--tb-head-rule)",
  headerRowBorder: { color: "var(--tb-head-line)", width: 1, style: "solid" },

  borderColor: "var(--tb-panel-line)",
  columnBorder: false,
  rowBorder: { color: "var(--tb-rule)", width: 1, style: "solid" },
  oddRowBackgroundColor: "var(--tb-surface)",
  rowHoverColor: "var(--tb-surface-2)",
  selectedRowBackgroundColor: "var(--tb-accent-tint)",
  accentColor: "var(--tb-accent-text)",
  focusShadow: { radius: 0, spread: 2, color: "var(--tb-accent-text)" },

  // Totals row: pinned bottom, header colors with a double rule on top
  pinnedRowBackgroundColor: "var(--tb-head-bg)",
  pinnedRowTextColor: "var(--tb-head-fg)",
  pinnedRowFontWeight: 600,
  pinnedRowBorder: { color: "var(--tb-rule-strong)", width: 3, style: "double" },
  pinnedColumnBorder: false,

  wrapperBorder: { color: "var(--tb-panel-line)", width: 1, style: "solid" },
  wrapperBorderRadius: 4,
  rowHeight: 52,
  headerHeight: 40,
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

/** Pass that is owed but not captured yet (tab settlement: captured once, at close). Display only. */
export const onTab = (c?: CallView | null) => !!c && c.verdict === "pass" && !c.capture_id && !c.charge_error;

/** Pinned bottom totals row. Sums strings already on CallView: captured `charged`, plus `price` for calls on the tab. */
export function totalsRow(calls: CallView[], heldUsd: string) {
  const cents = (v: string) => Math.round(Number(v) * 100);
  const captured = calls.filter((c) => c.capture_id).reduce((s, c) => s + cents(c.charged), 0);
  const owed = calls.filter(onTab).reduce((s, c) => s + cents(c.price), 0);
  const passed = calls.filter((c) => c.verdict === "pass").length;
  const usd = (n: number) => (n / 100).toFixed(2);
  return [{
    call_id: "__total",
    title: `${calls.length} calls, ${passed} passed`,
    charged: usd(captured + owed),
    capture_id: owed ? `$${usd(owed)} on tab` : `of $${heldUsd} held`,
  } as unknown as CallView];
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
      { headerName: "Verdict", field: "verdict", cellRenderer: r.Verdict, width: 92 },
      { headerName: "Quote check", field: "score", cellRenderer: r.Checks, width: 172 },
      { headerName: "Charged", field: "charged", cellRenderer: r.Amount, width: 136, type: "rightAligned" },
      { headerName: "PayPal capture", field: "capture_id", cellRenderer: r.Capture, minWidth: 160, flex: 1 },
      { headerName: "Status", field: "capture_status", cellRenderer: r.Status, width: 108 },
      { headerName: "Time", field: "at", width: 92, valueFormatter: timeET, cellClass: "cell-time" },
      { headerName: "", colId: "receipt", cellRenderer: r.Receipt, width: 96, pinned: "right", sortable: false },
    ],
    slim: [
      { headerName: "Call", colId: "call", valueGetter: (p) => cleanTitle(p.data?.title), cellRenderer: r.Mobile, flex: 1, minWidth: 140, autoHeight: true, wrapText: true },
      { headerName: "Charged", field: "charged", cellRenderer: r.Amount, cellRendererParams: { narrow: true }, width: 100, type: "rightAligned" },
    ],
  };
}
