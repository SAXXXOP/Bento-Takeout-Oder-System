# バックアップ設定（任意）

## 目的
誤操作や障害時に復元できるよう、スプレッドシートを定期バックアップする。

---

## 前提
- `BACKUP_FOLDER_ID` が Script Properties に設定済み
- 日次バックアップ関数：`backupSpreadsheetDaily()`
- 保持期間（日次60日＋月次12ヶ月など）は実装に依存

---

## 手順
1. Googleドライブにバックアップ用フォルダを作成（例：`弁当予約_バックアップ`）
2. フォルダIDを取得し、Script Properties の `BACKUP_FOLDER_ID` に設定
3. 時間主導型トリガーで `backupSpreadsheetDaily` を毎日実行

---

## 確認方法
- 指定フォルダ内にバックアップファイルが作成される
- 実行履歴に成功ログが残る

---

## 失敗する時
→ `troubleshooting/backup-fails.md`
