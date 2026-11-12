"""WCAG 2.x contrast for every text/background pair the v2 CSS uses, both options."""
import re, sys
def tok(path):
    return {k: v.upper() for k, v in re.findall(r'--tb-([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})', open(path).read())}
def lum(h):
    r, g, b = (int(h[i:i+2], 16) / 255 for i in (1, 3, 5))
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)
# (label, fg token or hex, bg token or hex, minimum)
PAIRS = [
 ("Body ink on paper", "ink", "surface", 4.5), ("Body ink on page", "ink", "bg", 4.5),
 ("Secondary ink on paper", "ink-2", "surface", 4.5), ("Secondary ink on page", "ink-2", "bg", 4.5),
 ("Secondary ink on zebra/inset", "ink-2", "surface-2", 4.5), ("Ink on zebra/inset", "ink", "surface-2", 4.5),
 ("Header text on header", "head-fg", "head-bg", 4.5), ("Header nav/secondary on header", "head-fg-2", "head-bg", 4.5),
 ("Grid totals row text", "head-fg", "head-bg", 4.5), ("Grid totals sub text", "head-fg-2", "head-bg", 4.5),
 ("Button label on accent", "accent-fg", "accent", 4.5), ("Button label on accent hover", "accent-fg", "accent-hover", 4.5),
 ("Accent as text on paper (links, focus)", "accent-text", "surface", 4.5), ("Accent text on page", "accent-text", "bg", 4.5),
 ("Hero emphasis on page", "em-fg", "bg", 4.5), ("Ink on highlighter", "ink", "mark-bg", 4.5),
 ("Ink on accent tint (held chip, released)", "ink", "accent-tint", 4.5),
 ("Paid on paid chip", "paid", "paid-bg", 4.5), ("Refused on refused chip", "refused", "refused-bg", 4.5),
 ("Pending on pending chip", "pending", "pending-bg", 4.5), ("Refused text on paper", "refused", "surface", 4.5),
 ("Paid text on paper", "paid", "surface", 4.5),
 ("Code text on code bg", "code-fg", "code-bg", 4.5), ("Code dim/notes on code bg", "code-dim", "code-bg", 4.5),
 ("Log pass #8FDDB4 on code bg", "#8FDDB4", "code-bg", 4.5), ("Log fail #FFA69B on code bg", "#FFA69B", "code-bg", 4.5),
 ("White on ink (captured block, done step, selected tab)", "#FFFFFF", "ink", 4.5),
 ("White on refused (bad step dot)", "#FFFFFF", "refused", 4.5),
]
def run(path, name):
    t = tok(path); rows = []; ok = True
    g = lambda x: x.upper() if x.startswith('#') else t[x]
    for label, f, b, m in PAIRS:
        r = ratio(g(f), g(b)); p = r >= m; ok &= p
        rows.append(f"| {label} | {g(f)} | {g(b)} | {r:.2f}:1 | {m}:1 | {'PASS' if p else 'FAIL'} |")
    return ok, rows
if __name__ == "__main__":
    out = []
    for path, name in [("tokens-optionB.css", "Option B · Thermal (recommended)"), ("tokens-optionA.css", "Option A · Carbon Copy")]:
        ok, rows = run(path, name)
        out += [f"## {name}", "", "| Pair | FG | BG | Ratio | Needs | Result |", "|---|---|---|---|---|---|", *rows, ""]
        print(name, "ALL PASS" if ok else "HAS FAILS")
    open("contrast-table.md", "w").write("\n".join(out))  # CONTRAST.md embeds this table
