# Toll Note v2: what changed from v1, mapped to PR #14

Joe's note on v1: "better than usual but it's a bit much in an odd direction; the max colors don't really match the vibe of the product." v2 keeps the structure and pulls the color back to one accent plus true neutrals.

Recommended: **Option B "Thermal"**. Option A "Carbon Copy" is a token swap away. See `compare-A-vs-B.png`.

## Swap into PR #14 (branch `devin/1762928000-toll-note`, head c791f56)

| PR #14 file | Do this | Why |
|---|---|---|
| `src/app/globals.css` | Replace with `v2/globals.css` | All colors now come from `--tb-*` tokens at the top. The `--tn-*` palette is gone. No TSX reads `--tn-*`, so nothing else needs it. |
| `src/components/ag-grid-theme.ts` | Replace with `v2/ag-grid-theme.ts` | Grid params now read the same `--tb-*` CSS variables, so a token swap restyles the grid too. `tollNoteTheme`, `ledgerColumns`, `totalsRow`, `cleanTitle`, `CAPTURE_STATUS` and `CHECK_LETTERS` keep their names, and a new `onTab()` is added. |
| `src/components/Ledger.tsx` | Replace with `v2/Ledger.proposed.tsx` | Display fix for tab settlement (below). Same props. |
| `src/app/layout.tsx` | `themeColor: "#FFFFFF"` (B) or `"#0B1626"` (A) | Matches the header. Fonts unchanged. |
| Everything else in the PR (HoldMeter, TabApp Booth, Royalties, receipt split, reduced motion) | Keep as is | Every class name is still styled. |

Switching to Option A later: in `globals.css`, replace the block between `BEGIN TOKENS` and `END TOKENS` with `tokens-optionA.css`, then change `themeColor`. Nothing else changes.

Typecheck: `tsc --noEmit` is clean with the v2 `ag-grid-theme.ts` and `Ledger.proposed.tsx` on both PR #14 head (c791f56) and latest main (69f7811). Renders come from the PR #14 branch run locally (`PAYPAL_MODE=fixtures MODEL_MODE=fake`).

## What changed

**Color**
- The banknote-green ground is gone. In B the page is white paper with near-black ink #111315. In A it's a cool desk grey #F3F5F8 with white panels, and navy #0B1626 only on the header band, the grid header and the totals row.
- One accent. B uses highlighter amber #FFC93C as a fill: primary button, nav CTA, DEMO band, and a highlighter stroke under the hero line and under released money. It never appears as text. It also matches the official PayPal gold button, so the page has a single warm accent instead of two. A uses cobalt #2346D6.
- Status colors only carry meaning, on small chips: paid #0A7046 on #E4F4EA, refused #B42318 on #FDECEA. Pending and authorization states are neutral grey chips. The old indigo "held" color is gone, and held/released now uses the accent tint.

**Hold meter (was the multi-color coupon strip)**
- One ruled bar of equal cells with 3px gaps and hairline borders.
- Captured or on tab: solid ink cell with white mono text.
- Running: accent outline with a 2px fill line.
- Released: accent tint with the word VOID in ink.
- Gone: punch-hole dots, rotated VOID stamp, hatching, gold flash animation.
- Rails: thin 2px top rules (ink for captured, accent for released) instead of tinted blocks.

**Ornament**
- Truss logo mark becomes a plain bridge outline (deck plus two piers). The truss divider in setup becomes a hairline. Guilloche waves, the noise and the ledger-paper lines behind the stubs are gone.
- No offset shadows. B has none at all; panels are 1px ink-ruled. A has a soft 1px plus 24px blur shadow.

**Type** (same stack: Archivo, Public Sans, IBM Plex Mono)
- Archivo width drops from 125 to 108 and the hero from weight 900 to 800, a bit smaller (max 72px).
- Panel titles become 13px mono caps.
- All money in the grid and the meter figures uses tabular numbers. Grid amounts are now IBM Plex Mono.

**Closing math**
- Accounting column: captured row in ink, then a 1px rule and a double rule under "Released". The released amount sits on a highlighter stroke. Not charged stays grey, never red.

**AG Grid ledger**
- Same nine columns, pinned # and Receipt, totals row, and phone list mode under 640px.
- Header: mono 11.5px. In B it's white with a 1px ink rule; in A it's navy.
- Totals row has a 3px double rule on top. Row hover is the inset grey, column borders are off and pinned column borders are removed.
- Widths re-tuned for mono figures: Verdict 92, Quote check 172, Charged 136, Status 108, Time 92, Receipt 96. Measured at 1280: all 9 columns, no horizontal scroll (scrollWidth equals clientWidth, 1108px).
- Calls/Royalties switch is a compact segmented control (selected = ink) instead of two full-width buttons on phone.

**Ledger display fix (tab settlement, from main #5/#8)**
- v1 showed a passing call that is owed but not captured yet as struck "$0.50 $0.00", which read like a refusal.
- Now Charged shows "$0.50" (phone adds "on tab"), Capture says "at close", Status is a neutral "On tab" chip, and the phone row says "on tab, captured at close".
- Totals: "3 calls, 2 passed", $1.00, "$1.00 on tab" (or "of $X held" when nothing is owed).
- Display only. It reads `verdict`, `capture_id`, `charge_error` and `price`, which are already on CallView, and writes nothing.

**Kept**
- Type stack, AA, grid structure, phone list mode, released hold shown as money, official PayPal gold buttons, DEMO labels, reduced-motion rule.

## Not touched
- Money path (src/lib/tab, src/lib/paypal, api routes), PayPal button styling beyond `color: "gold"`, any copy.

## Writers site
`v2/writers/writers.css` replaces the v1 drop-in, in the same places, with the same `.lic` data-* attributes from `WRITERS-SPEC.md`:
- The DEMO band keeps its exact text, full width in amber.
- The masthead is white with a double hairline rule.
- Letter tiles are ink-outlined. Status shows only on chips.
- The license slip has its price on a highlighter stroke, red with a red top rule on the prohibited page.
- Checked: visible text (same steps as `htmlToText()`) on a/b/c/d is identical to the live pages. No horizontal scroll at 390 or 1280.
