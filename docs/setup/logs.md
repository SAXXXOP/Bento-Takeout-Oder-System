# ログの見方（最初に確認する場所）

## 目的
問題が起きたときに「原因を確定してから直す」ための最短導線。

---

## まず見る場所（優先順）
1) スプレッドシートの `ログ` シート  
2) Apps Script の「実行」→ 実行履歴（エラー詳細）  
3) 必要なら `LOG_LEVEL=DEBUG` にして再現

---

## ログで見るポイント
- いつ（日時）
- どの処理（フォーム保存 / 予約札作成 / 当日まとめ / バックアップ / Webhook）
- 入力データの要点（予約No、氏名、日付など）
- 例外メッセージ（何が無い/どこで落ちた）

---

## 典型的な原因と当たり
- フォームの質問タイトル不一致 → `CONFIG.FORM` とフォーム側の文言差
- Script Properties 未設定 → `BACKUP_FOLDER_ID`, `WEBHOOK_KEY`, `LINE_TOKEN` など
- トリガー未設定/無効 → `onFormSubmit`, `dailyPrepTrigger`, `backupSpreadsheetDaily`
- 権限未承認 → 初回実行で承認しきれていない

---

## 簡単に直らない場合の進め方（推奨）
1) 再現条件をメモ（いつ/誰/どの入力で）
2) `LOG_LEVEL=DEBUG` を一時的に上げる
3) 対象処理の入口で「受け取った値」をログに出す（必要最小限）
4) 原因が確定してから修正

> 個人情報をログに出しすぎない（電話番号/LINE_IDはマスク推奨）

---

## 次に読むべきページ
- トリガー設定：`docs/setup/triggers.md`
- 初期導入：`docs/setup/initial-setup.md`
- プロパティ：`docs/setup/properties.md`
