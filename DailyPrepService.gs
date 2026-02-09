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

  // ★曜日指定がある場合は、対象日（today+offset）が対象曜日でなければスキップ
  if (!dp_isAllowedTargetWeekday_(targetDate)) {
    return;
  }

  const runId = (typeof logStart_ === "function") ? logStart_("dailyPrepTrigger", { target: label }) : "";


  try {
    if (runId) logInfo_(runId, "dailyPrepTrigger", "開始", { target: label });

    // 曜日フィルタ（対象日 = 今日 + offset の曜日で判定）
    const weekdaysRaw = ScriptProps.get(ScriptProps.KEYS.DAILY_PREP_WEEKDAYS, "");
    if (!dp_isAllowedWeekday_(targetDate, weekdaysRaw)) {
      const weekdaysLabel = dp_formatWeekdaysForUI_(weekdaysRaw);
      if (runId) {
        if (typeof logWarn_ === "function") logWarn_(runId, "dailyPrepTrigger", "スキップ：曜日対象外", { target: label, weekdays: weekdaysLabel });
        if (typeof logEnd_ === "function") logEnd_(runId, "dailyPrepTrigger", "スキップ", { target: label, weekdays: weekdaysLabel });
      }
      return; // finally で lock.releaseLock は走る
    }

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

/** UI：日次準備の設定（時刻/オフセット/曜日）をプロンプト1回で保存 */
function configureDailyPrepSettingsPrompt() {
  const ui = SpreadsheetApp.getUi();

  // 現在値
  const curHour = dp_clampInt_(ScriptProps.getInt(ScriptProps.KEYS.DAILY_PREP_AT_HOUR, 7), 0, 23);
  const curMin  = dp_clampInt_(ScriptProps.getInt(ScriptProps.KEYS.DAILY_PREP_AT_MINUTE, 0), 0, 59);
  const curOff  = ScriptProps.getInt(ScriptProps.KEYS.DAILY_PREP_OFFSET_DAYS, 0);
  const curWds  = ScriptProps.get(ScriptProps.KEYS.DAILY_PREP_WEEKDAYS, "1-7"); // 未設定なら全曜日扱い

  const guide =
    "1行で入力（スペース区切りOK）例: hour=21 minute=0 offset=1 weekdays=4-7\n" +
    "weekdays: 1(月)〜7(日) / 空=全曜日";

  const res = ui.prompt("日次準備設定（時刻/オフセット/曜日）", guide, ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;

  const raw = String(res.getResponseText() || "").trim();
  if (!raw) return;

  // parse（key=value）: 1行の "hour=21 minute=0 offset=1 weekdays=4-7" もOK
  const map = {};
  const text = String(raw || "").replace(/　/g, " ").trim(); // 全角スペース対策
  const re = /([a-zA-Z_]+)\s*=\s*([^\s]*)/g; // valueは空でもOK（weekdays=）
  let m;
  while ((m = re.exec(text)) !== null) {
    map[m[1].toLowerCase()] = String(m[2] ?? "").trim();
  }


  // 入力が無ければ現状維持
  const hour = ("hour" in map) ? dp_clampInt_(map.hour, 0, 23) : curHour;
  const minute = ("minute" in map) ? dp_clampInt_(map.minute, 0, 59) : curMin;

  let offset = curOff;
  if ("offset" in map) {
    const n = parseInt(map.offset, 10);
    if (!Number.isFinite(n)) throw new Error("offset が不正です（整数）。");
    offset = Math.min(365, Math.max(-365, n));
  }

  const weekdaysText = ("weekdays" in map) ? map.weekdays : curWds;

  // weekdays の妥当性チェック（ここで例外にして入力ミスを検知）
  dp_parseWeekdays_(weekdaysText);

  // 保存（まとめて）
  ScriptProps.setMany({
    [ScriptProps.KEYS.DAILY_PREP_AT_HOUR]: String(hour),
    [ScriptProps.KEYS.DAILY_PREP_AT_MINUTE]: String(minute),
    [ScriptProps.KEYS.DAILY_PREP_OFFSET_DAYS]: String(offset),
    [ScriptProps.KEYS.DAILY_PREP_WEEKDAYS]: String(weekdaysText || ""),
  });

  // トリガー再作成（ここはsilentにして、最後にまとめて表示）
  const summary = installDailyPrepTrigger(true);

  ui.alert(
    "OK：日次準備設定を保存しました。\n" +
    `実行時刻：${summary.hour}:${String(summary.minute).padStart(2, "0")}\n` +
    `対象日：今日 + ${summary.offset}日\n` +
    `曜日：${summary.weekdaysLabel}\n` +
    `（既存トリガー削除：${summary.deleted}件）`
  );
}

/** トリガー設定（既存は同ハンドラを消してから作る） */
function installDailyPrepTrigger(silent = false) {
  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) {}

  const handler = "dailyPrepTrigger";
  const deleted = dp_deleteTriggersByHandler_(handler);

  const hour = dp_clampInt_(ScriptProps.getInt(ScriptProps.KEYS.DAILY_PREP_AT_HOUR, 7), 0, 23);
  const minute = dp_clampInt_(ScriptProps.getInt(ScriptProps.KEYS.DAILY_PREP_AT_MINUTE, 0), 0, 59);
  const offset = ScriptProps.getInt(ScriptProps.KEYS.DAILY_PREP_OFFSET_DAYS, 0);
  const weekdaysText = ScriptProps.get(ScriptProps.KEYS.DAILY_PREP_WEEKDAYS, "");

  ScriptApp.newTrigger(handler)
    .timeBased()
    .everyDays(1)
    .atHour(hour)
    .nearMinute(minute)
    .create();

  const summary = {
    deleted, hour, minute, offset,
    weekdaysText: weekdaysText,
    weekdaysLabel: dp_weekdaysLabel_(weekdaysText),
  };

  if (ui && !silent) {
    ui.alert(
      `OK：日次準備トリガーを設定しました（既存 ${deleted} 件を削除）。\n` +
      `実行時刻：${hour}:${String(minute).padStart(2, "0")}\n` +
      `対象日：今日 + ${offset}日\n` +
      `曜日：${summary.weekdaysLabel}`
    );
  }
  return summary;
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

function dp_isAllowedTargetWeekday_(dateObj) {
  const text = ScriptProps.get(ScriptProps.KEYS.DAILY_PREP_WEEKDAYS, "");
  const set = dp_parseWeekdays_(text); // null = 全曜日
  if (!set) return true;
  return set.has(dateObj.getDay()); // 0(日)〜6(土)
}

/**
 * weekdays文字列を Set(0-6) に変換
 * - "" / 未設定: null（全曜日）
 * - "1-5"（月〜金）/ "6,7"（土日）/ "月-金" / "月火水" などを許容
 * - 入力不正は throw
 */
function dp_parseWeekdays_(text) {
  let s = String(text ?? "").trim();
  if (!s) return null;

  // 全角数字→半角
  s = s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

  // 日本語曜日→数字（1=月 ... 7=日）
  const wmap = { "月": "1", "火": "2", "水": "3", "木": "4", "金": "5", "土": "6", "日": "7" };
  s = s.replace(/[月火水木金土日]/g, ch => wmap[ch]);

  // 区切りを統一
  s = s.replace(/[、\s]+/g, ",").replace(/,+/g, ",").replace(/^,|,$/g, "");

  const set = new Set();

  const addNum = (n1to7) => {
    let n = parseInt(n1to7, 10);
    if (!Number.isFinite(n)) throw new Error("weekdays が不正です。");
    if (n === 0) n = 7;          // 0 を日(7)として許容
    if (n < 1 || n > 7) throw new Error("weekdays は 1〜7（または0）で指定してください。");
    const dayIdx = (n === 7) ? 0 : n; // JS: 0=日,1=月...6=土
    set.add(dayIdx);
  };

  const parts = s.split(",").filter(Boolean);
  parts.forEach(p => {
    const m = p.match(/^(\d)\s*-\s*(\d)$/);
    if (m) {
      let a = parseInt(m[1], 10);
      let b = parseInt(m[2], 10);
      if (a === 0) a = 7;
      if (b === 0) b = 7;
      if (a < 1 || a > 7 || b < 1 || b > 7) throw new Error("weekdays の範囲指定が不正です。");
      // 1-5 だけでなく 6-2 のような跨ぎも許容
      const seq = [];
      let x = a;
      while (true) {
        seq.push(x);
        if (x === b) break;
        x = (x === 7) ? 1 : (x + 1);
        if (seq.length > 7) break;
      }
      seq.forEach(addNum);
    } else {
      addNum(p);
    }
  });

  // 7日全部なら null（全曜日）扱いに寄せる
  return (set.size >= 7) ? null : set;
}

function dp_weekdaysLabel_(text) {
  const set = dp_parseWeekdays_(text);
  if (!set) return "全曜日";

  const labels = ["日","月","火","水","木","金","土"];
  // 表示は 月→…→日 の順にしたいので並び替え
  const order = [1,2,3,4,5,6,0];
  const out = [];
  order.forEach(i => { if (set.has(i)) out.push(labels[i]); });
  return out.join("");
}
