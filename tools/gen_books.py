# -*- coding: utf-8 -*-
import base64
from io import BytesIO
import barcode
from barcode.writer import ImageWriter

# Dummy ISBN-13 numbers using the 978-9999... unassigned-publisher-range style
# so they are clearly test data and cannot collide with a real published book.
books = [
    {"isbn": "9789999100001", "title": "かいけつゾロリのドラゴンたいじ", "author": "原ゆたか",           "label": "黄"},
    {"isbn": "9789999223456", "title": "ママだいすき",                     "author": "きむらゆういち",     "label": "緑"},
    {"isbn": "9789999345678", "title": "ランドセルのはるやすみ",           "author": "岡田よしたか",       "label": "緑"},
    {"isbn": "9789999467890", "title": "ストーブのふゆやすみ",             "author": "岡田よしたか",       "label": "緑"},
    {"isbn": "9789999589012", "title": "サッカーが楽しくなる本",           "author": "少年サッカー編集部", "label": "橙"},
    {"isbn": "9789999601234", "title": "ちいさなちいさな王様",             "author": "アクセル・ハッケ",   "label": "青"},
    {"isbn": "9789999723456", "title": "もしかしたら名探偵",               "author": "杉山亮",             "label": "黄"},
    {"isbn": "9789999845678", "title": "いつのまにか名探偵",               "author": "杉山亮",             "label": "黄"},
    {"isbn": "9789999967890", "title": "ノラネコぐんだん アイスのくに",   "author": "工藤ノリコ",         "label": "緑"},
    {"isbn": "9789999189012", "title": "はじめてのキャンプ",               "author": "林明子",             "label": "紫"},
]

def make_ean13_b64(isbn13: str) -> str:
    # python-barcode's ean13 writer expects the 12-digit payload and computes the check digit itself.
    ean = barcode.get("ean13", isbn13[:12], writer=ImageWriter())
    buf = BytesIO()
    ean.write(buf, options={
        "module_height": 17.0,
        "module_width": 0.5,
        "quiet_zone": 7.5,
        "font_size": 9,
        "text_distance": 3.5,
        "write_text": True,
    })
    return base64.b64encode(buf.getvalue()).decode("ascii"), ean.get_fullcode()

LABEL_COLOR = {
    "緑": "#6f8f4e", "黄": "#c99a2e", "橙": "#bb5f2c", "青": "#3f6fa0", "紫": "#83699f",
}

for b in books:
    b64, full = make_ean13_b64(b["isbn"])
    b["barcode_b64"] = b64
    b["isbn"] = full  # use the checksum-corrected 13-digit code as the real payload

cards_html = []
for b in books:
    color = LABEL_COLOR[b["label"]]
    cards_html.append(f"""
      <div class="card">
        <div class="sample-tag">SAMPLE</div>
        <div class="card-top">
          <span class="grade" style="background:{color}22; color:{color};">{b['label']}ラベル</span>
          <span class="lib">図書貸出（本・ISBN）</span>
        </div>
        <div class="card-body">
          <div class="titleblock">
            <div class="name">{b['title']}</div>
            <div class="kana">{b['author']}</div>
          </div>
          <img class="barcode" src="data:image/png;base64,{b['barcode_b64']}" alt="ISBN barcode">
        </div>
      </div>""")

PER_PAGE = 6
pages = [cards_html[i:i+PER_PAGE] for i in range(0, len(cards_html), PER_PAGE)]
pages_html = ""
NOTE = "印刷時は必ず「実際のサイズ／100%」で印刷してください（本の裏表紙に貼って使うダミーISBNバーコードです。実在の書籍とは対応していません）"
for page_cards in pages:
    pages_html += f'<section class="sheet"><div class="printnote">{NOTE}</div><div class="cardgrid">{"".join(page_cards)}</div></section>\n'

html = f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>ダミー本ISBNバーコード</title>
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
    padding:1mm 3mm; border-radius:2mm; letter-spacing:.03em;
  }}
  .lib{{ font-size:8.5px; color:var(--ink-soft); letter-spacing:.02em; }}
  .card-body{{ display:flex; flex-direction:column; justify-content:center; gap:3mm; flex:1; }}
  .titleblock .name{{ font-family:"Shippori Mincho",serif; font-weight:700; font-size:13px; line-height:1.3; }}
  .titleblock .kana{{ font-size:9px; color:var(--ink-soft); margin-top:1.5mm; }}
  .barcode{{ width:74mm; height:auto; image-rendering:pixelated; align-self:flex-start; }}

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

with open("library-books-dummy.html", "w", encoding="utf-8") as f:
    f.write(html)

import json
with open("dummy_books.json", "w", encoding="utf-8") as f:
    json.dump(books, f, ensure_ascii=False, indent=2)

print("wrote html, books:", len(books))
for b in books:
    print(b["isbn"], b["title"])
