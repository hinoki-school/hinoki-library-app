# Firebase移行：設定と引き継ぎ

Codexの担当はFirebase Authentication・Firestore・セキュリティルールです。
Claudeの担当は印刷物、生徒／本のデータ運用、ユーザーとのFirebaseコンソール設定です。
QRカードは教室据え置き、ISBN利用、3冊上限、14日貸出、紙の記入を維持します。

## 実装した内容

- メール／パスワードでスタッフがログイン。新規登録画面はありません。
- `staff/{AuthenticationのUID}` に `active: true` と `role: "admin"` または `"staff"` がある人だけ利用できます。認証済みであるだけではマスタ・貸出を読めません。
- 認証とFirestoreキャッシュはメモリだけに保持。再読み込み・ページを閉じると再ログインが必要です。ログアウトは表示を消去して再読み込みし、SDKのメモリキャッシュも破棄します。
- データはスタッフ確認後に`onSnapshot`で購読。読み込み・同期・接続に問題があれば操作画面を閉じます。オフライン貸出は受け付けません。
- 貸出ログと生徒の`activeLoanIds`を1トランザクションで更新します。別端末が同時に貸し出しても、再試行時に3冊上限を再確認します。ルールも上限とログとの対応を検証します。
- 返却もトランザクション。同じ貸出の同時返却は1回だけ反映します。
- 同じISBNで複数の貸出がある場合、返却スキャンでは生徒を確定できないため、一覧から選びます。ISBNを個体IDとは扱っていません。
- 生徒・書名をHTMLとして実行しないよう表示時にエスケープします。
- 旧localStorageの貸出データは読み込まず、自動移行・削除もしません。ダミー履歴を本番へ混ぜないためです。

## Claude／ユーザー側で行うFirebase設定

1. Firebaseプロジェクトを作り、Webアプリを登録してください。Firestoreは`(default)`データベースを作成します。データ所在地は運用に合わせて選択してください。
2. Authenticationのメール／パスワード認証を有効にし、スタッフアカウントをコンソールで作成します。パスワードはコード・チャット・リポジトリに保存しません。
3. `firestore.rules`の内容をFirestoreの「ルール」画面で公開してください。テストモードの全公開ルールは使用しません。
4. Firestoreコンソールで`staff`コレクションを作り、ドキュメントIDを上のユーザーのUIDにします。フィールドは`active`（boolean）=`true`、`role`（string）=`admin`。通常スタッフには`role: "staff"`を設定します。この権限はアプリから変更できません。
5. Webアプリの`firebaseConfig`は下記の実行時設定として提供します。サービスアカウント鍵やAdmin SDKの秘密鍵は不要です。

Firebaseコンソール側の作成・ルール公開・権限設定は未実施です。プロジェクトの実設定がないため、本番接続・実機での最終確認も未実施です。

## 設定値をリポジトリに書かない公開方法

ワークスペースの認証情報方針に従い、実際の`firebaseConfig`はGitの作業フォルダには書きません。アプリは公開時に生成される`firebase-config.json`を読み込みます。未生成なら「初期設定を準備しています」と表示します。

FirebaseのWeb設定は配信先ではブラウザから読める識別情報です。データ保護はAuthenticationとFirestoreルールで行います。設定の秘匿だけをアクセス制御の代用にしません。

### GitHub Pages（準備のみ。現在の公開設定は変更していません）

1. ユーザーがGitHubのRepository Settings → Secrets and variables → Actionsに`HINOKI_FIREBASE_CONFIG`というRepository secretを追加します。値はWeb設定のJSONオブジェクトです。`const firebaseConfig =`等のJSコードは含めず、キー・文字列をダブルクォートで囲むJSONにしてください。
2. ユーザーがPagesのSourceを**GitHub Actions**に変更します。現行の「mainのルートを直接公開」方式のままマージすると、設定JSONがないため設定待ち画面になります。切り替えを準備してからマージ・公開してください。
3. Firebase側のルールとスタッフを設定した後、レビュー済みの変更をmainへ取り込みます。
4. Actionsから`Publish configured library app`をmainで手動実行します。設定値はRunnerの一時ディレクトリにだけ書き込まれ、公開に必要なファイルだけをPagesへ送ります。実行ログに設定値は出しません。テスト・node_modules・Git情報は配信しません。
5. 公開サイトで下記の受け入れ確認を行います。

このワークフローは手動起動専用です。Codexは公開設定変更・mainへのマージ・本番デプロイを実行していません。

### ローカル

- `npm ci` → `npm start` → `http://127.0.0.1:4173`。未設定画面の確認には認証情報は不要です。
- 実プロジェクトの接続確認が必要な場合、ユーザー管理の実行時注入で環境変数`HINOKI_FIREBASE_CONFIG`をサーバープロセスへ渡します。サーバーはメモリからJSONを配信し、ファイルへ保存しません。`.env`は作りません。
- テストは`npm test`、`npm run test:rules`（Java 21が必要）、`npm run test:ui`（ローカルはChrome、CIはChromium）。ルールテストは`demo-hinoki-library`というローカル専用プロジェクトを使い、本番に接続しません。
- CIはPRで同じテストを実行します。画面テストはFirebase境界を模擬し、ルールテストは実際のFirestoreエミュレーターでアプリと同じトランザクションを実行します。

## データ運用側への契約

| パス | フィールド |
| --- | --- |
| `staff/{uid}` | `active: boolean`, `role: "admin"` または `"staff"` |
| `students/{studentId}` | `name: string`, `grade: string`, `active: boolean`, `activeLoanIds: string[]` |
| `books/{isbn}` | `title: string`, `author: string` |
| `loans/{loanId}` | `studentId`, `bookId`, `loanDate`, `dueDate`, `returnDate` |

- 新しい生徒は`activeLoanIds: []`で登録します。更新時にこの配列を上書き・初期化しないでください。アプリの貸出・返却処理が管理する整合性情報です。
- 日付は`YYYY-MM-DD`。貸出中は`returnDate: null`です。端末のローカル日付で14日後を計算します。
- 通常スタッフは貸出・返却のみ。マスタ作成／編集はadminのみ。履歴破壊を避け、生徒・本・貸出のクライアント削除は拒否します。退会は`active: false`で扱います。
- 生徒に未返却の本があっても退会状態へ変更できます。退会後の新規貸出は拒否し、返却は可能です。
- ダミー初期登録ボタンはadminで、全マスタ・貸出が空のときだけ表示します。`tools/demo-data.js`の12人・10冊を登録します。既存の同一IDが1件でもあればトランザクション全体を中止し、上書きしません。
- `tools/demo-data.js`は架空データ専用です。実名はここや公開リポジトリへ記入せず、次フェーズの認証付きインポートで扱います。

## 本番設定後の受け入れ確認

1. 未ログイン／スタッフ未登録アカウントでは氏名・学年・貸出を取得できない。
2. adminでダミー登録、通常スタッフで貸出・手動返却・スキャン返却ができる。
3. iPadを2台開き、一方の貸出・返却がもう一方へ反映される。
4. 同じ生徒に2台から同時に貸し出しても合計3冊を超えない。
5. 通信を切った状態で成功表示・ローカルだけの貸出を作らない。
6. ログアウト／権限取り消し後に生徒情報が画面に残らない。
7. iPad／iPhoneのSafariで実際の印刷物を読み取る。jsQRの実画像デコードは自動テスト、EAN-13の二度確認は模擬デコーダーでの回帰テスト。物理的なISBNの読取精度は実機で別途確認する。

## 参照した公式資料

- [Firebase Web SDKと設定情報](https://firebase.google.com/docs/web/learn-more)（SDK 12.19.0を固定）
- [トランザクションとgetAfterによるルール検証](https://firebase.google.com/docs/firestore/manage-data/transactions)
- [Authenticationの保持方式](https://firebase.google.com/docs/auth/web/auth-state-persistence)
- [GitHub Pagesのカスタムワークフロー](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
