/**
 * DailyPrepService.gs
 * 予約札 + 当日まとめ を「指定時刻に自動作成」＆「手入力で日付指定してまとめて作成」
 */

/** トリガーの起動先（毎日実行） */
function dailyPrepTrigger() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) return;

  const targetDate = dp_getTargetDate_();
  const label = dp_formatMD_(targetDate);

  const runId = (typeof logStart_ === "function") ? logStart_("dailyPrepTrigger", { target: label }) : "";

  try {
    if (runId) logInfo_(runId, "dailyPrepTrigger", "開始", { target: label });

    // ※順序はどちらでもOK。朝運用の並びに合わせて当日まとめ→予約札
    createProductionSheet(targetDate);
    createDailyReservationCards(targetDate);

    if (runId) logEnd_(runId, "dailyPrepTrigger", "完了", { target: label });
  } catch (e) {
    if (runId && typeof logError_ === "function") logError_(runId, "dailyPrepTrigger", e, { target: label });
    throw e;
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/** 手動：日付を1回入力して「当日まとめ + 予約札」をまとめて作成（プロンプト1回） */
function runDailyPrepPrompt() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt("日次準備（当日まとめ+予約札）", "日付（例: 2/14）", ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;

  const input = String(res.getResponseText() || "").trim();
  if (!input) return;

  createProductionSheet(input);
  createDailyReservationCards(input);
  ui.alert("OK：日次準備を実行しました。");
}

/** 手動：今日（＋オフセット）で「当日まとめ + 予約札」をまとめて作成 */
function runDailyPrepToday() {
  const d = dp_getTargetDate_();
  createProductionSheet(d);
  createDailyReservationCards(d);

  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) {}
  if (ui) ui.alert("OK：日次準備を実行しました（" + dp_formatMD_(d) + "）。");
}

/** トリガー設定（既存は同ハンドラを消してから作る） */
function installDailyPrepTrigger() {
  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) {}

  const handler = "dailyPrepTrigger";
  const deleted = dp_deleteTriggersByHandler_(handler);

  const hour = dp_clampInt_(ScriptProps.getInt(ScriptProps.KEYS.DAILY_PREP_AT_HOUR, 7), 0, 23);
  const minute = dp_clampInt_(ScriptProps.getInt(ScriptProps.KEYS.DAILY_PREP_AT_MINUTE, 0), 0, 59);
  const offset = ScriptProps.getInt(ScriptProps.KEYS.DAILY_PREP_OFFSET_DAYS, 0);

  ScriptApp.newTrigger(handler)
    .timeBased()
    .everyDays(1)
    .atHour(hour)
    .nearMinute(minute)
    .create();

  if (ui) {
    ui.alert(
      `OK：日次準備トリガーを設定しました（既存 ${deleted} 件を削除）。\n` +
      `実行時刻：${hour}:${String(minute).padStart(2, "0")}\n` +
      `対象日：今日 + ${offset}日`
    );
  }
}

/** トリガー削除 */
function deleteDailyPrepTrigger() {
  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) {}

  const deleted = dp_deleteTriggersByHandler_("dailyPrepTrigger");
  if (ui) ui.alert(`OK：日次準備トリガーを削除しました（${deleted}件）。`);
}

/** ===== 内部 ===== */

function dp_deleteTriggersByHandler_(handlerName) {
  const triggers = ScriptApp.getProjectTriggers();
  let deleted = 0;
  triggers.forEach(t => {
    try {
      if (t.getHandlerFunction && t.getHandlerFunction() === handlerName) {
        ScriptApp.deleteTrigger(t);
        deleted++;
      }
    } catch (e) {}
  });
  return deleted;
}

function dp_getTargetDate_() {
  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const y = Number(Utilities.formatDate(now, tz, "yyyy"));
  const m = Number(Utilities.formatDate(now, tz, "M"));
  const d = Number(Utilities.formatDate(now, tz, "d"));

  const offset = ScriptProps.getInt(ScriptProps.KEYS.DAILY_PREP_OFFSET_DAYS, 0);
  const base = new Date(y, m - 1, d); // その日の00:00相当
  base.setDate(base.getDate() + offset);
  return base;
}

function dp_formatMD_(dateObj) {
  const tz = Session.getScriptTimeZone();
  return Utilities.formatDate(dateObj, tz, "M/d");
}

function dp_clampInt_(n, min, max) {
  const x = parseInt(n, 10);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, x));
}
