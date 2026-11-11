# Builds mockups/pairs/*.png and contact-sheet.png from renders. Run from design/.
from PIL import Image, ImageDraw, ImageFont
D='/workspace/hackathons/toll-bridge/design/'
G='/usr/share/fonts/truetype/sand-box/google/'
mono=lambda s: ImageFont.truetype(G+'IBM Plex Mono/IBMPlexMono-Bold.ttf', s)
def disp(s):
    f=ImageFont.truetype(G+'Archivo/Archivo-VariableFont_wdth,wght.ttf', s); f.set_variation_by_axes([900,125]); return f
GREEN=(11,59,45); GOLD=(242,179,61); WHITE=(255,255,255); MUTE=(169,211,192)
def fit(im, w=None, h=None):
    if w: return im.resize((w, round(im.size[1]*w/im.size[0])), Image.LANCZOS)
    return im.resize((round(im.size[0]*h/im.size[1]), h), Image.LANCZOS)
def pair(name, a, b, title, crop_h=None, colw=760):
    A=fit(Image.open(D+a).convert('RGB'),colw); B=fit(Image.open(D+b).convert('RGB'),colw)
    if crop_h: A=A.crop((0,0,colw,min(A.size[1],crop_h))); B=B.crop((0,0,colw,min(B.size[1],crop_h)))
    H=max(A.size[1],B.size[1]); pad=40; top=110
    out=Image.new('RGB',(colw*2+pad*3, H+top+pad),GREEN); d=ImageDraw.Draw(out)
    d.text((pad,26), title, font=disp(32 if colw>400 else 26), fill=WHITE)
    d.text((pad,top-30),'BEFORE', font=mono(18), fill=MUTE); d.text((pad*2+colw,top-30),'AFTER: TOLL NOTE', font=mono(18), fill=GOLD)
    out.paste(A,(pad,top)); out.paste(B,(pad*2+colw,top)); out.save(D+'mockups/pairs/'+name, optimize=True)
pair('pair-01-landing-1280.png','before/app-landing-1280.png','renders/landing-1280.png','Landing, 1280', crop_h=1500)
pair('pair-02-landing-390.png','before/app-landing-390.png','renders/landing-390.png','Landing, 390', crop_h=1700, colw=390)
pair('pair-03-tab-1280.png','before/local-tab-after-demo-1280.png','renders/tab-1280.png','Open tab after the demo agent, 1280')
pair('pair-04-ledger-1280.png','before/local-ledger-only-1280.png','mockups/ledger-1280.png','AG Grid ledger, 1280')
pair('pair-05-ledger-390.png','before/local-ledger-only-390.png','mockups/ledger-390.png','Ledger, 390', colw=390)
pair('pair-06-closed-1280.png','before/local-tab-closed-1280.png','renders/payouts-1280.png','Tab closed + writer royalties, 1280')
pair('pair-07-receipt-390.png','before/local-receipt-paid-390.png','renders/receipt-390.png','Receipt, 390', colw=390)
pair('pair-08-writers-1280.png','before/writers-index-1280.png','renders/writers-1280.png','Writers demo site, 1280')
pair('pair-09-writer-a-390.png','before/writers-a-390.png','renders/writer-a-390.png','Writer article, 390', colw=390)
pair('pair-10-port-preview-1280.png','before/local-tab-after-demo-1280.png','port-preview/port-tab-after-demo-1280.png','Real app, only globals.css + fonts + Ledger swapped, 1280')
tiles=[('mockups/hero-1280.png','Landing hero, 1280'),('mockups/hero-390.png','Landing hero, 390'),('mockups/tab-1280-fold.png','Agent tab + quote check, 1280'),
       ('mockups/ledger-1280.png','AG Grid ledger, 1280'),('mockups/payouts-1280-fold.png','Tab closed + writer royalties (sample)'),('mockups/ledger-390.png','Ledger, 390'),
       ('mockups/receipt-390-fold.png','Receipt, 390'),('mockups/writers-1280-fold.png','Writers demo site, 1280'),('mockups/writer-d-390-fold.png','Writer D article, 390'),
       ('port-preview/port-tab-setup-fixtures-1280.png','Port preview: real app, CSS only')]
W=2400; pad=36; h=520; rows=[]
for i in range(0,len(tiles),2):
    rows.append(([fit(Image.open(D+p).convert('RGB'),h=h) for p,_ in tiles[i:i+2]],[c for _,c in tiles[i:i+2]]))
sheet=Image.new('RGB',(W,150+len(rows)*(h+70)+pad),GREEN); d=ImageDraw.Draw(sheet)
d.text((pad,28),'TOLL BRIDGE / "TOLL NOTE" DESIGN PASS', font=disp(48), fill=WHITE)
d.text((pad,96),'Banknote green ground, white ticket stock, toll gold. Rendered in headless Chromium. Sample data is labeled in the pages.', font=mono(20), fill=MUTE)
y=150
for ims,caps in rows:
    x=pad
    for im,c in zip(ims,caps):
        if x+im.size[0]>W-pad: im=fit(im,w=W-pad-x)
        sheet.paste(im,(x,y)); d.text((x,y+im.size[1]+12),c.upper(), font=mono(18), fill=GOLD); x+=im.size[0]+pad
    y+=h+70
sheet.save(D+'contact-sheet.png', optimize=True); print('ok', sheet.size)
