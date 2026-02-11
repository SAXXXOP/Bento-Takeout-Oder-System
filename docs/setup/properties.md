# Script Properties 設定

## 目的
環境差（店舗ごとのIDやトークンなど）を Script Properties で管理し、安全にテンプレ運用する。

---

## 設定方法
1. スプレッドシート → 拡張機能 → Apps Script
2. 左メニュー「プロジェクトの設定」
3. 「スクリプト プロパティ」で追加/編集

---

## 必須（使う機能に応じて）

### LINE連携を使う場合
- `LINE_TOKEN`：Push 等の送信に使用
- `WEBHOOK_KEY`：Webhook URL に `?key=` を必須化する簡易認証

### バックアップを使う場合
- `BACKUP_FOLDER_ID`：バックアップ保存用の親フォルダID

---

## 推奨（運用品質を上げる）

### ログ
- `LOG_LEVEL`：例 `INFO` / `DEBUG`
- `LOG_MAX`：ログ最大行数（肥大化対策）

### メニュー表示制御（管理者/閲覧者）
- `ADMIN_EMAILS`：管理者メール（カンマ区切り）
- `MENU_SHOW_ADVANCED`：緊急用フォールバック（メール判定できない環境向け、全員に適用）
  - 詳細は `setup/menu-visibility.md`

### バックアップの詳細（実装に存在する場合）
例：
- `BACKUP_AT_HOUR`
- `BACKUP_DAILY_RETENTION_DAYS`
- `BACKUP_USE_MONTHLY_FOLDER`
- `BACKUP_MONTHLY_RETENTION_MONTHS`
- `BACKUP_DAILY_FOLDER_KEEP_MONTHS`
- `BACKUP_MONTHLY_FOLDER_NAME`

---

## テンプレ配布向け
テンプレは「キーを全部用意して、値だけダミー」にしておくと事故が減ります。  
値移植は `setup/properties-transfer.md` 推奨。

---

## 注意（秘密情報）
`LINE_TOKEN` や `WEBHOOK_KEY` は秘密情報です。  
- リポジトリに書かない
- スクショ共有に注意
- ログ出力で丸出しにしない（マスク推奨）
