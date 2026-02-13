# .gs ファイル一覧と役割（要追記）

## 目的
「どのファイルに何があるか」を一覧化し、改修の見通しを良くする。

---

## 目安（例：よくある分割）
- System / Menu：onOpen、メニュー構築
- FormService：フォーム回答解析・正規化
- OrderService：注文一覧への保存・予約No発行
-（廃止）CustomerService / CustomerForm：顧客名簿・備考編集（現行では使用しない）
- DailyPrep：予約札/当日まとめの生成、日次トリガー
- LineService：LINE送信/受信（doPost）
- Backup：Driveバックアップ
- Logger：ログ出力、LOG_LEVEL/LOG_MAX_ROWS
- Config：CONFIG.SHEET/COLUMN/FORM
- DeploymentTools：テンプレ移植、導入補助
- MenuVisibility：管理者/閲覧者でメニュー表示制御（ADMIN_EMAILS）

---

## TODO（運用開始時に埋める）
このリポジトリの実ファイルに合わせて、以下の形で追記してください。

例：
- `System.gs`：onOpen、メニュー定義
- `FormService.gs`：parse、正規化
- `...`：...

（このページは“人が見て分かる”ことが最優先。完璧な網羅でなくてOK）
