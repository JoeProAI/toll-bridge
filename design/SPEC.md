# Toll Bridge design pass: "Toll Note"

For Devin (session ec7590b8). Styling and display only. Nothing here changes how money moves.
Prepared by Scriptorium, Nov 11, 2026. Repo state read: `main` at `bab846d` (UI files unchanged since `c3190b2`).

## 0. Do this first (2 to 3 hours, in order)

| # | Task | Files | Time | Risk |
|---|---|---|---|---|
| M1 | Replace `src/app/globals.css` with `globals.toll-note.css` from this folder. Every class name the TSX uses is kept, so this alone restyles the whole app. | `src/app/globals.css` | 10 min | None. CSS only. |
| M2 | Swap fonts and theme color in the layout (code in section 3). | `src/app/layout.tsx` | 5 min | None. |
| M3 | Ledger: copy `ag-grid-theme.ts` and `Ledger.proposed.tsx` into `src/components/` (rename the second to `Ledger.tsx`). In `TabApp.tsx` change `<Ledger calls={view.calls} />` to `<Ledger calls={view.calls} held={view.tab.held} />`. | `src/components/Ledger.tsx`, new `src/components/ag-grid-theme.ts`, one prop in `TabApp.tsx` | 20 min | Display only. Typechecked against `bab846d`. |
| M4 | PayPal button: change only the `style` object to `{ layout: "vertical", shape: "rect", color: "gold", label: "paypal", height: 48 }`. Do not touch `createOrder`, `onApprove`, `onCancel`, `onError`. | `src/components/PayPalApprove.tsx` line 34 | 2 min | None if only `style` changes. |
| M5 | Landing copy for writers, only if the payout path is live by demo time (section 5.1). Static JSX. | `src/app/page.tsx` | 20 min | Do not claim payouts in copy until they work. |
| M6 | Run the acceptance checklist (section 10) at 390 and 1280. | | 20 min | |

Proof that M1 to M3 work: `port-preview/` holds screenshots of the real app (latest `main`, fixtures mode, run locally in a scratch copy) with only those three changes. Compare `before/local-*.png` with `port-preview/port-*.png`, or open `mockups/pairs/pair-10-port-preview-1280.png`.

Nice to have, in value order (each 15 to 45 min, all display only):
1. N1 HoldMeter banknote header: big `$2.00` denomination plus `AUTH ... · ORDER ...` line above the figures (section 5.3). `src/components/HoldMeter.tsx`, JSX only, no math changes.
2. N2 Quote check booth: the 4-step strip (Quote, Run, Quote check, PayPal) under the agent buttons, fed by existing `stage` and `last` state. `src/components/TabApp.tsx` `AgentPanel`.
3. N3 Human status labels: `PARTIALLY_CAPTURED` shows as "Partially captured" in `.ids` and the receipt. Display formatting only.
4. N4 Writer royalties panel on the closed tab, once Devin's payout data exists (section 5.5). Sample in `mockups/payouts-1280-fold.png`.
5. N5 Receipt sections ("The answer" and "PayPal, read back just now") and check pips (section 5.6).
6. N6 Landing "For writers" flow list (section 5.1).

## 1. Off limits (money path)

Do not edit for design reasons: `src/lib/**`, `src/server/**`, `src/app/api/**`, `scripts/**`, `tests/**`.
In components, leave these exactly as they are: `TabApp.tsx` functions `boot`, `refresh`, `runOne`, `sendOne`, `runDemo`, `closeTab`, `onClaimed`; `PayPalApprove.tsx` everything except the `style` prop; `HoldMeter.tsx` math (`slots`, `bitten`, `remaining`, `passed`, `failed`, the `label` string). Ledger changes read existing `CallView` fields only and add no data fields.

## 2. Direction

**Toll Note.** The hold is drawn as a banknote cut into toll coupons. Ground is banknote intaglio green with fine engraved wave lines. Panels are white ticket stock with perforated, dashed edges. Toll gold is the one hot accent: primary actions, key totals, the gold rule under the ledger header. Bridge ironwork shows up as a Warren truss in the logo and as a divider. Trustworthy money, ledger books, toll tickets. No neon, no gradients, no pink, no beige.

**Signature element:** the coupon strip. Each $0.50 toll is a coupon with a serial (TOLL 01, 02...). Paid coupons fill green and carry the PayPal capture id with a punched gold hole. A coupon being quoted turns gold. Void coupons get indigo hatching and a double-rule VOID stamp. Failed calls never touch the strip: they land as red dashed "$0.00 not charged" tickets underneath. The same language carries to the ledger (status chips), the receipt (torn ticket edge) and the writers site (license ticket).

Why it fixes the old look: the Riso lime, fluoro pink and plum read as a party flyer, which fights a product asking people to trust it with a PayPal hold. Pink-on-lime headings measure 3.00:1. Green, white and gold read as money at a glance and stay loud through area and scale, not glow.

## 3. Tokens

All CSS variables live in `tokens.css` (also inlined at the top of `globals.toll-note.css`).

### Palette (single theme)
The app has no dark mode today. This direction already sits on a deep ground, so no light/dark toggle is added.

| Role | Token | Hex |
|---|---|---|
| Page ground | `--tn-green-800` | `#0B3B2D` |
| Deep ground, console, totals row | `--tn-green-950` / `--tn-green-900` | `#04211A` / `#072B21` |
| Raised on ground | `--tn-green-700` | `#11523F` |
| Engraving lines, borders on ground | `--tn-green-600` | `#1A6B52` |
| Muted text on ground | `--tn-green-300` | `#A9D3C0` |
| Selected input tint | `--tn-green-100` | `#E3F1EA` |
| Toll gold (accent, CTA, focus on green) | `--tn-gold-500` | `#F2B33D` |
| Gold hover, gold text on ground | `--tn-gold-300` | `#FFD781` |
| Ticket stock (panels) | `--tn-paper` | `#FFFFFF` |
| Ledger odd row | `--tn-paper-2` | `#F2F7F4` |
| Ink | `--tn-ink` | `#0A231C` |
| Secondary ink | `--tn-ink-2` | `#44605A` |
| Ledger rule | `--tn-rule` | `#C9DDD3` |

### Money semantics
Always color plus word plus shape, never color alone.

| State | Text | Chip bg | Shape | Words |
|---|---|---|---|---|
| Paid (captured, royalty sent) | `#0A7046` | `#DCF2E5` | filled dot | Captured, Pass, Payout sent |
| Held (authorized, voided back) | `#2A3BAE` | `#E4E8FF` | ring; hatching when void | Held, Partially captured, Voided |
| Refused (failed quote check, not charged) | `#B42318` | `#FDE8E5` | x mark; dashed ticket | Fail, Not charged, Refused by license |
| Pending payout (royalty owed) | `#6E4700` | `#FFF1CC` | dashed ring | Payout queued |

Chips are `.st .st-paid|.st-held|.st-refused|.st-pending` (in `globals.toll-note.css`). The old `.status-*` classes map onto the same colors.

### Type (all OFL, Google Fonts)
- Display: **Archivo** variable, width 112 to 125, weight 800 to 900. Headlines, amounts, panel titles, stamps.
- Body: **Public Sans** 400 to 700.
- Mono: **IBM Plex Mono** 400/500/600. PayPal ids, quote ids, console, chips.

```tsx
// src/app/layout.tsx
import { Archivo, IBM_Plex_Mono, Public_Sans } from "next/font/google";
const display = Archivo({ variable: "--font-display", subsets: ["latin"], axes: ["wdth"] });
const body = Public_Sans({ variable: "--font-body", subsets: ["latin"] });
const mono = IBM_Plex_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500", "600"] });
export const viewport: Viewport = { themeColor: "#0B3B2D" };
```
Scale: 12 / 14 / 16 / 19 / 26 px, section `clamp(34px, 4.4vw, 56px)`, hero `clamp(40px, 6.6vw, 88px)` at line-height 0.92. Amounts always `font-variant-numeric: tabular-nums`.

### Spacing, radius, depth
4px base: 4, 8, 12, 16, 24, 32, 48, 64. Page pad `clamp(16px, 3.2vw, 40px)`, max width 1240.
Radius 2px (buttons, chips), 4px (panels). Tickets are cut, not pillowed.
One depth language: `0 2px 0 rgba(4,33,26,.25), 0 10px 24px -12px rgba(4,33,26,.55)` on panels, a larger version on the hero note. No glow.

### Tailwind (only if Devin adds Tailwind later; the app uses plain CSS today)
```js
// tailwind.config.js theme.extend
colors: { note: { 950: "#04211A", 900: "#072B21", 800: "#0B3B2D", 700: "#11523F", 600: "#1A6B52", 300: "#A9D3C0", 100: "#E3F1EA" },
  gold: { 500: "#F2B33D", 300: "#FFD781", 100: "#FFF1CC", 800: "#6E4700" }, ink: { DEFAULT: "#0A231C", 2: "#44605A" },
  paid: { DEFAULT: "#0A7046", bg: "#DCF2E5" }, held: { DEFAULT: "#2A3BAE", bg: "#E4E8FF" }, refused: { DEFAULT: "#B42318", bg: "#FDE8E5" }, pending: { DEFAULT: "#6E4700", bg: "#FFF1CC" } },
fontFamily: { display: ["var(--font-display)", "Archivo", "sans-serif"], body: ["var(--font-body)", "Public Sans", "sans-serif"], mono: ["var(--font-mono)", "IBM Plex Mono", "monospace"] },
borderRadius: { sm: "2px", md: "4px" },
```

## 4. Motion
- One orchestrated moment per action, all transform/opacity/background: coupon punch (gold flash to green, 500ms) on capture, bounce ticket drops in (600ms) on a failed check, void hatching fades in left to right (70ms stagger) on close, busy button stripes march while a call runs.
- No looping decoration. The only loop is the in-flight coupon's dashed ring and the busy stripes, both stop when idle.
- `prefers-reduced-motion: reduce` sets all animation and transition durations to near zero (already in `globals.toll-note.css`). The replay on the landing should also pause itself under reduced motion (N-level: one line in `LandingReplay.tsx`, `matchMedia`).

## 5. Screens

### 5.1 Landing `/` (`src/app/page.tsx`, `LandingReplay.tsx`)
- Header: truss mark + "TOLL BRIDGE" (BRIDGE in gold), gold "Open a tab" button. CSS only (`.mark::before` draws the truss).
- Hero: two columns at >=900px. Left: gold kicker line, headline "Give your agent a tab, **not your card.**" with the second line in gold, lede, gold primary + outlined secondary. Right: the replay note, white with a double frame, rotated 1.2deg, overlapping a faint engraved rosette (`design/src/assets/rosette.svg`, optional as a `.hero::before` background at 55% opacity).
- "Three PayPal calls": full-bleed white ledger band (ruled lines every 32px), the three steps as ONE joined ticket strip with dashed tear lines, colored indigo-tint / green / gold. Replaces three floating cards. CSS only via `.stubs`, `.stub-row`, `.stub-pink`, `.stub-cobalt`.
- Heading copy proposal: "Three PayPal calls. You only pay for checked work." (current "Zero trust needed" overpromises; optional).
- "For writers" (M5/N6, only when payouts work): heading "Quoted? You get paid.", one paragraph about RSL, and a 3-row flow list (Captured $0.50, Payout queued $0.05, Refused $0.00). Mockup: `mockups/hero-1280.png` and `renders/landing-1280.png`. Label sample rows as sample if they are not live data.
- Lede proposal if payouts ship: "Approve one PayPal hold. Your agent pays per answer out of it, and PayPal captures a toll only when the answer passes its quote check. Writers whose pages were quoted get paid through PayPal Payouts. The rest of the hold is voided when the tab closes."
- Fixes the phone overflow: today the "For agents" panels are 506px wide on a 390px screen and get clipped (`.agent-cols` used `1fr`, which lets `<pre>` set the min width). New CSS uses `minmax(0,1fr)` and `max-width:100%` on `.code`.

### 5.2 Setup `/tab` before a hold (`TabApp.tsx` `Setup`)
- Budget choices become one joined ticket strip; selected is solid gold with a "SELECTED" tag. Stacked vertically under 560px.
- Tool line sits under a gold truss rule. PayPal panel is white; PayPal gold button (M4) at full panel width up to 420px (`.pp-live`).
- Fixtures note is gold-tint with a gold left rule. See `port-preview/port-tab-setup-fixtures-1280.png`.

### 5.3 Open tab (`TabApp.tsx` run-top, `HoldMeter.tsx`)
- Left panel "The hold": figures row (Held / Captured in paid green / Left in held indigo) on ledger rules, then the coupon strip, then bounce tickets, then rails (captured rail green, void rail indigo).
- N1 banknote header (JSX only, inside `<figure className="meter">` before `.meter-figures`):
```tsx
<div className="note-top"><span className="fig-k">PayPal hold · Orders v2 AUTHORIZE</span></div>
<div className="note-amt"><small>$</small>{money(heldCents)}</div>
```
  with CSS from `src/toll-note.css` (`.note-amt`, `.note-top`). Pass ids in if wanted; they are already shown in `.ids` below.
- Right panel "Agent": input choices as tickets (selected = green tint + dot), actions (primary green, demo gold, close outlined), busy state = marching stripes on the busy button with live label.
- N2 quote check booth (under actions, above console): header `CALL 03 · <label>` + status chip; 4 cells Quote (402, price, quote id, left on hold), Run (model, attempt n of m), Quote check (x of 5 + check chips), PayPal (capture id or "No capture" + reason). Data: `stage` for the live step, `last.call` for the finished one. 2x2 under 900px.
- Console: deep green, arrows for out/in, `$` for pass, `×` for fail.
- Mockup: `mockups/tab-1280-fold.png`, `renders/tab-390.png`, `renders/tab-320.png`.

### 5.4 Last result card (`ResultCard`, `BriefView`)
- Title "Last result: bounced" + double-rule stamp. Check chips: pass green, fail red struck through. Reasons in refused red. Quotes get a gold left rule; on a failed result the rule turns red.
- Optional: two-column layout at >=900px with a "Why it bounced" box on the right (mockup `renders/tab-1280.png`).

### 5.5 Tab closed (`Summary`) and writer royalties (N4)
- The math: Held, Captured (paid green, with capture ids under the label), a 2px ink rule, Voided (indigo), then "Not charged for 1 failed call" in secondary ink with "would have cost 0.50, never captured". Today that row is red and reads like a loss.
- Writer royalties panel (when payout data exists): header figures (Owed to writers, Payout batch id, Writers paid x of y, Refused at $0.00), then one ticket per writer: letter tile, page title, writer + license terms in mono, `$0.05 × n quotes`, status chip (Payout sent / Payout queued / Refused by license / Failed quote check). Mockup `mockups/payouts-1280-fold.png` uses the four demo writers and is labeled sample.

### 5.6 Receipt `/receipt/[id]`
- Torn ticket: scalloped top and bottom edges (CSS `.receipt::before/::after`), kicker, huge "Paid $0.50", double-rule VERIFIED stamp top right (static under 560px).
- N5: split rows into "The answer" (verdict chip + judge score, check pips S P G C J, model, time) and "PayPal, read back just now" (capture + status chip, amount + final_capture, authorization, order, invoice). Mockup `renders/receipt-1280.png`, `mockups/receipt-390-fold.png`.

### 5.7 Empty, loading, error
- Empty ledger: dashed green border on ledger-row tint, "No calls yet." in display type. Loading: green shimmer skeletons on the ground, paper shimmer for the grid. Error banner: refused tint with a red left rule. `/open/return` and the missing-receipt page use `.panel.error-block` and pick this up from CSS.

## 6. Component map

| File | Change | Must / Nice |
|---|---|---|
| `src/app/globals.css` | Replace with `globals.toll-note.css` | Must |
| `src/app/layout.tsx` | Fonts + themeColor (section 3) | Must |
| `src/components/Ledger.tsx` | Replace with `Ledger.proposed.tsx` | Must |
| `src/components/ag-grid-theme.ts` | New file from this folder | Must |
| `src/components/TabApp.tsx` | `held` prop on `<Ledger>` | Must |
| `src/components/PayPalApprove.tsx` | `style.color: "gold"` only | Must |
| `src/app/page.tsx` | Writers copy + flow list, heading copy | Must if payouts ship, else skip |
| `src/components/HoldMeter.tsx` | Banknote header JSX (N1) | Nice |
| `src/components/TabApp.tsx` `AgentPanel` | Quote check booth (N2) | Nice |
| `src/components/TabApp.tsx` `.ids`, receipt page | Human status labels (N3) | Nice |
| `src/components/TabApp.tsx` `Summary` | Royalties panel (N4) | Nice, needs payout data |
| `src/app/receipt/[id]/page.tsx` | Sections + pips (N5) | Nice |
| `src/components/LandingReplay.tsx` | Pause under reduced motion | Nice |

## 7. AG Grid ledger (the AG Grid prize piece)

Code: `ag-grid-theme.ts` (theme, formatters, column sets, totals) and `Ledger.proposed.tsx` (React cell renderers). ag-grid-community 36.3.0, Theming API `themeQuartz.withParams`. The mockup grid in `src/tab.html` runs the real 36.3.0 UMD build from jsDelivr with the same params and renderers, with zero console warnings.

- Theme: white cells on ink, banknote-green header with white Archivo caps and a 3px gold rule under it, ledger-tint odd rows, gold-100 row hover, indigo focus ring, 1.5px green wrapper at 4px radius, 56px rows.
- Columns (>=640px container): `#` (pinned left, mono) · Call (cleaned title, tool and quote id in mono below; tooltip) · Verdict chip · Quote check pips S P G C J plus judge score · Charged (right aligned tabular, `$0.50`, or struck `$0.50` then red `$0.00`) · PayPal capture (indigo mono link to the receipt, or "none, not captured") · Status chip (COMPLETED shows "Captured") · Time (24h, mono) · Receipt link (pinned right).
- Pinned bottom totals row: banknote green with a gold top rule. "3 calls, 2 paid", total charged in gold, "of $2.00 held".
- Under 640px: two columns. Call cell auto-height with title, capture id or reason, and verdict chip, and the whole cell links to the receipt. Charged shows `$0.00` with "not charged" under it. Today at 390px only `#` and Source are visible and Verdict and Charged are off screen.
- Title cleanup: `cleanTitle()` collapses the raw "Accept all | Manage preferences\n\nFLASH SALE..." into one line for display only.
- Optional Royalty column once payout fields exist: `$0.05` in gold-800 with a `.st-pending` or `.st-paid` chip, `$0.00` with `.st-refused` when the license refuses.

## 8. PayPal brand
- Keep PayPal's own Smart Buttons from the JS SDK. Do not redraw, recolor or re-type the PayPal logo or wordmark, do not put it in our fonts, and do not imitate PayPal buttons with our `.btn` styles.
- PayPal recommends `color: "gold"` (first choice), then `blue`, then `silver`, `white` or `black`, and `label: "paypal"` with `shape: "rect"` ([PayPal JS SDK reference, style options](https://developer.paypal.com/sdk/js/v5/reference)). The button's look is controlled inside PayPal's iframe, so only those style options apply.
- Gold sits on a white panel here, so it stays clear of the green ground and works next to our toll gold.
- Write "PayPal" as plain text in copy. Do not imply PayPal endorses Toll Bridge. Keep "PayPal sandbox only. No real money moves." in the footer.

## 9. Contrast
All 38 specified text/background pairs pass AA. Full table in `CONTRAST.md` (generated by `contrast.py`). Lowest body pair: paid `#0A7046` on paid chip `#DCF2E5` at 5.23:1. Focus rings: gold on ground 6.73:1, indigo on paper 8.99:1.

## 10. Acceptance checklist
- [ ] No horizontal scroll at 320, 390, 1280 on `/`, `/tab` (setup, open, closed), `/receipt/[id]`. Check `document.documentElement.scrollWidth === innerWidth`.
- [ ] No lime, pink or plum anywhere (search globals for `#d4ff3f`, `#ff2e93`, `#2b0a3d`: zero hits).
- [ ] Ledger at 390 shows Call, verdict and Charged for every row, and the totals row.
- [ ] Ledger at 1280 shows all 9 columns without horizontal scroll inside a 1240px layout.
- [ ] Every money state shows a word and a shape, not color alone (chips, coupons, bounce tickets).
- [ ] PayPal button renders gold and unmodified, and the approve flow works exactly as before.
- [ ] Keyboard: tab through header, budgets, PayPal, agent inputs, buttons, ledger links. Focus ring visible on green (gold) and on white (indigo).
- [ ] Reduced motion: no marching stripes, no coupon punch, replay paused or static.
- [ ] `npm run typecheck`, `npm test`, `npm run proof` still pass (no logic touched).
- [ ] Fonts load: Archivo headlines, Public Sans body, IBM Plex Mono ids.

## 11. What is in this folder
- `SPEC.md` (this), `WRITERS-SPEC.md`, `CONTRAST.md`, `contrast.py`
- `tokens.css`, `globals.toll-note.css` (drop-in), `ag-grid-theme.ts`, `Ledger.proposed.tsx`
- `src/` mockup HTML/CSS/JS (`landing.html`, `tab.html` with the real AG Grid, `payouts.html`, `receipt.html`, `writers.html`, `writer-a.html`, `writer-d.html`, `toll-note.css`, `ledger.js`, `assets/`), plus `build.py` and `make_sheets.py`
- `renders/` full-page renders at 1280, 390 (and 320 for landing and tab), plus `writers-live-*` (live writer pages restyled with the drop-in CSS)
- `mockups/` key screens and `mockups/pairs/` before/after pairs
- `before/` current state: live preview (`app-*`), latest main run locally in fixtures mode (`local-*`), writers site (`writers-*`)
- `port-preview/` real app with only M1 to M3 applied
- `writers/` drop-in CSS and new `index.html` for the writers repo, plus `*.restyled.html` previews
- `contact-sheet.png`
