# バックアップ設定（任意）

## 目的
スプレッドシートを日次でバックアップし、誤操作や障害時に復元できるようにする。

---

## 前提
- `BACKUP_FOLDER_ID`（親フォルダID）が Script Properties に設定されている
- バックアップ本体関数：`backupSpreadsheetDaily()`

---

## 手順

### 1) Googleドライブにバックアップ用フォルダを作成
例：`弁当予約_バックアップ`

フォルダURLの `.../folders/<ここ>` がフォルダIDです。

### 2) Script Properties に `BACKUP_FOLDER_ID` を設定
- キー：`BACKUP_FOLDER_ID`
- 値：フォルダID

### 3) トリガーを設定（推奨）
- 時間主導型（毎日1回）
- 関数：`backupSpreadsheetDaily`

---

## 期待結果
- 指定フォルダにバックアップファイルが作成される
- 保持期間（例：日次60日＋月次12ヶ月など）は実装に依存

---

## うまくいかない時
- `BACKUP_FOLDER_ID` の誤り（別フォルダ/権限不足）
- Drive権限の承認不足
- 実行履歴で例外が出ている

→ `troubleshooting/logs.md`
