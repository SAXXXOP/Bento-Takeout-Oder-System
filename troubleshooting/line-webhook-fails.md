# LINE Webhook が失敗する

## 症状
- LINEからのWebhookが届かない
- `doPost(e)` が動かない
- 401/403/404系になる

---

## チェック手順
1. WebアプリのデプロイURLが最新か（再デプロイで変わっていないか）
2. URLに `?key=` が付いているか、値が `WEBHOOK_KEY` と一致しているか
3. Script Properties に `WEBHOOK_KEY` が設定されているか
4. 実行履歴に doPost の記録があるか

---

## 典型原因
- URLが古い（デプロイし直してURLが変わった）
- `WEBHOOK_KEY` 不一致
- Webアプリのアクセス権設定が想定と違う

---

## 対処
- まず `setup/deployment.md` の手順で再確認
- ログを増やし、どこで弾かれているか確定（キー不一致/到達しない等）

→ `troubleshooting/logs.md`
