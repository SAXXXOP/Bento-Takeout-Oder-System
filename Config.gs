/**
 * システム全体の設定項目を一括管理する
 */
const CONFIG = {
  // 1. Googleフォームの質問タイトル（フォームの文言と一致させる）
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
    DAILY_SUMMARY: "当日まとめ",
    RESERVATION_CARD: "予約札"
  },

  // 3. 「注文一覧」シートの列配置
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
    STATUS: 13,        // M: ステータス（通常/変更前/変更後）
    SOURCE_NO: 14      // N: 変更元予約No
  },

  // 4. 「顧客名簿」シートの列配置
  CUSTOMER_COLUMN: {
    LINE_ID: 1,        // A
    NAME: 2,           // B
    TEL: 3,            // C
    FIRST_VISIT: 4,    // D
    LAST_VISIT: 5,     // E
    VISIT_COUNT: 6,    // F
    TOTAL_SPEND: 7,    // G
    NOTE_COOK: 8,      // H: 備考(調理)
    NOTE_OFFICE: 9,    // I: 備考(事務)
    HISTORY_1: 10,     // J
    HISTORY_2: 11,     // K
    HISTORY_3: 12      // L
  },

  // 5. ステータス文言
  STATUS: {
    NORMAL: "通常",
    CHANGE_BEFORE: "変更前",
    CHANGE_AFTER: "変更後"
  }
};