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
    PICKUP_TIME: "受取り希望時刻",//※現在は未使用
    OLD_RESERVATION_NO: "元予約No",
    LINE_ID: "LINE_ID(自動入力)",
    NOTE: "抜き物、アレルギーなど" 
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
    PICKUP_DATE: 5,    // E 2/14(土) / 6:30~7:30 表示用／人間向け
    NOTE: 6,           // F
    DETAILS: 7,        // G
    TOTAL_COUNT: 8,    // H
    TOTAL_PRICE: 9,    // I
    LINE_ID: 10,       // J
    DAILY_SUMMARY: 11, // K: 当日まとめ用
    REGULAR_FLG: 12,   // L: 常連フラグ
    STATUS: 13,        // M: ステータス（通常/変更前/変更後）
    SOURCE_NO: 14,      // N: 変更元予約No
    PICKUP_DATE_RAW: 15 // O ★Date型 2026/02/14（内部用）
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
  CHANGE_AFTER: "変更後",
  NEEDS_CHECK: "★要確認"
},

  // 6. 「メニューマスタ」シートの列配置
  MENU_COLUMN: {
    ID: 1,           // A
    GROUP: 2,        // B
    MENU_NAME: 3,    // C (フォームの質問文)
    SUB_MENU: 4,     // D (グリッドの選択肢など)
    PRICE: 5,        // E
    SHORT_NAME: 6    // F (内部キー・略称)
  },

  // 7. LINE/LIFF 関連設定（メモとして記録）
  LINE: {
    // リッチメニューの「予約する」ボタンに設定しているURL
    LIFF_URL: "https://liff.line.me/2009003404-RXJsbtuc",
    
    // Googleフォームの各項目に自動入力するためのentry ID (LineWebhook.gsより転記)
    ENTRY_LINE_ID: "entry.593652011",
    ENTRY_OLD_NO: "entry.1781944258",
  FORM: {
    FORM_URL: "https://docs.google.com/forms/d/e/1FAIpQLSc-WHjrgsi9nl8N_NcJaqvRWIX-TJHrWQICc6-i08NfxYRflQ/viewform"},
 
    // 実際のトークンは「プロジェクトの設定 > スクリプトプロパティ」に 
    // LINE_TOKEN という名前で保存してください
    LINE_TOKEN: PropertiesService.getScriptProperties().getProperty('LINE_TOKEN'),
  },
};