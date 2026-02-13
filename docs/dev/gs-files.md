# .gs ファイル一覧と役割

改修時に「どこを触るべきか」を迷わないための一覧です。

---

## 起点（入口）
- `System.gs`：`onOpen()` でメニュー構築、サイドバー表示、権限チェック、メニュー再表示
- `Main.gs`：フォーム送信のエントリ（`onFormSubmit`）など、全体の呼び出し口

## コア業務（止まると業務が止まる）
- `FormService.gs`：フォーム回答の解析・正規化
- `OrderService.gs`：注文一覧への保存、予約No発行、要確認理由付与、変更元予約Noの取り扱い
- `ReservationCards.gs`：予約札の生成
- `ProductionSheet.gs`：当日まとめの生成
- `DailyPrepService.gs`：日次準備（当日まとめ + 予約札）をまとめて実行、トリガー運用

## 要確認ワークフロー
- `NeedsChechView.gs`：★要確認一覧の作成・更新・表示（※ファイル名は現状のまま）
- `NeedsCheckWorkflow_.gs` / `NeedsCheckWorkflow.html`：サイドバーのワークフローUI（Apps Script ↔ HTML）

## LINE連携（任意）
- `LineWebhook.gs`：`doPost(e)` でWebhook受信（`WEBHOOK_KEY` の簡易認証）
- `LineService.gs`：Push/返信などの送受信ヘルパ

## バックアップ（任意）
- `BackupService.gs`：Driveへのバックアップ（手動/日次、保持期間など）

## 管理・導入補助
- `SetupTools.gs`：トリガー設定、初期化、プロパティの最小化/整理など（導入ツール配下）
- `AdminTools.gs`：監査/復旧系の補助（ステータス監査、ガード再適用など）
- `MenuRepository.gs`：メニュー構築の補助（存在する関数だけ表示、など）

## 共通基盤
- `Config.gs`：CONFIG（フォーム/タブ/列/プロパティキー/ステータス）
- `ScriptProps.gs`：Script Properties の読み書き、プレースホルダ扱い、キャッシュ
- `MenuVisibility.gs`：管理者/閲覧者の判定（`ADMIN_EMAILS` + フォールバック）
- `SheetVisibility.gs`：タブの表示/非表示を役割と同期
- `Utils.gs`：日付/文字列/配列などの汎用関数
- `SchemaExport.gs` / `FormSchemaExport.gs`：テンプレのシートID/フォーム情報の書き出し（導入・保守向け）
