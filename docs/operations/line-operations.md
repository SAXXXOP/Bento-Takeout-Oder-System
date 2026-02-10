# LINE連携の運用（任意）

## 目的
LINE通知・Webhook・変更導線を運用で活かす。

---

## 使うもの
- Push送信（`LINE_TOKEN`）
- Webhook受信（Webアプリ公開 + `WEBHOOK_KEY`）
- 変更導線（実装がある場合：予約番号で更新など）

---

## 運用例
- フォーム送信→店舗に通知（新規/要確認のみ通知など）
- 締切後に「送信が来た」通知（店舗の確認タイミング）
- 変更連絡をLINEに誘導（テンプレ返信など）

---

## トラブル時
- Webhookが受けられない：`troubleshooting/line-webhook-fails.md`
- 送信できない：`LINE_TOKEN` / UrlFetch 権限 / 実行履歴
