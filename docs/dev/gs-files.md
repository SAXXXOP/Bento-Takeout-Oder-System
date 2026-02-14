# .gs ファイル一覧と役割

改修時に「どこを触るべきか」を迷わないための一覧です。

---

## 起点（入口）
- `System.gs`：`onOpen()` でメニュー構築、権限チェック、メニュー再表示
- `Main.gs`：フォーム送信のエントリ（`onFormSubmit`）・変更/締切チェック・要確認理由集約

---

## コア業務（止まると業務が止まる）
- `FormService.gs`：フォーム回答の解析・正規化（複数回答/自由記入など）
- `ReservationService.gs`：予約No発行
- `OrderService.gs`：注文一覧への保存、ステータス/理由付与、変更元予約Noの記録
- `ReservationCards.gs`：予約札の生成
- `ProductionSheet.gs`：当日まとめの生成
- `DailyPrepService.gs`：日次準備（当日まとめ + 予約札）をまとめて実行、締切後送信通知の呼び出し

---

## 要確認ワークフロー
- `NeedsChechView.gs`：★要確認一覧の作成・更新・表示（※ファイル名は現状のまま）
- `NeedsCheckWorkflow_.gs` / `NeedsCheckWorkflow.html`：サイドバーUI（Apps Script ↔ HTML）

---

## 通知（任意）
- `OpsNotifyService.gs`：運用通知（1時間まとめ）キュー作成/送信/掃除
- `LineWebhook.gs`：`doPost(e)` でWebhook受信（`WEBHOOK_KEY` の簡易認証）
- `LineService.gs`：Push/返信などの送受信ヘルパ

---

## バックアップ（任意）
- `BackupService.gs`：Drive へのバックアップ（日次 + 手動スナップショット、保持/フォルダ整理）

---

## 管理・導入補助
- `SetupTools.gs`：トリガー設定、日次準備設定、本番初期化、プロパティ最小化
- `AdminTools.gs`：ステータス移行、監査、運用ガード再適用
- `MenuRepository.gs`：メニュー構築補助（存在する関数だけ表示）

---

## 共通基盤
- `Config.gs`：CONFIG（フォーム/タブ/列/プロパティキー/ステータス）
- `ScriptProps.gs`：Script Properties の読み書き、キャッシュ
- `MenuVisibility.gs`：管理者/閲覧者の判定（`ADMIN_EMAILS` + フォールバック）
- `SheetVisibility.gs`：タブの表示/非表示を役割と同期
- `Utils.gs`：日付/文字列/配列などの汎用関数、ログ出力
- `SchemaExport.gs` / `FormSchemaExport.gs`：テンプレのシートID/フォーム情報の書き出し（導入・保守向け）
