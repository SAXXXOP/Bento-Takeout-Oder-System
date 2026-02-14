# 弁当予約フォーム：docs（目次）

この `docs/` は、スプレッドシート運用（★予約管理メニュー）と Apps Script 実装に合わせた手順書です。  
README の章立てと同じ順番で案内します。

---

## 1. できること（概要）
- 全体フロー（入力→記録→準備→受け渡し）：[`operations/order-flow.md`](operations/order-flow.md)

---

## 2. 初期導入（最短導線）
- 運用開始前チェック（導入前に必ず）：[`setup/checklist-prelaunch.md`](setup/checklist-prelaunch.md)
- 初期セットアップ（テンプレコピー〜テスト送信）：[`setup/initial-setup.md`](setup/initial-setup.md)

---

## 3. 前提（シート / 列 / 先頭0落ち対策）
- シート/列仕様（CONFIG.SHEET / CONFIG.COLUMN）：[`dev/sheets-and-columns.md`](dev/sheets-and-columns.md)

---

## 4. ステータス運用（B案）
- ステータスの意味・運用（空/無効/★要確認）：[`operations/order-flow.md`](operations/order-flow.md)

---

## 5. Script Properties（必要最小限）
- Script Properties 一覧（必須/推奨/任意）：[`setup/properties.md`](setup/properties.md)
- メニュー表示（管理者/閲覧者）：[`setup/menu-visibility.md`](setup/menu-visibility.md)

---

## 6. トリガー（必須/任意）
- トリガー設定（onFormSubmit / dailyPrepTrigger / backup / 通知）：[`setup/triggers.md`](setup/triggers.md)

---

## 7. 使い方（運用）
- 日々の運用（朝の流れ / 要確認処理 / 落とし穴）：[`operations/daily-check.md`](operations/daily-check.md)

---

## 8. トラブルシュート（最初に見る場所）
- ログの見方（ログタブ / 実行履歴 / 典型パターン）：[`troubleshooting/logs.md`](troubleshooting/logs.md)

---

## 9. 開発・保守（触る人向け）
- CONFIG参照（設定値の意味）：[`dev/config-reference.md`](dev/config-reference.md)
- .gs ファイル一覧と役割：[`dev/gs-files.md`](dev/gs-files.md)

---

## ルートREADME
概要はリポジトリ直下の README を参照：[`../README.md`](../README.md)
