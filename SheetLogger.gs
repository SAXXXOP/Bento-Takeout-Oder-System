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