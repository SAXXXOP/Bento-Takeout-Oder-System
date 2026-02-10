# 弁当予約フォーム（Googleフォーム + スプレッドシート + Apps Script）

Googleフォームの予約送信を起点に、スプレッドシートへ **注文一覧の記録 / 予約No発行 / 顧客名簿更新 / （任意で）LINE通知** を行う運用ツールです。  
日々の業務として **予約札作成** と **当日まとめ更新** をメニューまたは自動（トリガー）で実行できます。:contentReference[oaicite:0]{index=0}:contentReference[oaicite:1]{index=1}

---

## できること（概要）

- フォーム送信時に `注文一覧` へ1行追加（予約No発行、顧客名簿更新、要確認理由の付与など）:contentReference[oaicite:2]{index=2}:contentReference[oaicite:3]{index=3}
- ステータス運用（B案）
  - 有効：`""`（空）
  - 無効：`"無効"`
  - 要確認：`"★要確認"`:contentReference[oaicite:4]{index=4}
- 日次準備（予約札 + 当日まとめ）を **手動/自動（トリガー）** で作成:contentReference[oaicite:5]{index=5}:contentReference[oaicite:6]{index=6}
- （任意）LINE Webhook / Push による通知・変更導線  
  Webアプリ公開 + `WEBHOOK_KEY` による簡易認証あり:contentReference[oaicite:7]{index=7}:contentReference[oaicite:8]{index=8}

---

## 先に結論：初期導入の最短手順

1. **テンプレのスプレッドシート**（このスクリプトが紐づいたもの）をコピー
2. スプレッドシートで Apps Script を開き、必要な **Script Properties** を設定
3. フォーム送信トリガーを設定（`onFormSubmit`）
4. 必要なら、**日次準備トリガー** と **バックアップトリガー** を設定

---

## 前提（シート/フォーム）

### 必須シート名（CONFIG.SHEET）
以下の名前でシートが存在する前提です（テンプレに同梱想定）:contentReference[oaicite:9]{index=9}。

- 注文一覧
- 当日まとめ
- 予約札
- 顧客名簿
- メニューマスタ
- 要確認一覧
- ログ
- 設定

> 注文一覧の列位置は `CONFIG.COLUMN` で固定（A=TIMESTAMP, B=ORDER_NO, …）です:contentReference[oaicite:10]{index=10}。

### フォームの質問タイトル（CONFIG.FORM）
フォーム側の「質問文（タイトル）」が一致している必要があります:contentReference[oaicite:11]{index=11}。

- 氏名
- 電話番号
- 受け取り希望日
- 受取り希望時刻
- 備考
- 注文
- 予約番号（変更用）
- LINE_ID(自動入力)

> 送信トリガーのイベント `e.response` が無い場合でも、スプレッドシートに紐づくフォームURLから「最新回答」を取得して処理します:contentReference[oaicite:12]{index=12}。  
> そのため、トリガー設定の違いでイベント形式が変わっても動作しやすい設計です。

---

## セットアップ

### 1) Script Properties（重要）

#### 必須（運用により）
- **LINE連携を使う場合**
  - `LINE_TOKEN`（Push等に使用）
  - `WEBHOOK_KEY`（Webhook URL に `?key=` を必須化する簡易認証）:contentReference[oaicite:13]{index=13}

- **バックアップを使う場合**
  - `BACKUP_FOLDER_ID`（バックアップ保存用の親フォルダID）:contentReference[oaicite:14]{index=14}:contentReference[oaicite:15]{index=15}

#### 任意（推奨/運用で）
- バックアップの保持期間や月次設定など（未設定時のデフォルトあり）:contentReference[oaicite:16]{index=16}
- デバッグ：`DEBUG_MAIN`, `DEBUG_ORDER_SAVE` など:contentReference[oaicite:17]{index=17}
- メニュー表示制御：`MENU_SHOW_*`（普段使わないメニューを隠す）:contentReference[oaicite:18]{index=18}

> テンプレ配布/初期化向けに Script Properties を一括で用意する関数もあります（`ensureTemplateScriptProperties`, `overwriteTemplateScriptProperties`）。

---

### 2) フォーム送信トリガー（必須）

Apps Script の「トリガー」から、関数 `onFormSubmit` を「フォーム送信時」に紐づけます。  
`onFormSubmit` はフォーム解析→保存→（任意で）LINE通知まで行います:contentReference[oaicite:20]{index=20}:contentReference[oaicite:21]{index=21}。

---

### 3) 日次準備（予約札 + 当日まとめ）トリガー（任意）

スプレッドシートメニューに「導入ツール」があり、ここから設定できます:contentReference[oaicite:22]{index=22}。

- 日次準備設定を開く
- 日次準備トリガーを設定
- 日次準備トリガーを削除
- （手動実行）日次準備を実行

日次準備の起動先は `dailyPrepTrigger()` です:contentReference[oaicite:23]{index=23}。

---

### 4) バックアップ（任意）

`backupSpreadsheetDaily()` が日次バックアップ本体です（方針：日次60日＋月次12ヶ月）:contentReference[oaicite:24]{index=24}:contentReference[oaicite:25]{index=25}。  
まず Googleドライブに親フォルダを作り、`BACKUP_FOLDER_ID` を設定してください。

---

## 使い方（運用）

### 予約管理メニュー
スプレッドシートのメニュー **「★予約管理」** から実行できます:contentReference[oaicite:26]{index=26}。

- 顧客備考を編集（サイドバー）
- 指定日の予約札を作成
- 当日まとめシートを更新
- （必要に応じて）ステータス運用/監査系メニュー

### 基本フロー
1. お客様がフォーム送信
2. `注文一覧` に記録（必要に応じて「★要確認」や「無効」になる）:contentReference[oaicite:27]{index=27}
3. 店舗側は日次で「予約札」「当日まとめ」を作成（手動 or 自動）

---

## LINE連携（任意）

### Webhook（Webアプリ公開）
`appsscript.json` は Webアプリ公開（匿名アクセス可）を前提にしています:contentReference[oaicite:28]{index=28}。  
Webhook は `doPost(e)` が受け、URLに `?key=` を付ける方式で簡易認証します:contentReference[oaicite:29]{index=29}。

---

## トラブルシュート

### まず見る場所：ログ
`ログ` シートに追記され、肥大化すると古い行を削る簡易ローテーションがあります:contentReference[oaicite:30]{index=30}。  
うまく動かない時は、まず `ログ` シートと Apps Script 実行履歴（エラー）を確認してください。

### よくある原因
- フォームの質問タイトルが `CONFIG.FORM` と一致していない:contentReference[oaicite:31]{index=31}
- 必須の Script Properties（例：`BACKUP_FOLDER_ID`, `WEBHOOK_KEY` など）が未設定:contentReference[oaicite:32]{index=32}:contentReference[oaicite:33]{index=33}
- トリガー未設定（`onFormSubmit` / `dailyPrepTrigger`）

---

## 開発メモ

- Apps Script ランタイム：V8 / タイムゾーン：Asia/Tokyo:contentReference[oaicite:34]{index=34}

---

## License
TBD（社内/店舗運用なら “Proprietary” または “All rights reserved” の扱いが無難です）
