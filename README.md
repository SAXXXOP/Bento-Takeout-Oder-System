# 弁当予約フォーム（Googleフォーム + LINE連携 / Google Apps Script）

Googleフォームの予約をスプレッドシートに記録し、営業日の「当日まとめ」「予約札」を作成します。  
LINE公式アカウント（Webhook）からの「予約確認・変更」も同じスプレッドシートを参照して動作します。

---

## できること

- Googleフォーム送信（onFormSubmit）→「注文一覧」へ記録
- 顧客情報の自動蓄積（「顧客名簿」更新）
- 「当日まとめ」「予約札」生成（手動 / トリガー）
- ステータス運用（有効 / 無効 / ★要確認）と、要確認の抽出ビュー作成
- LINE Webhook（Apps Script Webアプリ）で予約変更フロー（Flex UI）
- （任意）自動バックアップ、締切後送信のメール通知
- ログを「ログ」シートに追記（存在しなければ自動作成）

---

## スプレッドシート構成（固定シート名）

> ※シート名は **Config.gs の固定定義** に合わせてください（手入力で名前変更すると動作しません）

| シート名 | 用途 | 備考 |
|---|---|---|
| 注文一覧 | 予約データの本体 | onFormSubmit が追記 |
| 顧客名簿 | 顧客マスタ | LINE_ID / 電話 / 備考など |
| メニューマスタ | 商品マスタ | 略称・自動返信表示名など |
| 当日まとめ | 当日分の集計出力 | 生成のたびに更新 |
| 予約札 | 当日分の予約札出力 | 生成のたびに更新 |
| ★要確認一覧 | ステータス「★要確認」の抽出 | 定期更新トリガーあり |
| 氏名不一致ログ | 氏名変更等の不整合ログ | 運用確認用 |
| ログ | 実行ログ | 自動作成（存在しなければ追加） |

---

## シートの列仕様（重要）

### 注文一覧（A〜P）

| 列 | 項目 | 備考 |
|---|---|---|
| A | TIMESTAMP | 記録日時 |
| B | ORDER_NO | 予約No（例：`0203-1`）※先頭に `'` を付けて保存 |
| C | TEL | 電話番号 |
| D | NAME | お名前 |
| E | PICKUP_DATE | 受取日付（表示用） |
| F | NOTE | 備考/リクエスト |
| G | DETAILS | 注文内訳（複数行） |
| H | TOTAL_COUNT | 合計数 |
| I | TOTAL_PRICE | 合計金額 |
| J | LINE_ID | LINE userId |
| K | DAILY_SUMMARY | 当日まとめ作成用（内部） |
| L | REGULAR_FLG | 常連フラグ |
| M | STATUS | ステータス（B案運用） |
| N | REASON | 理由（B案で追加） |
| O | SOURCE_NO | 変更元予約No |
| P | PICKUP_DATE_RAW | Date型（内部用） |

### 顧客名簿（A〜L）

| 列 | 項目 | 備考 |
|---|---|---|
| A | LINE_ID | userId |
| B | NAME | 氏名 |
| C | TEL | 電話番号 |
| D | FIRST_VISIT | 初回来店 |
| E | LAST_VISIT | 最終来店 |
| F | VISIT_COUNT | 回数 |
| G | TOTAL_SPEND | 累計 |
| H | NOTE_COOK | 備考（調理） |
| I | NOTE_OFFICE | 備考（事務） |
| J | HISTORY_1 | 履歴 |
| K | HISTORY_2 | 履歴 |
| L | HISTORY_3 | 履歴 |

### メニューマスタ（A〜G）

| 列 | 項目 | 備考 |
|---|---|---|
| A | ID | 管理用 |
| B | GROUP | グルーピング |
| C | MENU_NAME | 親メニュー名（フォーム質問文と関係） |
| D | SUB_MENU | 小メニュー/選択肢 |
| E | PRICE | 価格 |
| F | SHORT_NAME | 略称（内部キー） |
| G | AUTO_REPLY_NAME | 自動返信表示名（任意） |

---

## ステータス運用（注文一覧 M列）

- `""`（空）: **有効**（作る・集計する）
- `無効` : **除外**（作らない・集計しない）
- `★要確認` : **止めて確認**（要確認一覧に出す）

---

## Script Properties（スクリプトプロパティ）

### 必須
- `LINE_TOKEN`：LINE Messaging API のチャネルアクセストークン
- `WEBHOOK_KEY`：Webhook URL に `?key=...` を必須化するためのキー  
  （例：`https://script.google.com/macros/s/XXXX/exec?key=YOUR_KEY`）

### 任意（運用・デバッグ）
- ログ関連：`LOG_LEVEL`, `LOG_MAX_ROWS`
- デバッグ：`DEBUG_MAIN`, `DEBUG_ORDER_SAVE`
- メニュー表示：`MENU_SHOW_ADVANCED` ほか（必要に応じて）

### 任意（自動化）
- バックアップ：`BACKUP_FOLDER_ID` ほか
- 当日準備：`DAILY_PREP_AT_HOUR`, `DAILY_PREP_WEEKDAYS`
- 締切後送信通知：`LATE_SUBMIT_NOTIFY_EMAIL`, `LATE_SUBMIT_NOTIFY_AT_HOUR`, `LATE_SUBMIT_NOTIFY_AT_MIN`

---

## セットアップ手順（最短）

1. **テンプレートSpreadsheet**を作成し、上記の固定シート名でシートを用意  
2. Apps Script をスプレッドシートに紐付け（このリポジトリを配置）
3. **プロジェクトの設定 → スクリプトプロパティ**に `LINE_TOKEN` と `WEBHOOK_KEY` を設定
4. スプレッドシートを開き、メニューから **導入ツール**を実行  
   - フォーム送信トリガー作成  
   - 当日準備トリガー作成  
   - ★要確認一覧の定期更新トリガー作成  
   - （必要なら）バックアップ、締切後送信通知
5. LINE側（Webhook）  
   - Apps Script を **Webアプリとしてデプロイ**
   - Webhook URL に `?key=WEBHOOK_KEY` を付けてLINE Developers側へ設定

---

## 運用メニュー（例）

- 顧客備考を編集（サイドバー）
- 指定日の予約札を作成
- 当日まとめシートを更新
- ステータス移行/ガード/監査（必要時のみ）
- バックアップ（今すぐ/自動/解除）
- 導入ツール（トリガー作成/解除、プロパティチェック等）

※メニュー表示は Script Properties の「MENU_SHOW_*」で制御できる想定です。

---

## よくある不具合

- **シートが見つからない**  
  → シート名が固定名と一致しているか確認（全角/半角・スペースも注意）

- **LINE webhook が動かない**  
  → WebアプリURLに `?key=` が付いているか、`WEBHOOK_KEY` が一致しているか確認

- **ログが増えすぎる**  
  → `LOG_MAX_ROWS` を設定（上限超過時に古い行を削除）

---

## ライセンス

TBD（運用方針に合わせて LICENSE を追加してください）
```

必要なら、あなたが前に作ったREADMEとの差分（どのシート名が誤っていたか）も、この現行版を基準に洗い出して箇条書きで返します。
