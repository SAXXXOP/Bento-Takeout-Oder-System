# 弁当テイクアウト予約管理システム（LINE × Googleフォーム × スプレッドシート）

LINE公式アカウントから「予約する」→ Googleフォームで注文 → Apps Script がスプレッドシートへ記録＆確認メッセージ送信、までを一気通貫で運用するための仕組みです。  
実運用向けに **バックアップ（自動/手動）**、**導入ツール（安全な本番初期化/トリガー設定）**、**ステータス運用ガード（B案）** を搭載しています。

## 詳細マニュアル 
docs/index.md

---

## できること（主な機能）

- **予約受付（Googleフォーム） → 注文一覧へ自動記録**
- **LINEへ受付完了メッセージ送信**
- **予約変更フロー（LINE上で変更可能な予約の提示 → 変更受付）**
- **当日まとめシート生成／予約札（印刷用）生成**
- **顧客名簿の管理（サイドバーで備考編集）**
- **ステータス運用（B案）**
  - 有効：空欄
  - 無効：`無効`
  - 要確認：`★要確認`
- **バックアップ**
  - 日次バックアップ（保持/整理）
  - 月次スナップショット（保持）
  - 手動スナップショット（メニューから）
- **導入ツール**
  - 本番初期化（テストデータ削除）
  - フォーム送信トリガーの設定/削除
  - Script Properties の必須項目チェック

---

## 全体フロー（概念）

```mermaid
flowchart LR
  A[LINE公式アカウント] -->|LIFF/リッチメニュー| B[Googleフォーム]
  B --> C[フォーム回答]
  C -->|onFormSubmit| D[Apps Script]
  D --> E[スプレッドシート: 注文一覧/顧客名簿]
  D --> F[LINEへ受付メッセージ]
  A <-->|Webhook| G[Apps Script WebApp doPost]
````

---

## 前提（用意するもの）

* Googleアカウント（スプレッドシート/フォーム/Apps Script）
* LINE公式アカウント（Messaging API）
* 本リポジトリ（Apps Script 一式）

---

## シート構成（必須）

スプレッドシートに以下のシート名が存在する前提です。

* `注文一覧`
* `顧客名簿`
* `メニューマスタ`
* `当日まとめ`
* `予約札`
* `★要確認一覧`

> ※列構成は `Config.gs` の定義に依存します。新規導入時はテンプレート複製が安全です。

---

## 初期設定（新店舗・新環境の導入手順）

### 1) スプレッドシートを用意（テンプレを複製推奨）

* テンプレ（運用実績のあるシート）を **ファイルごと複製**して新店舗用にするのが最も安全です。

### 2) Apps Script を紐付け

* スプレッドシートにコンテナバインドで Apps Script を紐付け
* 本リポジトリの `.gs` / `.html` / `appsscript.json` を配置

### 3) Googleフォームの準備

* フォームの質問タイトルは `Config.gs` の `CONFIG.FORM` と一致している必要があります。

  * 例：`氏名` / `電話番号` / `受け取り希望日` / `元予約No` / `LINE_ID(自動入力)` / `抜き物などご要望`

### 4) Script Properties を設定（必須）

Apps Script の **プロジェクト設定 → スクリプト プロパティ** に設定します。

#### 必須（最低限）

* `LINE_TOKEN`：LINE Messaging API のチャネルアクセストークン
* `WEBHOOK_KEY`：Webhook の簡易認証キー（URL の `?key=` で使用）

#### 推奨（運用）

* `BACKUP_FOLDER_ID`：バックアップ保存先の親フォルダID（Googleドライブ）
* `BACKUP_AT_HOUR`：日次バックアップの実行時刻（例：`3`）
* `BACKUP_DAILY_RETENTION_DAYS`：日次を何日残すか（例：`60`）
* `BACKUP_MONTHLY_RETENTION_MONTHS`：月次を何ヶ月残すか（例：`12`）
* `BACKUP_USE_MONTHLY_FOLDER`：`1` 推奨（Backups_YYYYMM フォルダ運用）
* `BACKUP_DAILY_FOLDER_KEEP_MONTHS`：古い月フォルダ掃除の目安（例：`3`）
* `BACKUP_MONTHLY_FOLDER_NAME`：月次スナップショット用フォルダ名（例：`MonthlySnapshots`）

#### 任意（デバッグ/ログ）

* `LOG_LEVEL` / `LOG_MAX_ROWS`
* `DEBUG_MAIN` / `DEBUG_ORDER_SAVE`

---

## Webhook（LINE）設定

本プロジェクトは Apps Script を **Webアプリ**としてデプロイし、LINE Webhook を受けます。

### 1) Webアプリとしてデプロイ

* デプロイ → 新しいデプロイ → 種類：ウェブアプリ
* 実行するユーザー：`自分`
* アクセス：`全員`（Webhook 受信のため）

### 2) LINE Webhook URL

Webhook URL は次の形になります（例）：

`https://script.google.com/macros/s/<DEPLOYMENT_ID>/exec?key=<WEBHOOK_KEY>`

> ※ `WEBHOOK_KEY` が一致しない場合は処理しない簡易認証です。

---

## トリガー設定（重要）

### フォーム送信トリガー（必須）

スプレッドシートを開き、メニューから設定できます：

* `★予約管理` → `導入ツール` → `フォーム送信トリガー設定`

（不要になったら `フォーム送信トリガー削除` も可能）

### 日次バックアップトリガー（推奨）

* `installDailyBackupTrigger` を実行（実装されている場合）
* `BACKUP_AT_HOUR` を設定しておくと運用しやすいです

---

## 本番運用前の初期化（テストデータ掃除）

スプレッドシートを開き、メニューから実行：

* `★予約管理` → `導入ツール`

  * `本番初期化（テストデータ削除）`
  * `本番初期化（＋フォーム回答も削除）`（必要な場合のみ）

---

## 日々の運用（オペレーション）

### ① 朝（当日分の準備）

* `★予約管理` → `★要確認一覧を更新`
* `★予約管理` → `当日まとめシートを更新`
* `★予約管理` → `指定日の予約札を作成`

### ② 要確認の処理

* `★予約管理` → `★要確認一覧を開く`
* 原因を確認して、ステータス/理由を更新
  （No指定メニュー：有効に戻す／無効／★要確認／理由だけ編集）

### ③ 顧客備考の更新（調理/事務）

* `★予約管理` → `顧客備考を編集（サイドバー）`

---

## バックアップ運用

### 自動（日次＋月次）

* 日次：保持日数を超えたものを整理
* 月次：月次スナップショットを保持（月数で整理）

### 手動（大きな変更の前に推奨）

* `★予約管理` → `バックアップ` → `手動スナップショット作成`

---

## トラブルシュート

### 「onFormSubmit は完了しているのに注文一覧に反映されない」

* トリガーが正しい関数に紐づいているか確認（導入ツールから再設定推奨）
* シート名が `Config.gs` と一致しているか確認（`注文一覧` など）
* `Config.gs` の列定義が実シートと一致しているか確認（ステータス/理由列を追加した場合など）
* 実行ログ（Apps Script の実行）・ログシート（実装がある場合）を確認

---

## リポジトリ構成

主要ファイル（抜粋）：

* `System.gs`：スプレッドシートのメニュー（★予約管理）定義
* `Main.gs`：メイン処理（フォーム→保存→通知 などの起点）
* `LineWebhook.gs`：Webhook受信（doPost）
* `LineService.gs`：LINE送信（push/reply など）
* `BackupService.gs`：日次/月次/手動スナップショット
* `AdminTools.gs`：ステータス移行/運用ガード/理由チェック等
* `ProductionSheet.gs`：当日まとめ生成
* `ReservationCards.gs`：予約札生成
* `CustomerService.gs` / `CustomerForm.html`：顧客名簿・備考編集UI
* `Config.gs`：シート名、フォーム項目名、列定義、プロパティキー等
* `appsscript.json`：タイムゾーン/ランタイム/WebApp 設定

---

## セキュリティ注意

* Webアプリは「全員」アクセスで公開しますが、URL に `?key=` を必須化して簡易認証しています。
* Script Properties（特に `LINE_TOKEN`）は **GitHub にコミットしない**でください。

---

## ライセンス

必要に応じて追記してください（未設定の場合は `LICENSE` を追加推奨）。

```

---

### 反映済みポイント（このREADMEが拾っている“実運用向け追加/修正”の根拠）
- **導入ツール（本番初期化／フォーム送信トリガー設定/削除）＋ Script Properties チェック**をメニューに搭載：`System.gs`:contentReference[oaicite:0]{index=0}
- **ステータス運用（有効=空欄／無効／★要確認）**の定義：`Config.gs`:contentReference[oaicite:1]{index=1}
- **Script Properties キー一覧（LINE_TOKEN/WEBHOOK_KEY/バックアップ系/ログ/デバッグ）**：`Config.gs`:contentReference[oaicite:2]{index=2}
- **バックアップ運用（日次60日＋月次12ヶ月、推奨プロパティ）**：`BackupService.gs` ヘッダ:contentReference[oaicite:3]{index=3}
- **Webhook の簡易認証（?key=必須）＋ 重複排除（Cache）＋ payload 制限**：`LineWebhook.gs doPost`:contentReference[oaicite:4]{index=4}

必要なら、この README を「現場向けにさらに短くした版（Quick Start だけ）」と、「運用手順を分離した `docs/operations.md`」の2ファイル構成に整える案も、こちらで作れます。
```
