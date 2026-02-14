# Script Properties（設定値一覧）

## 目的
スクリプトの挙動に必要な設定を、**必要最低限**で管理します。  
（コード側のキー名は `Config.gs` の `CONFIG.PROPS` に一本化されています）

---

## 設定場所
Apps Script エディタ → **プロジェクトの設定** → **スクリプト プロパティ**

---

## 必須（現行の validate 基準）
> ※現状の `ScriptProps.validate()` はこの2つを必須扱いにしています。

### `LINE_TOKEN`
- LINE Messaging API のチャネルアクセストークン（Push等に使用）

### `WEBHOOK_KEY`
- `doPost(e)` での簡易認証キー（Webhook URL の `?key=` と一致させる）

---

## 推奨（運用安定）
### `LOG_LEVEL`
- `DEBUG / INFO / WARN / ERROR`
- 既定は `WARN`
- 例：`INFO`

### `LOG_MAX_ROWS`
- `ログ` タブの最大行数（肥大化防止）
- 既定は 2000（実装上のデフォルト）
- 例：`2000`

---

## 任意（使う場合だけ設定）

## バックアップ
### `BACKUP_FOLDER_ID`
- Drive の保存先フォルダID（必須：バックアップ機能を使うなら）

### `BACKUP_AT_HOUR`
- 日次バックアップの実行時刻（時）
- 例：`3`（毎日 3:00 頃）

※ほかにも保持期間等の任意キーがありますが、メニュー「任意キーをまとめて整理（最小化）」で削っても運用できます。

---

## 日次準備（当日まとめ + 予約札 自動作成）
### `DAILY_PREP_AT_HOUR` / `DAILY_PREP_AT_MINUTE`
- 自動実行の時刻（例：7:00）

### `DAILY_PREP_OFFSET_DAYS`
- 対象日 = 今日 + offset  
  例：`0`（当日分） / `1`（翌日分）

### `DAILY_PREP_WEEKDAYS`
- 対象曜日（1=月 … 7=日）
- 例：`1-5`（平日のみ） / `6-7`（土日） / 空=全曜日

---

## 締切後送信通知（メール）
### `LATE_SUBMISSION_NOTIFY_ENABLED`
- `1/true/yes`：有効
- `0/false/no`：無効

### `LATE_SUBMISSION_NOTIFY_TO`
- 宛先（カンマ区切りで複数OK）
- 例：`owner@example.com, staff@example.com`

> 補足：運用通知（1時間まとめ）もこの宛先キーを共用します（現行実装）。

---

## 管理者判定（メニュー表示）
### `ADMIN_EMAILS`
- 管理者メール（カンマ区切り）
- 例：`owner@example.com, staff@example.com`
- `*` または `ALL` で全員に管理者メニュー

### `MENU_SHOW_ADVANCED`（互換・緊急）
- メールが取れない環境で全員に出したいときだけ `1`

---

## Debug（任意）
### `DEBUG_MAIN`
- `1` で Main のログが増えます

### `DEBUG_ORDER_SAVE`
- `1` で Order 保存周りのログが増えます

---

## “最小化” の考え方（運用ルール）
- まずは「必須 + LOG」だけで動かす
- 使う機能（バックアップ/日次準備/通知）を有効化したい時だけ、該当キーを追加する
- いらないキーはメニューから整理する：
  - `★予約管理 → 導入時のみ（管理者） → 【テンプレ配布（プロパティ）】任意キーをまとめて整理（最小化）`
