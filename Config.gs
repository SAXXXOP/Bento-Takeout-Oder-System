/**
 * システム全体の設定項目を一括管理する
 */
const CONFIG = {
  // 1. Googleフォームの質問タイトル
  FORM: {
    NAME_FULL: "氏名",
    NAME_SHORT: "氏名（簡易）",
    PHONE: "電話番号",
    PICKUP_DATE: "受け取り希望日",
    PICKUP_TIME: "受取り希望時刻",
    OLD_RESERVATION_NO: "元予約No",
    LINE_ID: "LINE_ID",
    NOTE: "リクエスト"
  },

  // 2. スプレッドシート名
  SHEET: {
    ORDER_LIST: "注文一覧",
    CUSTOMER_LIST: "顧客名簿",
    MENU_MASTER: "メニューマスタ",
    DAILY_SUMMARY: "当日まとめ",   // 追加
    RESERVATION_CARD: "予約札"     // 追加
  },

  // 3. 注文一覧シートの列配置（1始まり）
  COLUMN: {
    TIMESTAMP: 1,      // A
    ORDER_NO: 2,       // B
    TEL: 3,            // C
    NAME: 4,           // D
    PICKUP_DATE: 5,    // E
    NOTE: 6,           // F
    DETAILS: 7,        // G
    TOTAL_COUNT: 8,    // H
    TOTAL_PRICE: 9,    // I
    LINE_ID: 10,       // J
    DAILY_SUMMARY: 11, // K: 当日まとめ用
    REGULAR_FLG: 12,   // L: 常連フラグ
    STATUS: 13,        // M: ステータス
    SOURCE_NO: 14      // N: 変更元予約No
  },

  // 4. 顧客名簿シートの列配置（1始まり）
  CUSTOMER_COLUMN: {
    LINE_ID: 1, NAME: 2, TEL: 3, FIRST_VISIT: 4, LAST_VISIT: 5,
    VISIT_COUNT: 6, TOTAL_SPEND: 7, NOTE_COOK: 8, NOTE_OFFICE: 9,
    HISTORY_1: 10, HISTORY_2: 11, HISTORY_3: 12
  },

  // 5. 当日まとめシートの構成（必要に応じて定義）
  SUMMARY_COLUMN: {
    PICKUP_TIME: 1,    // A: 受取時間
    NAME: 2,           // B: 名前
    ORDER_DETAILS: 3,  // C: 注文内容
    TOTAL_PRICE: 4,    // D: 合計
    PAID_STATUS: 5,    // E: 支払状況など
    RESERVATION_NO: 6  // F: 予約番号
  },

  // 6. 予約札の設定（レイアウト上の位置など）
  CARD: {
    COLUMNS_PER_PAGE: 3, // 1ページに並べる札の数（4列など）
    FONT_SIZE_NAME: 14,
    FONT_SIZE_DETAILS: 10
  },

  // 7. ステータス文言
  STATUS: {
    NORMAL: "通常",
    CHANGE_BEFORE: "変更前",
    CHANGE_AFTER: "変更後"
  }
};