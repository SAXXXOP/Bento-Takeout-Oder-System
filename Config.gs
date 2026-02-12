/**
 * システム全体の設定項目を一括管理する
 */
const CONFIG = {
  // 1. Googleフォームの質問タイトル（フォームの文言と一致させる）
  FORM: {
    NAME_FULL: "氏名",
    NAME_SHORT: "氏名（簡易）",
    PHONE: "電話番号",
    PICKUP_DATE: "受け取り希望日",//プルダウン、日付は営業日のみ(前日20時締切適用)GASで自動作成、
    PICKUP_TIME: "受取り希望時刻",
    OLD_RESERVATION_NO: "元予約No",
    LINE_ID: "LINE_ID(自動入力)",
    NOTE: "抜き物などご要望" //質問形式チェックボックス
  },

  // 2. スプレッドシート名
  SHEET: {
  FORM_RESPONSES: "フォームの回答 1",
  ORDER_LIST: "注文一覧",
  CUSTOMER_LIST: "顧客名簿",
  MENU_MASTER: "メニューマスタ",
  DAILY_SUMMARY: "当日まとめ",
  RESERVATION_CARD: "予約札",
  NEEDS_CHECK_VIEW: "★要確認一覧",
  HOLIDAYS: "休業日設定",
  LOG: "ログ",
  NAME_CONFLICT_LOG: "氏名不一致ログ"
  },

  // 2.1 シートID（SchemaExportの結果を転記）
  // ※テンプレを「ファイルのコピー」等で複製すると sheetId は変わる可能性があります
  //    その場合でも getSheet() は name フォールバックで動きます（ただし再同期推奨）
  SHEET_ID: {
    FORM_RESPONSES: 362515472,
    ORDER_LIST: 1296644400,
    RESERVATION_CARD: 359066877,
    DAILY_SUMMARY: 1041436078,
    NEEDS_CHECK_VIEW: 895113105,
    MENU_MASTER: 383783652,
    CUSTOMER_LIST: 72852425,
    HOLIDAYS: 878661641,
    LOG: 1319133233,
    NAME_CONFLICT_LOG: 1185105983
  },

  /**
   * keyでシート取得（sheetId優先→nameフォールバック）
   * 例: CONFIG.getSheet("ORDER_LIST")
   */
  getSheet(key, ss) {
    ss = ss || SpreadsheetApp.getActiveSpreadsheet();
    const name = this.SHEET && this.SHEET[key];
    if (!name) throw new Error(`Unknown sheet key: ${key}`);

    const id = this.SHEET_ID && this.SHEET_ID[key];
    let sheet = null;
    if (id) sheet = ss.getSheets().find(s => s.getSheetId() === id) || null;
    if (!sheet) sheet = ss.getSheetByName(name) || null;
    if (!sheet) throw new Error(`Sheet not found: ${key} (${name})`);
    return sheet;
  },

  /** 必須タブが揃ってるかチェック（処理の先頭で呼ぶ用） */
  assertSheets(ss) {
    ss = ss || SpreadsheetApp.getActiveSpreadsheet();
    const requiredKeys = [
      "ORDER_LIST",
      "CUSTOMER_LIST",
      "MENU_MASTER",
      "DAILY_SUMMARY",
      "RESERVATION_CARD",
      "NEEDS_CHECK_VIEW",
      "HOLIDAYS",
      "LOG",
      "NAME_CONFLICT_LOG"
    ];
    const missing = [];
    requiredKeys.forEach(k => {
      try { this.getSheet(k, ss); } catch (e) { missing.push(`${k}=${this.SHEET[k]}`); }
    });
    if (missing.length) throw new Error(`必須タブが見つかりません: ${missing.join(", ")}`);
  },


  // 2.5 Script Properties（キー名一覧：値は Script Properties 側に保存）
  // 文字列直書きを減らし、タイポ事故を防ぐ目的
  PROPS: {
    // LINE / Webhook
    LINE_TOKEN: "LINE_TOKEN",
    WEBHOOK_KEY: "WEBHOOK_KEY",

    // Logging
    LOG_LEVEL: "LOG_LEVEL",
    LOG_MAX_ROWS: "LOG_MAX_ROWS",

    // Backup（運用）
    BACKUP_FOLDER_ID: "BACKUP_FOLDER_ID",
    BACKUP_AT_HOUR: "BACKUP_AT_HOUR",
    BACKUP_DAILY_RETENTION_DAYS: "BACKUP_DAILY_RETENTION_DAYS",
    BACKUP_DAILY_FOLDER_KEEP_MONTHS: "BACKUP_DAILY_FOLDER_KEEP_MONTHS",
    BACKUP_MONTHLY_FOLDER_NAME: "BACKUP_MONTHLY_FOLDER_NAME",
    BACKUP_MONTHLY_RETENTION_MONTHS: "BACKUP_MONTHLY_RETENTION_MONTHS",
    BACKUP_USE_MONTHLY_FOLDER: "BACKUP_USE_MONTHLY_FOLDER",
    BACKUP_MANUAL_FOLDER_NAME: "BACKUP_MANUAL_FOLDER_NAME",

    // Daily prep（運用：予約札 + 当日まとめ 自動作成）
    DAILY_PREP_AT_HOUR: "DAILY_PREP_AT_HOUR",
    DAILY_PREP_AT_MINUTE: "DAILY_PREP_AT_MINUTE",
    DAILY_PREP_OFFSET_DAYS: "DAILY_PREP_OFFSET_DAYS",
    DAILY_PREP_WEEKDAYS: "DAILY_PREP_WEEKDAYS",

    // Late submission notify（運用：締切後送信の検知メール）
    LATE_SUBMISSION_NOTIFY_ENABLED: "LATE_SUBMISSION_NOTIFY_ENABLED",
    LATE_SUBMISSION_NOTIFY_TO: "LATE_SUBMISSION_NOTIFY_TO",

    // Debug（任意）
    DEBUG_MAIN: "DEBUG_MAIN",
    DEBUG_ORDER_SAVE: "DEBUG_ORDER_SAVE",

    // Menu visibility（任意）
    // 管理者/閲覧者の判定に利用（ADMIN_EMAILS はカンマ区切り）
    ADMIN_EMAILS: "ADMIN_EMAILS",

    // 互換：ユーザーのメールが取得できない環境向け（全員に適用されるフォールバック）
    // 1/true/yes=管理者メニュー表示, 0/false/no=非表示
    MENU_SHOW_ADVANCED: "MENU_SHOW_ADVANCED"
  },

  // 3. 「注文一覧」シートの列配置
  COLUMN: {
    TIMESTAMP: 1,      // A
    ORDER_NO: 2,       // B
    TEL: 3,            // C
    NAME: 4,           // D
    PICKUP_DATE: 5,    // E 表示用
    NOTE: 6,           // F
    DETAILS: 7,        // G
    TOTAL_COUNT: 8,    // H
    TOTAL_PRICE: 9,    // I
    LINE_ID: 10,       // J
    DAILY_SUMMARY: 11, // K
    REGULAR_FLG: 12,   // L
    STATUS: 13,        // M ★ステータス（B案運用）
    REASON: 14,        // N ★理由（B案で追加）
    SOURCE_NO: 15,     // O: 変更元予約No
    PICKUP_DATE_RAW: 16 // P: Date型（内部用）
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

  // 5. ステータス文言（B案運用）
  STATUS: {
    // === 運用（これだけ見ればOK）===
    ACTIVE: "",              // 有効（作る・集計する）
    INVALID: "無効",         // 無効（作らない・除外）
    NEEDS_CHECK: "★要確認" // 要確認（止めて確認）

  },
  
  // 6. 「メニューマスタ」シートの列配置
  MENU_COLUMN: {
    ID: 1,           // A
    GROUP: 2,        // B
    MENU_NAME: 3,    // C (フォームの質問文)
    SUB_MENU: 4,     // D (グリッドの選択肢など)
    PRICE: 5,        // E
    SHORT_NAME: 6,    // F (内部キー・略称)
    AUTO_REPLY_NAME: 7 // G (任意：自動返信表示名)
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
    // Script Properties のキー名一覧は CONFIG.PROPS に集約（重複定義しない）

  },
};

// 互換：過去参照があればここで吸収（中身は CONFIG.PROPS を参照）
CONFIG.LINE.SCRIPT_PROP_KEYS = CONFIG.PROPS;
