# 弁当予約フォーム（Googleフォーム + スプレッドシート + Apps Script）

Googleフォームの予約送信を起点に、スプレッドシートへ **注文一覧の記録 / 予約No発行 / 自動返信（＋任意でLINE通知）** を行う運用ツールです。  
日々の業務として **予約札作成** と **当日まとめ更新** をメニューまたは自動（トリガー）で実行できます。  
※「顧客名簿」シート前提の運用は現行では採っていません（注文一覧を中心に運用します）。

- 詳細マニュアル（作業別）：`docs/index.md`

---

## できること（概要）

- フォーム送信 → `onFormSubmit` を起点に処理（フォーム解析→注文一覧へ記録…）:contentReference[oaicite:0]{index=0}
- ステータス運用（B案）
  - 有効：`""`（空欄）
  - 無効：`"無効"`
  - 要確認：`"★要確認"`:contentReference[oaicite:1]{index=1}
- ★要確認一覧の運用（抽出して見やすい一覧で処理）
- 日次準備（予約札＋当日まとめ）を手動/自動（トリガー）で実行
- （任意）LINE：Push送信・Webhook受信・変更導線の運用:contentReference[oaicite:2]{index=2}
- （任意）バックアップ：スプレッドシートの定期バックアップ（Drive）:contentReference[oaicite:3]{index=3}

---

## 最短で動かす（初期導入の最短手順）

1. **テンプレのスプレッドシート**（このスクリプトが紐づいたもの）をコピー
2. フォームがそのスプレッドシートに紐づいていることを確認
3. Apps Script の初回承認（権限）を完了
4. 使う機能分の **Script Properties** を設定
5. トリガー設定（必須：`onFormSubmit`／任意：日次準備・バックアップ）

運用開始前チェックは `docs/setup/checklist-prelaunch.md` 推奨。:contentReference[oaicite:4]{index=4}

---

## 前提（シート）

最低限、以下が揃っている想定です（テンプレに同梱）。:contentReference[oaicite:5]{index=5}

- 注文一覧
- 当日まとめ
- 予約札
- メニューマスタ
- ★要確認一覧
- ログ

> うまく動かない時はまず `ログ` と Apps Script 実行履歴を確認してください（詳細：`docs/troubleshooting/logs.md`）。

---

## Script Properties（重要）

「使う機能だけ」設定すればOKです（未設定でもデフォルトで動く項目あり）。

### 1) LINE連携を使う場合（任意）
- `LINE_TOKEN`（Push等に使用）
- `WEBHOOK_KEY`（Webhook URL の `?key=` による簡易認証）:contentReference[oaicite:6]{index=6}:contentReference[oaicite:7]{index=7}

### 2) バックアップを使う場合（任意）
- `BACKUP_FOLDER_ID`（バックアップ保存用の親フォルダID）:contentReference[oaicite:8]{index=8}
- 追加で保持期間なども設定可能（未設定時のデフォルトあり）:contentReference[oaicite:9]{index=9}

### 3) 推奨（ログ）
- `LOG_LEVEL`, `LOG_MAX_ROWS`（ログ運用の安定化に推奨）:contentReference[oaicite:10]{index=10}

---

## トリガー（必須 / 任意）

- **必須**：フォーム送信 → `onFormSubmit`:contentReference[oaicite:11]{index=11}
- **任意**：日次準備 → `dailyPrepTrigger`:contentReference[oaicite:12]{index=12}
- **任意**：バックアップ → `backupSpreadsheetDaily`:contentReference[oaicite:13]{index=13}

詳細手順：`docs/setup/triggers.md`

---

## 日々の運用（ざっくり）

当日朝にやること（例）：
- `★予約管理 → 指定日の予約札を作成`
- `★予約管理 → 当日まとめシートを更新`:contentReference[oaicite:14]{index=14}

※さらに詳しい運用導線：`docs/operations/daily-check.md` / `docs/operations/order-flow.md`

---

## LINE Webhook（任意）とセキュリティ

このプロジェクトは Webアプリとして公開してWebhookを受ける構成を取れます。  
`appsscript.json` 上、Webアプリは **`executeAs: USER_DEPLOYING` / `access: ANYONE_ANONYMOUS`** の設定です。:contentReference[oaicite:15]{index=15}

- そのため、Webhookは `WEBHOOK_KEY`（URLクエリ）で簡易的に弾く前提:contentReference[oaicite:16]{index=16}
- `WEBHOOK_KEY` は漏れないように管理してください（共有・公開注意）

詳細：`docs/setup/deployment.md` / `docs/troubleshooting/line-webhook-fails.md`

---

## 管理者/閲覧者（メニュー表示制御）

「★予約管理」の一部メニューは管理者だけに出せます。  
管理者判定の基本：**スプレッドシートオーナー + Script Properties の `ADMIN_EMAILS`（任意）**:contentReference[oaicite:17]{index=17}

詳細：`docs/setup/menu-visibility.md`

---

## トラブルシュート

- まずログ：`docs/troubleshooting/logs.md`
- トリガー系：`docs/troubleshooting/trigger-issues.md`
- フォーム文言ズレ：`docs/troubleshooting/form-title-mismatch.md`
- 二重登録：`docs/troubleshooting/duplicate-orders.md`

---

## 開発メモ

- Apps Script：V8 / タイムゾーン：Asia/Tokyo:contentReference[oaicite:18]{index=18}

---

## License

TBD（社内/店舗運用なら “Proprietary” または “All rights reserved” の扱いが無難です）
