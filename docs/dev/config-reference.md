# CONFIG 参照（設定値の意味）

## 目的
`Config.gs` に集約している前提（シート名/列/フォーム質問タイトル/プロパティキー）を一覧化し、変更時の事故を防ぎます。

---

## CONFIG.FORM（フォーム質問タイトル：部分一致）
フォーム側の「質問文」を変えると壊れやすいので、変更したら必ずここも合わせます。

- NAME_SHORT：お名前（部分一致）
- PHONE：電話番号
- PICKUP_DATE：受け取り希望日
- PICKUP_TIME：受取り希望時刻
- OLD_RESERVATION_NO：元予約No
- LINE_ID：LINE_ID(自動入力)
- NOTE：抜き物などご要望

> `title.includes(...)` 判定のため、完全一致ではなく“部分一致”で拾います。  
> それでも文言が大きく変わると拾えなくなるので注意。

---

## CONFIG.SHEET（タブ名）
- ORDER_LIST：注文一覧
- MENU_MASTER：メニューマスタ
- DAILY_SUMMARY：当日まとめ
- RESERVATION_CARD：予約札
- NEEDS_CHECK_VIEW：★要確認一覧
- HOLIDAYS：休業日設定
- LOG：ログ
- FORM_RESPONSES：フォームの回答 1（Googleフォーム側が作る）

---

## CONFIG.COLUMN（注文一覧の列：位置固定）
注文一覧の列位置は `CONFIG.COLUMN` で固定しています（詳細は `dev/sheets-and-columns.md`）。

---

## CONFIG.STATUS（ステータス文言：B案）
- 有効：`""`（空）
- 無効：`"無効"`
- 要確認：`"★要確認"`

---

## CONFIG.PROPS（Script Properties のキー名）
値は Script Properties に保存し、コードではキー名をここから参照します。

- LINE：`LINE_TOKEN`, `WEBHOOK_KEY`
- ログ：`LOG_LEVEL`, `LOG_MAX_ROWS`
- バックアップ：`BACKUP_FOLDER_ID`（ほか任意キーあり）
- 日次準備：`DAILY_PREP_*`
- 締切後送信通知：`LATE_SUBMISSION_NOTIFY_*`
- 管理者判定：`ADMIN_EMAILS`（互換：`MENU_SHOW_ADVANCED`）

---

## レガシー/未使用メモ
`CONFIG.CUSTOMER_COLUMN` は旧「顧客名簿」タブ向けの名残で、現行運用では使用しません。
