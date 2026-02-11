/**
 * ================================
 * DateUtil.gs
 * 日付・時間ユーティリティ
 * ================================
 */

const DateUtil = {

  /**
   * yyyy/MM/dd 形式に変換
   */
  formatDate(date) {
    return Utilities.formatDate(
      new Date(date),
      Session.getScriptTimeZone(),
      "yyyy/MM/dd"
    );
  },

  /**
   * HH:mm 形式に変換
   */
  formatTime(date) {
    return Utilities.formatDate(
      new Date(date),
      Session.getScriptTimeZone(),
      "HH:mm"
    );
  },

  /**
   * 今日かどうか
   */
  isToday(date) {
    const d = new Date(date);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  },

  /**
   * 明日かどうか
   */
  isTomorrow(date) {
    const d = new Date(date);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return d.toDateString() === tomorrow.toDateString();
  },

  /**
   * 日付＋時間をまとめて文字列化
   */
  formatDateTime(date) {
    return `${this.formatDate(date)} ${this.formatTime(date)}`;
  },

  /**
   * ★追加：入力を mmdd(4桁) に正規化する
   * - Date → "0214"
   * - "2/14(土) / 8:30~9:30" → "0214"
   * - "214" → "0214"
   * - "0214" → "0214"
   */
  toMMDD4(input) {
    if (!input) return "";

    // Date 型
    if (Object.prototype.toString.call(input) === "[object Date]" && !isNaN(input)) {
      const m = input.getMonth() + 1;
      const d = input.getDate();
      return String(m).padStart(2, "0") + String(d).padStart(2, "0");
    }

    const s = String(input).trim();
    if (!s) return "";

    // 例: "2/14(土) / 8:30~9:30" などから月日だけ抜く
    const md = s.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
    if (md) return md[1].padStart(2, "0") + md[2].padStart(2, "0");

    // 数字だけ（"214" や "0214"）
    const digits = s.replace(/\D/g, "");
    if (digits.length === 4) return digits;
    if (digits.length === 3) return "0" + digits;

    return "";
  },

  /**
   * ★追加：注文一覧の1行から日付キー(mmdd4)を取る（O列優先→E列フォールバック）
   */
  rowMMDD4(oDate, eText) {
    return this.toMMDD4(oDate) || this.toMMDD4(eText);
  }
};


/**
 * SecurityUtils.gs
 * - スプレッドシート数式注入対策
 * - 制御文字除去
 * - ログ用の短縮・簡易マスク
 */
const SECURITY_ = (() => {
  const DANGEROUS_PREFIX_RE = /^[=\+\-@]/; // Sheetsで式として解釈されやすい先頭
  const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

  function sanitizeForSheet(value) {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value;
    if (typeof value === "number" || typeof value === "boolean") return value;

    let s = String(value);
    s = s.replace(CONTROL_CHARS_RE, "");
    s = s.replace(/\r\n?/g, "\n");

    // 数式注入対策：先頭が危険文字ならアポストロフィで文字列扱いへ
    if (DANGEROUS_PREFIX_RE.test(s)) s = "'" + s;
    return s;
  }

  function truncate(s, maxLen) {
    const limit = maxLen || 800;
    s = String(s ?? "");
    return s.length > limit ? s.slice(0, limit) + "…(truncated)" : s;
  }

  // ざっくりPIIを落とす（必要最低限）
  function redact(obj) {
    if (!obj || typeof obj !== "object") return obj;
    const copy = Array.isArray(obj) ? obj.slice() : { ...obj };
    const keys = ["userId", "replyToken", "to", "lineId", "LINE_ID", "phoneNumber", "tel", "text", "message", "body"];
    keys.forEach(k => {
      if (copy[k] !== undefined) copy[k] = "[REDACTED]";
    });
    return copy;
  }

  function toLogString(extra, maxLen) {
    let s;
    try {
      s = (typeof extra === "string") ? extra : JSON.stringify(redact(extra));
    } catch (e) {
      s = String(extra);
    }
    return truncate(sanitizeForSheet(s), maxLen || 800);
  }

  return { sanitizeForSheet, toLogString, truncate, redact };
})();



/**
 * シート「ログ」に実行ログを追記する簡易ロガー
 * - 1行 = 1ログ
 * - 実行ID(runId)で同一実行を追跡
 *
 * 使い方：
 *   const runId = logStart_("createProductionSheet", { target: "0214" });
 *   logInfo_(runId, "集計開始");
 *   logEnd_(runId, "完了");
 */
const SHEET_LOGGER_ = (() => {
  const SHEET_NAME = "ログ";
  const HEADER = ["日時", "RunId", "レベル", "関数", "メッセージ", "詳細(JSON)"];

  function getSheet_(ss) {
    const book = ss || SpreadsheetApp.getActiveSpreadsheet();
    let sh = book.getSheetByName(SHEET_NAME);
    if (!sh) sh = book.insertSheet(SHEET_NAME);

    // ヘッダが無ければ作る
    const v = sh.getRange(1, 1, 1, HEADER.length).getValues()[0];
    const hasHeader = HEADER.every((h, i) => String(v[i] || "") === h);
    if (!hasHeader) {
      sh.getRange(1, 1, 1, HEADER.length).setValues([HEADER]);
      sh.setFrozenRows(1);
      sh.setColumnWidths(1, 1, 140); // 日時
      sh.setColumnWidths(2, 1, 120); // RunId
      sh.setColumnWidths(3, 1, 70);  // レベル
      sh.setColumnWidths(4, 1, 180); // 関数
      sh.setColumnWidths(5, 1, 420); // メッセージ
      sh.setColumnWidths(6, 1, 420); // 詳細(JSON)
    }
    return sh;
  }

  function now_() {
    return new Date();
  }

  function newRunId_() {
    // 実行ごとに追跡できるように短いIDを作る
    const t = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss");
    const r = Math.random().toString(36).slice(2, 8);
    return `${t}_${r}`;
  }

  function append_(level, funcName, message, detail, runId) {
    const sh = getSheet_();
    const row = [
      now_(),
      runId || "",
      level || "INFO",
      funcName || "",
      message || "",
      detail ? safeJson_(detail) : ""
    ];
    sh.appendRow(row);
  }

  function safeJson_(obj) {
    try { return JSON.stringify(obj); } catch (e) { return String(obj); }
  }

  function start(funcName, detail) {
    const runId = newRunId_();
    append_("START", funcName, "実行開始", detail, runId);
    return runId;
  }

  function info(runId, funcName, message, detail) {
    append_("INFO", funcName, message, detail, runId);
  }

  function warn(runId, funcName, message, detail) {
    append_("WARN", funcName, message, detail, runId);
  }

  function error(runId, funcName, err, detail) {
    const msg = err && err.message ? err.message : String(err);
    const stack = err && err.stack ? err.stack : "";
    append_("ERROR", funcName, msg, { stack, ...detail }, runId);
  }

  function end(runId, funcName, message, detail) {
    append_("END", funcName, message || "実行完了", detail, runId);
  }

  return { start, info, warn, error, end };
})();

// 呼び出し簡略化（既存コードに入れやすい）
function logStart_(funcName, detail) { return SHEET_LOGGER_.start(funcName, detail); }
function logInfo_(runId, funcName, message, detail) { return SHEET_LOGGER_.info(runId, funcName, message, detail); }
function logWarn_(runId, funcName, message, detail) { return SHEET_LOGGER_.warn(runId, funcName, message, detail); }
function logError_(runId, funcName, err, detail) { return SHEET_LOGGER_.error(runId, funcName, err, detail); }
function logEnd_(runId, funcName, message, detail) { return SHEET_LOGGER_.end(runId, funcName, message, detail); }