# WCAG 2.x contrast for every text/background pair in the Toll Note spec.
# Run: python3 contrast.py > CONTRAST.md
def L(h):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda c: c/12.92 if c<=0.04045 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
def cr(a,b):
    la,lb=sorted([L(a),L(b)],reverse=True); return (la+0.05)/(lb+0.05)
P=[("Body text on paper","#0A231C","#FFFFFF","body"),("Muted text on paper","#44605A","#FFFFFF","body"),("Muted text on ledger odd row","#44605A","#F2F7F4","body"),
("White on green ground","#FFFFFF","#0B3B2D","body"),("Lede/nav on ground","#E3F1EA","#0B3B2D","body"),("Muted on ground","#A9D3C0","#0B3B2D","body"),("Muted on raised panel","#A9D3C0","#11523F","body"),
("Gold display on ground (large text)","#F2B33D","#0B3B2D","large"),("Gold-300 caps on ground","#FFD781","#0B3B2D","body"),("Ink on gold button","#0A231C","#F2B33D","body"),("Ink on gold hover","#0A231C","#FFD781","body"),
("White on ink button / grid header","#FFFFFF","#0B3B2D","body"),("Pinned total gold on green-900","#F2B33D","#072B21","body"),("Pinned total text on green-900","#E3F1EA","#072B21","body"),
("Paid on paid chip","#0A7046","#DCF2E5","body"),("Paid on paper","#0A7046","#FFFFFF","body"),("Held on held chip","#2A3BAE","#E4E8FF","body"),("Held / link on paper","#2A3BAE","#FFFFFF","body"),
("Refused on refused chip","#B42318","#FDE8E5","body"),("Refused on paper","#B42318","#FFFFFF","body"),("Pending on pending chip","#6E4700","#FFF1CC","body"),("Pending on paper","#6E4700","#FFFFFF","body"),
("Console text on green-950","#CFE3D9","#04211A","body"),("Console pass","#7FE3B0","#04211A","body"),("Console fail","#FF9C8F","#04211A","body"),("Console note","#86A99A","#04211A","body"),
("Row hover: ink on gold-100","#0A231C","#FFF1CC","body"),("Paid coupon label gold-300 on green","#FFD781","#0B3B2D","body"),("Void coupon held on held-bg","#2A3BAE","#E4E8FF","body"),
("Flow chip paid on green-900","#7FE3B0","#072B21","body"),("Flow chip pending on green-900","#FFD781","#072B21","body"),("Flow chip refused on green-900","#FF9C8F","#072B21","body"),
("White on refused tile","#FFFFFF","#B42318","body"),("Writers: DEMO band ink on gold","#0A231C","#F2B33D","body"),("Writers: link on white","#2A3BAE","#FFFFFF","body"),("Writers: gold-300 link on mast","#FFD781","#0B3B2D","body"),
("Focus ring gold vs ground (non-text 3:1)","#F2B33D","#0B3B2D","ui"),("Focus ring indigo vs paper (non-text 3:1)","#2A3BAE","#FFFFFF","ui")]
print("# Contrast, Toll Note\n\nWCAG 2.x relative luminance. Body text needs 4.5:1, large text and UI 3:1.\n\n| Pair | FG | BG | Ratio | Needs | Result |\n|---|---|---|---|---|---|")
for n,f,b,k in P:
    r=cr(f,b); need=4.5 if k=='body' else 3.0
    print(f"| {n} | `{f}` | `{b}` | {r:.2f}:1 | {need}:1 | {'PASS' if r>=need else 'FAIL'}{' (AAA)' if k=='body' and r>=7 else ''} |")
print("\n## Before (current Riso Toll Stub), for reference\n\n| Pair | Ratio |\n|---|---|")
for n,f,b in [("Pink #FF2E93 heading on lime #D4FF3F","#FF2E93","#D4FF3F"),("Plum on pink stub","#2B0A3D","#FF2E93"),("Plum on lime","#2B0A3D","#D4FF3F")]:
    print(f"| {n} | {cr(f,b):.2f}:1 |")
