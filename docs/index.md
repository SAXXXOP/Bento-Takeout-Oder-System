# 作業別マニュアル（弁当予約フォーム）

このページは「やりたい作業」から手順にたどり着くための目次です。  
README は“入口（概要・最短導線）”、本マニュアルは“現場で迷わない手順書”を目指します。

---

## 導入（最初にやる）
- [初期セットアップ（テンプレコピー〜動作確認）](setup/initial-setup.md)
- [権限（承認）と実行環境](setup/permissions.md)
- [Script Properties 設定](setup/properties.md)
- [Script Properties の値移植（JSONエクスポート/インポート）](setup/properties-transfer.md)
- [トリガー設定（フォーム送信 / 日次準備 / バックアップ）](setup/triggers.md)
- [バックアップ設定（任意）](setup/backup.md)
- [Webアプリ公開・Webhook（任意）](setup/deployment.md)
- [運用開始前チェックリスト](setup/checklist-prelaunch.md)
- [メニュー表示制御（管理者/閲覧者）](setup/menu-visibility.md)

## 日々の運用
- [業務フロー全体（入力→記録→準備→受け渡し）](operations/order-flow.md)
- [日々のチェック（締切後〜当日）](operations/daily-check.md)
- [要確認一覧の見方・潰し方](operations/confirm-list.md)
- [ステータス運用（有効/無効/★要確認）](operations/status-operations.md)
- [予約札を作成する（指定日）](operations/create-cards.md)
- [当日まとめを更新する](operations/production-sheet.md)
- [顧客備考（サイドバー）の使い方](operations/customer-notes-sidebar.md)
- [予約の変更・キャンセル運用](operations/change-cancel.md)
- [ノーショウ（無断キャンセル）対応の運用](operations/no-show-policy.md)
- [LINE連携の運用（任意）](operations/line-operations.md)
- [定期メンテ（ログ整理/見直し）](operations/maintenance.md)

## トラブル対応（まずここ）
- [ログの見方（最初に確認する場所）](troubleshooting/logs.md)
- [注文一覧に記録されない](troubleshooting/orders-not-written.md)
- [トリガーが動かない / 権限エラー](troubleshooting/trigger-issues.md)
- [フォーム質問タイトル不一致](troubleshooting/form-title-mismatch.md)
- [電話番号の先頭0が消える](troubleshooting/wrong-tel-leading-zero.md)
- [LINE Webhook が失敗する](troubleshooting/line-webhook-fails.md)
- [バックアップが失敗する](troubleshooting/backup-fails.md)
- [重複・二重登録が起きた](troubleshooting/duplicate-orders.md)
- [ステータスガードで更新できない](troubleshooting/status-guard.md)
- [遅い・タイムアウトする](troubleshooting/performance.md)
- [FAQ](troubleshooting/faq.md)

## 開発・改修（管理者/開発者向け）
- [アーキテクチャ概要](dev/architecture.md)
- [シート/列仕様（CONFIG.SHEET / CONFIG.COLUMN）](dev/sheets-and-columns.md)
- [CONFIG 参照（設定値の意味）](dev/config-reference.md)
- [.gs ファイル一覧と役割](dev/gs-files.md)
- [ログ設計（出し方/レベル/PII）](dev/logging.md)
- [テスト手順（本番を壊さない）](dev/testing.md)
- [リリース手順・チェックリスト](dev/release-checklist.md)
- [コーディングガイド（このリポジトリの流儀）](dev/coding-guidelines.md)
- [セキュリティ/プライバシー](dev/security.md)

## テンプレ（運用改善）
- [不具合報告テンプレ](templates/issue-report.md)
- [改修依頼テンプレ](templates/change-request.md)
