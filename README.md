# 弁当予約フォーム（Googleフォーム + スプレッドシート + Apps Script）

Googleフォームの回答をスプレッドシート（注文一覧）に保存し、  
**予約札作成**／**当日まとめ（仕込み集計）**／**★要確認運用（止めて確認）** を回すための Apps Script 一式です。

---

## できること

- **注文一覧へ予約データを保存**
  - 注文番号（予約No）、氏名、電話、受取日時、明細、合計点数・金額、LINE_ID などを列管理（A〜P）  
- **ステータス運用（B案）**
  - 有効（空欄）/ 無効（`無効`）/ 要確認（`★要確認`）  
  - 予約札・当日まとめは **有効（空欄）のみ** を対象に生成  
- **★要確認一覧（Web UI）**
  - 電話未入力・理由未記入・変更元Noあり等の“確認待ち”を一覧し、  
    有効に戻す／要確認のまま更新／無効化／変更適用 などの操作が可能
- **予約札作成**
  - 指定日（例：`1/30`）の有効予約だけを抽出し、印刷用の予約札を作成
- **当日まとめ（仕込み集計）**
  - 指定日（例：`1/30`）の有効予約を集計し、グループ別数量などを出力
- **ログ（ログ肥大化対策あり）**
  - `LOG_LEVEL` と `LOG_MAX_ROWS` で制御し、一定以上なら古い行を間引き

---

## ステータス運用（重要）

`注文一覧` の **ステータス列（M列）** は次の定義です。

- **有効**：`""`（空欄）
- **無効**：`"無効"`
- **要確認**：`"★要確認"`

> 予約札・当日まとめは **有効（空欄）の行だけ** を対象にします。  
> 締切後送信など「最終防波堤」で無効扱いに落とす設計になっています（`INVALID`）。  

---

## 注文一覧シートの列（A〜P）

`Config.gs` の `CONFIG.COLUMN`（現行）に準拠：

| 列 | キー | 用途 |
|---|---|---|
| A | TIMESTAMP | 記録日時 |
| B | ORDER_NO | 予約No |
| C | TEL | 電話番号 |
| D | NAME | 氏名 |
| E | PICKUP_DATE | 受取日時（表示用） |
| F | NOTE | 備考 |
| G | DETAILS | 注文明細（改行区切り） |
| H | TOTAL_COUNT | 合計点数 |
| I | TOTAL_PRICE | 合計金額 |
| J | LINE_ID | LINE_ID（連携用） |
| K | DAILY_SUMMARY | 当日まとめ連携（必要なら） |
| L | REGULAR_FLG | 常連フラグ |
| M | STATUS | ステータス（B案） |
| N | REASON | 理由（B案） |
| O | SOURCE_NO | 変更元予約No |
| P | PICKUP_DATE_RAW | Date型（内部判定用） |

---

## Script Properties（主要キー）

> すべて `Script Properties` に設定します（値は文字列）。

### ログ

- `LOG_LEVEL`（例：`WARN`）
- `LOG_MAX_ROWS`（例：`2000`）

### バックアップ（運用）

- `BACKUP_FOLDER_ID`
- `BACKUP_AT_HOUR`
- `BACKUP_DAILY_RETENTION_DAYS`
- `BACKUP_DAILY_FOLDER_KEEP_MONTHS`
- `BACKUP_MONTHLY_FOLDER_NAME`
- `BACKUP_MONTHLY_RETENTION_MONTHS`
- `BACKUP_USE_MONTHLY_FOLDER`

### 日次準備（予約札 + 当日まとめ 自動作成）

- `DAILY_PREP_AT_HOUR`
- `DAILY_PREP_AT_MINUTE`
- `DAILY_PREP_OFFSET_DAYS`
- `DAILY_PREP_WEEKDAYS`

### 締切後送信検知（メール通知）

- `LATE_SUBMISSION_NOTIFY_ENABLED`
- `LATE_SUBMISSION_NOTIFY_TO`

### デバッグ（任意）

- `DEBUG_MAIN`
- `DEBUG_ORDER_SAVE`

### メニュー表示制御（任意）

- `MENU_SHOW_ADVANCED`
- `MENU_SHOW_ORDERNO`
- `MENU_SHOW_NAME_CONFLICT`
- `MENU_SHOW_STATUS`
- `MENU_SHOW_BACKUP`
- `MENU_SHOW_SETUP`
- `MENU_SHOW_PROP_CHECK`

---

## 使い方（運用フロー例）

### 1) 毎日のチェック（★要確認を潰す）
1. **★要確認一覧** を開く
2. 対象行の理由を埋める / 電話を補完する / 変更元Noを確認する
3. 問題なければ **有効に戻す**（空欄へ）

### 2) 前日 or 当日の準備
- **予約札作成**：日付入力（例 `1/30`）→ 有効予約のみ出力
- **当日まとめ更新**：同日分の有効予約のみ集計して出力

---

## よくあるエラー / トラブルシュート

### 予約札作成をトリガーで回したら止まる
トリガー実行は UI が使えないため、日付未指定だとエラーになります。  
トリガー運用する場合は「日付が自動で決まる導線（Offset Days など）」のある日次準備機能を使うか、関数に日付を渡す形にしてください。

### ログが肥大化する
`LOG_MAX_ROWS` を適切に設定してください。一定以上は古い行を削る設計です。

---

## 開発メモ（構造）

- `Config.gs`：列定義・ステータス定義・プロパティキー群
- `OrderService.gs`：注文保存、ステータス付与（要確認/無効の判定など）
- `createDailyReservationCards` / `createProductionSheet`：帳票出力
- `★要確認一覧`：Web UI（一覧→行更新）

---

## License

TBD（運用に合わせて追記）
```

---

### READMEに反映済みの“現行仕様”根拠（抜粋）

* ステータス定義（有効=空欄、無効=`無効`、要確認=`★要確認`）と列定義（A〜P）
* Script Properties の主要キー（バックアップ／日次準備／通知／メニュー表示制御など）
* 予約札・当日まとめが **有効（空欄）のみ対象** であること
* ★要確認一覧UIでの操作（有効/要確認/無効/変更適用）
* 締切後送信が最終的に `INVALID`（無効）へ落ちる扱い

必要なら、このREADMEに **「初期導入（テンプレ複製→プロパティ設定→トリガー→LINE/フォーム紐付け）」の手順を、実際のメニュー名・関数名に合わせて追記**した完全版にも整えます。
