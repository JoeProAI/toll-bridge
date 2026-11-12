# Contrast, v2 (both options)

Measured with `contrast.py` (WCAG 2.x relative luminance) straight from the hex values in `tokens-optionB.css` and `tokens-optionA.css`. Re-run with `python3 contrast.py`; it rewrites `contrast-table.md`.

Result: **every pair passes AA in both options.** Text pairs need 4.5:1, and the focus ring needs 3:1 as a non-text indicator.

- Lowest text pair in both options: paid green on the paid chip, #0A7046 on #E4F4EA, **5.39:1**.
- Option B never uses amber (#FFC93C) as text. It only appears as a fill behind ink (ink on amber is 12.12:1) or as a bar. Bars and fills like that never carry meaning alone. The selected budget also says "Selected", the released rail has its arrow and text, and the DEMO band text is ink.
- Option A uses cobalt #2346D6 as both text and fill: 7.20:1 on white, and white on cobalt 7.20:1.
- Agent log colors (#8FDDB4 pass, #FFA69B fail) are checked against each option's code background.

## Option B · Thermal (recommended)

| Pair | FG | BG | Ratio | Needs | Result |
|---|---|---|---|---|---|
| Body ink on paper | #111315 | #FFFFFF | 18.62:1 | 4.5:1 | PASS |
| Body ink on page | #111315 | #FFFFFF | 18.62:1 | 4.5:1 | PASS |
| Secondary ink on paper | #555A60 | #FFFFFF | 6.96:1 | 4.5:1 | PASS |
| Secondary ink on page | #555A60 | #FFFFFF | 6.96:1 | 4.5:1 | PASS |
| Secondary ink on zebra/inset | #555A60 | #F4F5F6 | 6.38:1 | 4.5:1 | PASS |
| Ink on zebra/inset | #111315 | #F4F5F6 | 17.06:1 | 4.5:1 | PASS |
| Header text on header | #111315 | #FFFFFF | 18.62:1 | 4.5:1 | PASS |
| Header nav/secondary on header | #555A60 | #FFFFFF | 6.96:1 | 4.5:1 | PASS |
| Grid totals row text | #111315 | #FFFFFF | 18.62:1 | 4.5:1 | PASS |
| Grid totals sub text | #555A60 | #FFFFFF | 6.96:1 | 4.5:1 | PASS |
| Button label on accent | #111315 | #FFC93C | 12.12:1 | 4.5:1 | PASS |
| Button label on accent hover | #111315 | #FFD86E | 13.57:1 | 4.5:1 | PASS |
| Accent as text on paper (links, focus) | #111315 | #FFFFFF | 18.62:1 | 4.5:1 | PASS |
| Accent text on page | #111315 | #FFFFFF | 18.62:1 | 4.5:1 | PASS |
| Hero emphasis on page | #111315 | #FFFFFF | 18.62:1 | 4.5:1 | PASS |
| Ink on highlighter | #111315 | #FFC93C | 12.12:1 | 4.5:1 | PASS |
| Ink on accent tint (held chip, released) | #111315 | #FFF3CC | 16.80:1 | 4.5:1 | PASS |
| Paid on paid chip | #0A7046 | #E4F4EA | 5.39:1 | 4.5:1 | PASS |
| Refused on refused chip | #B42318 | #FDECEA | 5.75:1 | 4.5:1 | PASS |
| Pending on pending chip | #555A60 | #EFF0F2 | 6.10:1 | 4.5:1 | PASS |
| Refused text on paper | #B42318 | #FFFFFF | 6.57:1 | 4.5:1 | PASS |
| Paid text on paper | #0A7046 | #FFFFFF | 6.14:1 | 4.5:1 | PASS |
| Code text on code bg | #DADDE1 | #16181B | 13.05:1 | 4.5:1 | PASS |
| Code dim/notes on code bg | #979CA3 | #16181B | 6.44:1 | 4.5:1 | PASS |
| Log pass #8FDDB4 on code bg | #8FDDB4 | #16181B | 11.16:1 | 4.5:1 | PASS |
| Log fail #FFA69B on code bg | #FFA69B | #16181B | 9.47:1 | 4.5:1 | PASS |
| White on ink (captured block, done step, selected tab) | #FFFFFF | #111315 | 18.62:1 | 4.5:1 | PASS |
| White on refused (bad step dot) | #FFFFFF | #B42318 | 6.57:1 | 4.5:1 | PASS |

## Option A · Carbon Copy

| Pair | FG | BG | Ratio | Needs | Result |
|---|---|---|---|---|---|
| Body ink on paper | #0B1626 | #FFFFFF | 18.15:1 | 4.5:1 | PASS |
| Body ink on page | #0B1626 | #F3F5F8 | 16.62:1 | 4.5:1 | PASS |
| Secondary ink on paper | #4B5768 | #FFFFFF | 7.34:1 | 4.5:1 | PASS |
| Secondary ink on page | #4B5768 | #F3F5F8 | 6.72:1 | 4.5:1 | PASS |
| Secondary ink on zebra/inset | #4B5768 | #F6F8FA | 6.89:1 | 4.5:1 | PASS |
| Ink on zebra/inset | #0B1626 | #F6F8FA | 17.05:1 | 4.5:1 | PASS |
| Header text on header | #FFFFFF | #0B1626 | 18.15:1 | 4.5:1 | PASS |
| Header nav/secondary on header | #B4BFCE | #0B1626 | 9.75:1 | 4.5:1 | PASS |
| Grid totals row text | #FFFFFF | #0B1626 | 18.15:1 | 4.5:1 | PASS |
| Grid totals sub text | #B4BFCE | #0B1626 | 9.75:1 | 4.5:1 | PASS |
| Button label on accent | #FFFFFF | #2346D6 | 7.20:1 | 4.5:1 | PASS |
| Button label on accent hover | #FFFFFF | #1B37AE | 9.53:1 | 4.5:1 | PASS |
| Accent as text on paper (links, focus) | #2346D6 | #FFFFFF | 7.20:1 | 4.5:1 | PASS |
| Accent text on page | #2346D6 | #F3F5F8 | 6.59:1 | 4.5:1 | PASS |
| Hero emphasis on page | #2346D6 | #F3F5F8 | 6.59:1 | 4.5:1 | PASS |
| Ink on highlighter | #0B1626 | #E3E9FC | 14.98:1 | 4.5:1 | PASS |
| Ink on accent tint (held chip, released) | #0B1626 | #EBEFFD | 15.81:1 | 4.5:1 | PASS |
| Paid on paid chip | #0A7046 | #E4F4EA | 5.39:1 | 4.5:1 | PASS |
| Refused on refused chip | #B42318 | #FDECEA | 5.75:1 | 4.5:1 | PASS |
| Pending on pending chip | #4B5768 | #EEF1F5 | 6.48:1 | 4.5:1 | PASS |
| Refused text on paper | #B42318 | #FFFFFF | 6.57:1 | 4.5:1 | PASS |
| Paid text on paper | #0A7046 | #FFFFFF | 6.14:1 | 4.5:1 | PASS |
| Code text on code bg | #D3DCE8 | #0B1626 | 13.11:1 | 4.5:1 | PASS |
| Code dim/notes on code bg | #8D9AAE | #0B1626 | 6.37:1 | 4.5:1 | PASS |
| Log pass #8FDDB4 on code bg | #8FDDB4 | #0B1626 | 11.38:1 | 4.5:1 | PASS |
| Log fail #FFA69B on code bg | #FFA69B | #0B1626 | 9.66:1 | 4.5:1 | PASS |
| White on ink (captured block, done step, selected tab) | #FFFFFF | #0B1626 | 18.15:1 | 4.5:1 | PASS |
| White on refused (bad step dot) | #FFFFFF | #B42318 | 6.57:1 | 4.5:1 | PASS |
