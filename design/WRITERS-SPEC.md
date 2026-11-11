# Writers demo site: "Toll Note" kin

Repo: `JoeProAI/toll-bridge-writers` (GitHub Pages, static HTML). Live: https://joeproai.github.io/toll-bridge-writers/
Time: about 30 minutes. Styling only.

## The one rule: do not change article text
The app reads these pages as quote sources. `htmlToText()` in `src/lib/tools/source.ts` drops `<head>`, `<style>`, `<script>` and all tags, then keeps every visible word. Any new visible text on `a.html` to `d.html` changes the source the agent quotes and can shift spans and break the demo or the fixtures in `tests/fixtures/rsl/live/`. So on article pages:
- Change only the `<style>` block and add `data-*` attributes on the `.lic` div.
- Keep the DEMO band text exactly as it is, on every page.
- Keep the hidden prompt-injection paragraph in `d.html` exactly as it is, inline style included.
- Keep `<link rel="license" ...>` in `<head>`.

I checked this: the four `writers/*.restyled.html` previews (the live pages with the new style block and attributes) produce text identical to the live pages under the same steps as `htmlToText()`.

## Changes

### a.html, b.html, c.html, d.html
1. Replace the contents of `<style>` with `writers/writers.css`.
2. On the `<div class="lic">` add:

| Page | Attributes |
|---|---|
| a.html | `data-price="$0.05" data-terms="per verified use, USD"` |
| b.html | `data-price="$0.05" data-terms="per verified use, USD"` |
| c.html | `data-price="$0.00" data-terms="all AI use prohibited" data-tone="no"` |
| d.html | `data-price="$0.05" data-terms="per verified use, USD" data-tone="warn"` |

CSS draws these into a license ticket (green header, big gold price, dashed tear line) through `attr()`, so no new text enters the page source. At 860px and wider the ticket sits in a sticky right column; below that it follows the article.

### index.html
Not a quote source, so it can change freely. Replace it with `writers/index.html`: gold DEMO band (same text), green masthead with the intro paragraph, a rate board of the four writers (letter tile, title, byline, license link, price, status chip: Pays per use / Prohibits all AI use / Hides a prompt injection), the payee block section with a code sample, and the fine print. The old list used em dashes; the new one does not.

## Look
- Ground stays white (pure `#FFFFFF`, not the old `#fbf8f1` cream). This is the publisher side: reading comfort first, color in the bands and tickets.
- DEMO band: full-bleed toll gold `#F2B33D`, ink text, 3px ink rule under it. Louder than today and still the same words.
- Type: Archivo (headlines, wide), Source Serif 4 (article body, 18px/1.65), IBM Plex Mono (byline, license, notes). All OFL on Google Fonts.
- Demo notes on c and d ("This writer's license prohibits..." is plain text on c and stays plain; the "Demo note:" paragraph on d gets a gold-tint callout through `p:has(> strong:first-child)`).
- Colors and contrast match the app: link indigo `#2A3BAE` on white 8.99:1, ink on gold band 8.89:1, white on refused tile 6.57:1. Full table in `CONTRAST.md`.

## Acceptance
- [ ] DEMO band visible at the top of every page, text unchanged.
- [ ] Article text identical to before (diff the visible text, or run the app's `npm run proof` / RSL tests against the pages).
- [ ] d.html hidden paragraph still off-screen and still in the HTML.
- [ ] No horizontal scroll at 390 and 1280 (checked on the previews).
- [ ] License ticket shows the right price on each page, red on c, gold on d.

Previews: `renders/writers-live-index-1280.png`, `renders/writers-live-a-1280.png`, `renders/writers-live-c-390.png`, `renders/writers-live-d-1280.png` (and the 390 versions).
