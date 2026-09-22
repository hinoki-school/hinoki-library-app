# -*- coding: utf-8 -*-
import qrcode
import base64
from io import BytesIO

students = [
    {"grade": "3年", "name": "サンプル 太郎",   "kana": "サンプル タロウ",   "id": "D-1001"},
    {"grade": "3年", "name": "テスト 花子",     "kana": "テスト ハナコ",     "id": "D-1002"},
    {"grade": "3年", "name": "見本 一郎",       "kana": "ミホン イチロウ",   "id": "D-1003"},
    {"grade": "3年", "name": "架空 さくら",     "kana": "カクウ サクラ",     "id": "D-1004"},
    {"grade": "4年", "name": "仮名 次郎",       "kana": "カメイ ジロウ",     "id": "D-1005"},
    {"grade": "4年", "name": "試験 美咲",       "kana": "シケン ミサキ",     "id": "D-1006"},
    {"grade": "4年", "name": "練習 健太",       "kana": "レンシュウ ケンタ", "id": "D-1007"},
    {"grade": "4年", "name": "模擬 ゆうと",     "kana": "モギ ユウト",       "id": "D-1008"},
    {"grade": "5年", "name": "確認 陽菜",       "kana": "カクニン ヒナ",     "id": "D-1009"},
    {"grade": "5年", "name": "検証 大輝",       "kana": "ケンショウ ダイキ", "id": "D-1010"},
    {"grade": "5年", "name": "仮想 結衣",       "kana": "カソウ ユイ",       "id": "D-1011"},
    {"grade": "6年", "name": "試作 蓮",         "kana": "シサク レン",       "id": "D-1012"},
]

def make_qr_b64(payload: str) -> str:
    # short payload + border(quiet zone)=4 (spec minimum) + ERROR_CORRECT_H (30% redundancy)
    # for maximum robustness against home-printer dot gain / camera blur / off-axis angle
    qr = qrcode.QRCode(border=4, box_size=14, error_correction=qrcode.constants.ERROR_CORRECT_H)
    qr.add_data(payload)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#000000", back_color="#ffffff")
    buf = BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("ascii")

for s in students:
    payload = s["id"]  # short payload -> lower QR version -> fewer, bigger modules at print size
    s["qr_b64"] = make_qr_b64(payload)
    s["payload"] = payload

cards_html = []
for s in students:
    cards_html.append(f"""
      <div class="card">
        <div class="sample-tag">SAMPLE</div>
        <div class="card-top">
          <span class="grade">{s['grade']}</span>
          <span class="lib">図書貸出カード</span>
        </div>
        <div class="card-body">
          <img class="qr" src="data:image/png;base64,{s['qr_b64']}" alt="QR">
          <div class="who">
            <div class="name">{s['name']}</div>
            <div class="kana">{s['kana']}</div>
            <div class="id">{s['id']}</div>
          </div>
        </div>
      </div>""")

PER_PAGE = 6
pages = [cards_html[i:i+PER_PAGE] for i in range(0, len(cards_html), PER_PAGE)]
pages_html = ""
NOTE = "印刷時は必ず「実際のサイズ／100%」で印刷してください（「用紙に合わせる」「拡大縮小」はQRが縮小されて読み取れなくなります）"
for page_cards in pages:
    pages_html += f'<section class="sheet"><div class="printnote">{NOTE}</div><div class="cardgrid">{"".join(page_cards)}</div></section>\n'

html = f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>図書貸出カード ダミーサンプル</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@500;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=JetBrains+Mono:wght@500&display=swap">
<style>
  :root{{
    --ink:#1a231d; --ink-soft:#546052; --border:#c9cfbc;
    --accent:#3f6b4a; --accent-soft:#dfe9df; --paper:#ffffff;
  }}
  *{{ box-sizing:border-box; }}
  html,body{{ margin:0; background:#f4f6f0; }}
  body{{ font-family:"Zen Kaku Gothic New",sans-serif; color:var(--ink); }}
  .sheet{{
    width:190mm;
    margin:0 auto;
    padding:10mm 0;
    page-break-after: always;
  }}
  .sheet:last-child{{ page-break-after: auto; }}
  .printnote{{
    font-size:9px; color:#a2601f; text-align:center;
    margin-bottom:4mm; font-family:"Zen Kaku Gothic New",sans-serif;
  }}
  .cardgrid{{
    display:grid;
    grid-template-columns: repeat(2, 91mm);
    grid-auto-rows: 55mm;
    gap:6mm 8mm;
    justify-content:center;
  }}
  .card{{
    position:relative;
    width:91mm; height:55mm;
    border:1px dashed var(--border);
    border-radius:3mm;
    background:var(--paper);
    padding:4mm 5mm;
    display:flex;
    flex-direction:column;
    overflow:hidden;
  }}
  .sample-tag{{
    position:absolute; top:3mm; right:-9mm;
    background:#a2601f; color:#fff;
    font-family:"JetBrains Mono",monospace;
    font-size:7.5px; letter-spacing:.1em;
    padding:1.5mm 10mm;
    transform:rotate(35deg);
  }}
  .card-top{{
    display:flex; align-items:baseline; justify-content:space-between;
    margin-bottom:3mm; padding-right:14mm;
  }}
  .grade{{
    font-family:"JetBrains Mono",monospace; font-size:11px; font-weight:500;
    background:var(--accent-soft); color:var(--accent);
    padding:1mm 3mm; border-radius:2mm; letter-spacing:.03em;
  }}
  .lib{{ font-size:8.5px; color:var(--ink-soft); letter-spacing:.02em; }}
  .card-body{{ display:flex; align-items:center; gap:5mm; flex:1; }}
  .qr{{ width:30mm; height:30mm; flex:none; image-rendering:pixelated; }}
  .who{{ min-width:0; }}
  .name{{ font-family:"Shippori Mincho",serif; font-weight:700; font-size:16px; line-height:1.3; margin-bottom:1.5mm; }}
  .kana{{ font-size:9px; color:var(--ink-soft); margin-bottom:3mm; }}
  .id{{ font-family:"JetBrains Mono",monospace; font-size:10px; color:var(--accent); letter-spacing:.03em; }}

  @media print{{
    body{{ background:#fff; }}
    @page{{ size:letter; margin:10mm; }}
  }}
</style>
</head>
<body>
{pages_html}
</body>
</html>
"""

with open("library-cards-dummy.html", "w", encoding="utf-8") as f:
    f.write(html)

print("wrote html, students:", len(students))
