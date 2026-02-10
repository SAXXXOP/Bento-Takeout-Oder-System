# Webアプリ公開・Webhook（任意）

## 目的
LINE連携などで Webhook を受ける場合に、Apps Script を Webアプリとして公開する。

---

## 前提
- `doPost(e)` がWebhookの入口
- URLクエリ `?key=` に `WEBHOOK_KEY` を要求する簡易認証（実装に依存）

---

## 公開手順（一般的な流れ）
1. Apps Script を開く
2. 「デプロイ」→「新しいデプロイ」
3. 種類：ウェブアプリ
4. 実行するユーザー：通常「自分」
5. アクセス：実装前提に合わせる（匿名アクセス可が必要な場合あり）
6. デプロイして URL を取得

---

## Webhook URL（例）
- `https://script.google.com/macros/s/....../exec?key=WEBHOOK_KEYの値`

---

## 疎通確認
- まずブラウザ/ツールで POST を投げる（最小payload）
- 失敗したら `ログ` と実行履歴

→ `troubleshooting/line-webhook-fails.md`

---

## 注意
- WebアプリURLは「デプロイ」ごとに変わる場合があります（設定次第）。
- 秘密情報（`WEBHOOK_KEY`）の漏洩に注意。
