// Mockup ledger: real ag-grid-community 36.3.0 (UMD) with the Toll Note theme.
// Same params, renderers and column logic as ../ag-grid-theme.ts.
const { createGrid, themeQuartz } = agGrid;
const theme = themeQuartz.withParams({
  fontFamily: { googleFont: "Public Sans" },
  headerFontFamily: { googleFont: "Archivo" },
  cellFontFamily: { googleFont: "Public Sans" },
  fontSize: 14, dataFontSize: 14, headerFontSize: 12, headerFontWeight: 800,
  backgroundColor: "#FFFFFF", foregroundColor: "#0A231C", textColor: "#0A231C",
  chromeBackgroundColor: "#FFFFFF",
  headerBackgroundColor: "#0B3B2D", headerTextColor: "#FFFFFF",
  headerCellHoverBackgroundColor: "#11523F",
  headerColumnBorder: { color: "#1A6B52", width: 1, style: "solid" },
  headerColumnResizeHandleColor: "#1A6B52",
  headerRowBorder: { color: "#F2B33D", width: 3, style: "solid" },
  borderColor: "#0B3B2D", columnBorder: false,
  rowBorder: { color: "#C9DDD3", width: 1, style: "solid" },
  oddRowBackgroundColor: "#F2F7F4", rowHoverColor: "#FFF1CC",
  selectedRowBackgroundColor: "#FFE7A8",
  accentColor: "#2A3BAE", focusShadow: { radius: 0, spread: 3, color: "#2A3BAE" },
  pinnedRowBackgroundColor: "#072B21", pinnedRowTextColor: "#FFFFFF", pinnedRowFontWeight: 700,
  pinnedRowBorder: { color: "#F2B33D", width: 3, style: "solid" },
  pinnedColumnBorder: { color: "#0B3B2D", width: 1.5, style: "solid" },
  wrapperBorder: { color: "#0B3B2D", width: 1.5, style: "solid" }, wrapperBorderRadius: 4,
  rowHeight: 56, headerHeight: 44, cellHorizontalPadding: 14, spacing: 6, iconSize: 14,
});

const calls = [
  { n: 1, label: "Council meeting notes", title: "HARBOR DISTRICT COUNCIL", verdict: "pass", score: 8.3, checks: { schema: true, spans: true, grounding: true, coverage: true, judge: true }, reasons: [], charged: "0.50", price: "0.50", capture_id: "FXCAP000000000003", capture_status: "COMPLETED", at: "2026-11-11T23:12:39.799Z" },
  { n: 2, label: "Checkout outage postmortem", title: "postmortem draft (blameless) - checkout down", verdict: "pass", score: 8.3, checks: { schema: true, spans: true, grounding: true, coverage: true, judge: true }, reasons: [], charged: "0.50", price: "0.50", capture_id: "FXCAP000000000004", capture_status: "COMPLETED", at: "2026-11-11T23:12:39.837Z" },
  { n: 3, label: "Sleep gummy sales page", title: "Accept all | Manage preferences\n\nFLASH SALE ENDS TONIGHT!!!", verdict: "fail", score: 0, checks: { schema: true, spans: false, grounding: true, coverage: true, judge: false }, reasons: ["claim 5: quote not found at its span in the source"], charged: "0.00", price: "0.50", capture_id: null, capture_status: null, at: "2026-11-11T23:12:39.863Z" },
];
const clean = (s) => (s || "(no brief)").replace(/\s+/g, " ").trim();
const el = (html) => { const d = document.createElement("span"); d.innerHTML = html; return d; };
const STATUS = { COMPLETED: ["st-paid", "Captured"], PENDING: ["st-held", "Pending"], VOIDED: ["st-held", "Voided"], DECLINED: ["st-refused", "Declined"] };
const LETTERS = { schema: "S", spans: "P", grounding: "G", coverage: "C", judge: "J" };

const CallCell = (p) => p.node.rowPinned ? el(`<span class="tot">${p.data.label}</span>`) :
  el(`<span class="cell-call"><b>${p.data.label}</b><span title="${clean(p.data.title)}">${clean(p.data.title)}</span></span>`);
const VerdictCell = (p) => p.node.rowPinned ? null : el(p.data.verdict === "pass" ? `<span class="st st-paid">Pass</span>` : `<span class="st st-refused">Fail</span>`);
const ChecksCell = (p) => p.node.rowPinned ? null : el(`<span class="pips" aria-label="${Object.entries(p.data.checks).map(([k, v]) => k + (v ? " ok" : " failed")).join(", ")}">${Object.entries(p.data.checks).map(([k, v]) => `<span class="pip ${v ? "" : "x"}" title="${k}">${LETTERS[k]}</span>`).join("")}</span><span class="cell-muted" style="margin-left:8px">${p.data.score ?? "-"}</span>`);
const AmountCell = (p) => {
  if (p.node.rowPinned) return el(`<span class="amt" style="color:#F2B33D">$${p.data.charged}</span>`);
  if (p.data.capture_id) return el(`<span class="amt amt-paid">$${p.data.charged}</span>`);
  return el(narrow ? `<span class="amt amt-none">$0.00</span><span class="amt-sub">not charged</span>` : `<span class="amt amt-none"><s>$${p.data.price}</s> $0.00</span>`);
};
const CaptureCell = (p) => p.node.rowPinned ? el(`<span class="tot">${p.data.capture_id}</span>`) :
  el(p.data.capture_id ? `<a class="cell-id" href="receipt.html">${p.data.capture_id}</a>` : `<span class="cell-muted">none, not captured</span>`);
const StatusCell = (p) => { if (p.node.rowPinned || !p.value) return p.node.rowPinned ? null : el(`<span class="cell-muted">-</span>`); const [c, t] = STATUS[p.value] || ["st-held", p.value]; return el(`<span class="st ${c}">${t}</span>`); };
const ReceiptCell = (p) => p.node.rowPinned ? null : el(`<a class="rcpt" href="receipt.html">Receipt &rarr;</a>`);
const MobileCell = (p) => {
  if (p.node.rowPinned) return el(`<span class="tot">${p.data.label}</span>`);
  const v = p.data.verdict === "pass" ? `<span class="st st-paid">Pass</span>` : `<span class="st st-refused">Fail</span>`;
  return el(`<span class="cell-call cell-wrap"><b>${p.data.label}</b><span style="margin:3px 0 6px">${p.data.capture_id || p.data.reasons[0]}</span>${v}</span>`);
};

const passed = calls.filter((c) => c.capture_id);
const totals = [{ label: `${calls.length} calls, ${passed.length} paid`, n: null, charged: passed.reduce((s, c) => s + Number(c.charged), 0).toFixed(2), capture_id: `of $2.00 held` }];

const host = document.getElementById("grid");
const narrow = host.clientWidth < 640;
const wide = [
  { headerName: "#", field: "n", width: 56, pinned: "left", sortable: false, cellStyle: { fontFamily: "IBM Plex Mono", color: "#44605A" } },
  { headerName: "Call", field: "label", cellRenderer: CallCell, minWidth: 170, flex: 1.5 },
  { headerName: "Verdict", field: "verdict", cellRenderer: VerdictCell, width: 96 },
  { headerName: "Quote check", field: "score", cellRenderer: ChecksCell, width: 164 },
  { headerName: "Charged", field: "charged", cellRenderer: AmountCell, width: 136, type: "rightAligned" },
  { headerName: "PayPal capture", field: "capture_id", cellRenderer: CaptureCell, minWidth: 160, flex: 1 },
  { headerName: "Status", field: "capture_status", cellRenderer: StatusCell, width: 128 },
  { headerName: "Time", field: "at", width: 92, valueFormatter: (p) => p.value ? new Date(p.value).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone: "America/New_York" }) : "", cellStyle: { fontFamily: "IBM Plex Mono", fontSize: "12.5px", color: "#44605A" } },
  { headerName: "", colId: "receipt", cellRenderer: ReceiptCell, width: 100, pinned: "right", sortable: false },
];
const slim = [
  { headerName: "Call", field: "label", cellRenderer: MobileCell, flex: 1, autoHeight: true, wrapText: true, minWidth: 140 },
  { headerName: "Charged", field: "charged", cellRenderer: AmountCell, width: 100, type: "rightAligned" },
];
createGrid(host, {
  theme, rowData: calls, columnDefs: narrow ? slim : wide, pinnedBottomRowData: totals,
  domLayout: "autoHeight", defaultColDef: { sortable: true, resizable: !narrow, suppressMovable: true },
  getRowId: (p) => String(p.data.n), suppressCellFocus: true, animateRows: true,
  rowHeight: narrow ? undefined : 56,
});
