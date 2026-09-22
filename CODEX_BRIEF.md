# 図書貸出ステーション — Codex引き継ぎ資料

Claude Codeとの会話で進めてきた、学習塾（Hinoki Educational Services）向け図書貸出管理アプリのプロトタイプです。このドキュメントは、同じ作業をCodexで並行して進めるための引き継ぎ資料です。会話の背景を知らない前提で、必要な情報を全部書いています。

## 1. プロジェクトのゴール

- 現状はアナログ運用（紙の貸出票に生徒が手書き、学年別クリップボード管理、色ラベルで分類）。
- **生徒が紙に記入するステップは残す**。そこに加えて、ISBNバーコード／QRコードのスキャンで転記作業と履歴管理をデジタル化する。
- 生徒はIDカードを持たない。生徒の実データ（氏名・学年）は共有フォルダのExcelで管理されている。
- 詳しい要件定義・比較検討・運用フロー図は [`docs/design.html`](./docs/design.html) を参照（ブラウザで開くだけで読める単体HTML）。

## 2. 今の実装状況

- リポジトリ: https://github.com/Yoda-EP4/hinoki-library-app （**public**）
- 公開URL（GitHub Pages）: https://yoda-ep4.github.io/hinoki-library-app/
- デプロイ方法: `main`ブランチのルートに`index.html`を置くだけ。pushすると自動でPagesに反映される（反映まで30〜60秒ほどラグあり）。
- アプリ本体: 単一HTMLファイル（`index.html`）。ビルドステップなし、フレームワークなし、素のJS。
- データ生成用のPythonスクリプト（ローカルでのみ実行、リポジトリの`tools/`に同梱）:
  - `tools/gen_cards.py` — 生徒用ダミーQRカード（名刺サイズ・PDF）を生成
  - `tools/gen_books.py` — 本のダミーISBNバーコード（EAN-13・PDF）を生成
  - どちらも `qrcode` / `python-barcode` / `Pillow` / `playwright`（PDF化）が必要

## 3. これまでの設計判断（勝手に変えないでほしい部分）

| 項目 | 決定内容 | 理由 |
|---|---|---|
| 生徒の識別 | QRコード付きの名刺サイズカードを**教室に据え置き**、生徒が持ち帰らない | IDカード配布よりコストが低く、名前選択よりミスが少ない。カード紛失は「教室保管」で解消 |
| 本の識別 | 実際の本の**裏表紙のISBNバーコード（EAN-13）**をそのまま使う | 新たにラベルを貼る手間が不要。既存の書籍にすでに印字されている |
| 貸出上限 | 1人3冊まで（`MAX_BOOKS = 3`） | 既存の紙運用のルールを踏襲 |
| 貸出期間 | 14日（`LOAN_DAYS = 14`） | 既存の紙運用のルールを踏襲 |
| 10冊達成 | 記録・可視化のみ。自動通知はまだ実装しない | 保護者連絡先の同意まわりが未整理のため次フェーズ送り |
| 返却 | スキャンあり／なし両対応（返却BOXに入れるだけでもOK、後でスタッフがまとめて処理も可） | 忙しい時間帯の運用を考慮 |
| 外部サービス | 図書館管理SaaSのような**既製品は使わない**。Firebase/Supabaseのような**汎用クラウド基盤（部品）はOK** | ユーザーに確認済み。自前で全部作るのは非現実的という合意 |

## 4. 現在のデータモデル（`index.html`内にハードコード）

```js
const STUDENTS = [
  {id:"D-1001", name:"サンプル 太郎", grade:"3年"},
  // ... 12件、すべてダミー人物
];
const BOOKS = [
  {id:"9789999100007", title:"かいけつゾロリのドラゴンたいじ", author:"原ゆたか"},
  // ... 10件、すべてダミーISBN（978-9999プレフィックスの未割当領域を使用）
];
```

- 貸出ログ（`loans`）は `localStorage` の `hinoki-library-loans-v1` キーにJSON配列で保存。
  - 1件の形: `{loanId, studentId, bookId, loanDate, dueDate, returnDate}`
  - `returnDate` が `null` なら貸出中。

## 5. スキャン機能の実装詳細（ここ、ハマりどころが多いので必読）

- **生徒カードのQR** → `jsQR` で読む。
  - CDN: `https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js`
  - ⚠️ **`cdnjs.cloudflare.com/ajax/libs/jsqr/...` は404で存在しない。** 最初これで1週間ハマった。cdnjsではなく必ずjsDelivrを使うこと。
- **本のISBNバーコード（EAN-13）** → `QuaggaJS` の `Quagga.decodeSingle()` で読む（`reader: "ean_reader"`）。
  - CDN: `https://cdnjs.cloudflare.com/ajax/libs/quagga/0.12.1/quagga.min.js`（こちらはcdnjsで正常）
- **バーコード誤読対策**: EAN-13には誤り訂正がない。印刷のにじみ・手ブレで1桁だけ誤読することがあり、しかもダミーISBNが似た連番だと「別の登録済みの本」に一致してしまう最悪のケースが起きる。**同じコードを連続2回読めてから確定**する仕組み（`BARCODE_CONFIRM_STREAK = 2`）を入れている。ダミーISBNも意図的にバラバラの値にしてある（連番にしない）。
- **カメラ取得**: `getUserMedia({video:{facingMode:"environment", width:{ideal:1920}, height:{ideal:1080}, focusMode:"continuous"}})`
- カメラ映像の上に読み取りガイド枠（点線）とヒントテキスト「枠いっぱいに大きく写してください」を重ねて表示。QRは正方形ガイド、バーコードは横長ガイド。
- 診断用に、解像度とフレーム処理数をカメラモーダル内に表示している（`camDebug`要素）。これのおかげで「カメラは起動するがjsQRのCDN URLが404で一度もライブラリが読み込めていなかった」というバグを特定できた。**同様の問題の切り分けに便利なので消さないこと。**

## 6. ハマった問題と教訓（重複調査を避けるため必読）

1. **Claude Artifact（claude.ai/artifact/...）上ではカメラが起動しない。**
   `NotAllowedError: The request is not allowed by the user agent or the platform in the current context` が出る。iframe越しにカメラ権限が委譲されていないため。→ 実機テストは必ずGitHub Pages（またはそれに準ずる、iframeでない通常のトップレベルページ）で行うこと。
2. **GitHub Pagesはprivateリポジトリでも公開サイト自体は誰でも見られる。**
   アクセス制限にはGitHub Enterprise Cloud（組織向け有料プラン）が必要で、個人アカウントでは使えない。→ 生徒の実名を扱うなら認証つきバックエンドが必須（このドキュメントの本題、セクション7）。
3. **iPhoneの標準カメラアプリは1次元バーコード（EAN-13等）を読む機能がない。** QRしか検出しない。「本のISBNが読めない」という報告が来たとき、実は標準カメラで試していただけ、ということがあった。切り分け時は「どのアプリ／画面で試したか」を必ず確認する。
4. **jsQR自体が一度もロードできていなかったのに気づかなかった。**
   `window.__devScan()`（jsQRを経由しないテスト用バイパス関数）でロジックのテストばかりしていたため、jsQRの実際の画像デコードを検証していなかった。ライブラリ導入時は必ず「実際にそのライブラリで既知の画像がデコードできるか」を単体で確認すること。
5. **ヘッダーのflexboxがiPhone幅で崩れた。**
   `<h1>`が`white-space:nowrap`、タブが`margin-left:auto`で右寄せ、合計幅が画面幅を超えるとタブが画面外にはみ出す。`@media (max-width:480px)`でヘッダーを2段組みに変更して解決済み。
6. **印刷物（QR・バーコード）は物理的な余白・線幅に注意。**
   - QRは規格上の最小クワイエットゾーン（4モジュール分の余白）を割ると、実機カメラで読めなくなる。誤り訂正レベルはHが安全。
   - EAN-13は線幅0.33mm（本の印刷相当）だと家庭用プリンタのインクにじみで潰れる。0.5mm以上を推奨。
   - 印刷時に「用紙に合わせる」で自動縮小されるとサイズが変わって読めなくなるので、PDFに「実際のサイズ／100%で印刷」の注意書きを入れている。
   - 用紙サイズ（A4 / Letter）はユーザー環境に合わせて明示的に指定すること（自動だと縦の収まりが変わってレイアウトが崩れる）。

## 7. 次にやるべきタスク：Firebase移行（最優先）

### 背景・要件

ユーザーから明確な指示：**「Webアプリとするから、生徒の名前や学年が外に漏れないようにして」**

現状の最大の問題は、`STUDENTS`配列（氏名を含む）が`index.html`にベタ書きされていて、GitHub Pagesで**誰でも見られる状態**になっていること。ダミーデータのうちは問題ないが、実データに差し替えたら即アウト。

ユーザーは「バックエンド付きに作り直す（本格的）」を選択済み。Firebase（Firestore + Authentication）を使う方針で合意している。

### やること

1. **Firebase Authenticationでログインゲートを作る**
   - アプリ本体（貸出／返却／状況の3タブ）を表示する前に、メール/パスワードのログイン画面を挟む。
   - スタッフ用の1〜2アカウントで運用する想定（生徒個別のログインではない）。
   - ユーザーが手動でFirebaseコンソールから「メール/パスワード」認証を有効化し、アカウントを1つ作成済み（または作成中）。

2. **生徒マスタ・書誌マスタをFirestoreに移す**
   - **重要**: `STUDENTS`配列を`index.html`にハードコードしたまま残さないこと。認証必須のFirestoreコレクションに移し、未ログイン状態では一切取得できないようにする。
   - コレクション構成（案）:
     ```
     students/{studentId}   -> {name, grade, active}
     books/{isbn}           -> {title, author}
     loans/{loanId}         -> {studentId, bookId, loanDate, dueDate, returnDate}
     ```
   - 本（`books`）はタイトルのみで個人情報ではないので、公開のままでも実害は少ないが、一貫性のためFirestoreに寄せてよい。

3. **Firestore セキュリティルール**
   - 最低限、全コレクションで `request.auth != null` を要求する。例:
     ```
     rules_version = '2';
     service cloud.firestore {
       match /databases/{database}/documents {
         match /{document=**} {
           allow read, write: if request.auth != null;
         }
       }
     }
     ```
   - 余裕があれば、スタッフのUIDをホワイトリストにして書き込み権限をさらに絞る。

4. **`localStorage`ベースのCRUDをFirestoreに置き換える**
   - 現状の `loadLoans()` / `saveLoans()` を Firestore の `onSnapshot`（リアルタイム同期）に置き換える。
   - これにより「複数のiPadで貸出データが共有されない」という既知の制約も同時に解消できる（このタイミングでやる価値が高い）。

5. **Firebase設定値の受け渡し**
   - ユーザーがFirebaseコンソールでプロジェクトを作成し、Web用の`firebaseConfig`オブジェクト（`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`）を取得する作業を進行中。
   - この値はFirebaseの仕様上、公開されても問題ない（実際の保護はセキュリティルールと認証で行う）。届き次第、コード内の設定箇所に埋め込む。
   - Firebase JS SDKはCDN経由で読み込む想定（例: `https://www.gstatic.com/firebasejs/10.x.x/firebase-app-compat.js` など。バージョンは実装時に最新の安定版を確認すること）。

6. **一度きりのデータ移行（seed）**
   - 現状の `STUDENTS` / `BOOKS` 配列を、初回だけFirestoreに書き込むワンショットのseedスクリプト（またはログイン後に管理者だけ叩けるボタン）を用意する。
   - 実データ（生徒管理Excelからのインポート）は次のフェーズなので、まずはダミーデータのままでよい。

### 進める上での注意

- ユーザーはCodexとClaude Codeで**並行して**同じ課題に取り組む予定。作業がコンフリクトしないよう、実装方針が固まったらどちらか一方の変更を早めに`main`にpushし、もう一方はpull/mergeしてから続ける、といった調整をユーザーに確認しながら進めること。
- 大きな設計判断（認証方式を変える、DBをFirestore以外にする、等）はユーザーに確認してから進める。既に合意済みの内容（このドキュメントのセクション3・7の方針）は再確認不要。
