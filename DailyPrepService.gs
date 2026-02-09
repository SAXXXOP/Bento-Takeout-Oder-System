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

    // ★追加：締切後送信（無効扱い）の予約があればメール通知（任意）
    try {
      dp_notifyLateSubmissionsEmail_(targetDate, runId);
    } catch (e) {
      // 通知失敗で日次準備（予約札/当日まとめ）まで失敗させない
      if (runId && typeof logError_ === "function") logError_(runId, "dailyPrepTrigger", e, { target: label, phase: "lateSubmissionMail" });
    }

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
/** ===== 内部 ===== */

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

// ===== 追加：締切後送信のメール通知（任意） =====

function dp_notifyLateSubmissionsEmail_(targetDate, runId, opts) {
  opts = opts || {};
  const force = !!opts.force;
  const sendEvenIfZero = !!opts.sendEvenIfZero;
  const subjectPrefix = String(opts.subjectPrefix || "");

  const enabled = ScriptProps.getBool(ScriptProps.KEYS.LATE_SUBMISSION_NOTIFY_ENABLED, false);
  if (!enabled && !force) return;

  const toRaw = String((opts.overrideTo != null ? opts.overrideTo : ScriptProps.get(ScriptProps.KEYS.LATE_SUBMISSION_NOTIFY_TO, "")) || "").trim();
  if (!toRaw) return;

  // テンプレ用ダミー値は送らない
  const placeholders = new Set(["__SET_ME__", "SET_ME", "DUMMY", "CHANGE_ME"]);
  if (placeholders.has(toRaw) && !force) return;

  const recipients = dp_parseRecipients_(toRaw);
  if (recipients.length === 0) return;

  const rows = dp_collectLateSubmissions_(targetDate);
  if (rows.length === 0 && !sendEvenIfZero) return; // 本番は0件なら通知しない
  const tz = Session.getScriptTimeZone();
  const targetLabel = (typeof formatMDWFromDate_ === "function")
    ? formatMDWFromDate_(targetDate)
    : Utilities.formatDate(targetDate, tz, "M/d");

  const deadline = (typeof getChangeDeadline === "function") ? getChangeDeadline(targetDate) : null;
  const deadlineStr = deadline ? Utilities.formatDate(deadline, tz, "M/d HH:mm") : "前日20:00";

  const subject = `${subjectPrefix}【締切後送信】${targetLabel} 受取分 ${rows.length}件`;

  const lines = [];
  lines.push(`対象：${targetLabel} 受取分`);
  lines.push(`締切：${deadlineStr}`);
  lines.push(`件数：${rows.length}`);
  lines.push("");
  rows.forEach((r, i) => {
    const t = r.timestamp ? Utilities.formatDate(r.timestamp, tz, "HH:mm") : "";
    lines.push(`${i + 1}) ${t} 予約No:${r.orderNo} ${r.name || ""} ${r.tel ? "TEL:" + r.tel : ""}`.trim());
    if (r.pickup) lines.push(`   受取:${r.pickup}`);
    if (r.details) lines.push(`   内容:${dp_truncate_(r.details, 120)}`);
    if (r.note) lines.push(`   備考:${dp_truncate_(r.note, 80)}`);
    if (r.reason) lines.push(`   理由:${dp_truncate_(r.reason, 160)}`);
    lines.push("");
  });

  try {
    const url = SpreadsheetApp.getActiveSpreadsheet().getUrl();
    lines.push(`注文一覧（スプレッドシート）：${url}`);
  } catch (e) {
    // ignore
  }

  const body = lines.join("\n");
  MailApp.sendEmail({ to: recipients.join(","), subject, body });

  if (runId && typeof logInfo_ === "function") {
    logInfo_(runId, "dailyPrepTrigger", "締切後送信メール通知", { target: targetLabel, count: rows.length, to: recipients.join(",") });
  }
}

// ===== テスト用：疎通（必ず1通送る）=====
function sendLateSubmissionNotifyPing() {
  const toRaw = String(ScriptProps.get(ScriptProps.KEYS.LATE_SUBMISSION_NOTIFY_TO, "") || "").trim();
  const recipients = dp_parseRecipients_(toRaw);
  if (recipients.length === 0) throw new Error("LATE_SUBMISSION_NOTIFY_TO が未設定です");

  const tz = Session.getScriptTimeZone();
  const now = new Date();
  const subject = `[TEST] 締切後送信メール通知 疎通 ${Utilities.formatDate(now, tz, "yyyy/MM/dd HH:mm:ss")}`;
  const body = [
    "これは疎通テストです（データ抽出は行いません）。",
    `送信元：${Session.getActiveUser().getEmail ? Session.getActiveUser().getEmail() : "(権限により不明)"}`,
    `残りクォータ：${MailApp.getRemainingDailyQuota()}`,
  ].join("\n");

  MailApp.sendEmail({ to: recipients.join(","), subject, body });
  try { SpreadsheetApp.getUi().alert("OK：疎通テストメールを送信しました"); } catch (e) {}
}

// ===== テスト用：抽出込み（0件でも送る）=====
function testLateSubmissionNotifyEmail() {
  const targetDate = dp_dateOnlyFromNow_(1); // 明日分をテスト
  dp_notifyLateSubmissionsEmail_(targetDate, null, {
    force: true,
    sendEvenIfZero: true,
    subjectPrefix: "[TEST] "
  });
  try { SpreadsheetApp.getUi().alert("OK：抽出込みテストを実行しました（0件でもメールが届きます）"); } catch (e) {}
}

function dp_dateOnlyFromNow_(addDays) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + Number(addDays || 0));
  return d;
}

function dp_collectLateSubmissions_(targetDate) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEET.ORDER_LIST);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const maxColNeeded = CONFIG.COLUMN.PICKUP_DATE_RAW; // P列まで読む想定
  const data = sheet.getRange(2, 1, lastRow - 1, maxColNeeded).getValues();

  const idx = (colNo) => colNo - 1;
  const COL_TIMESTAMP = idx(CONFIG.COLUMN.TIMESTAMP);
  const COL_ORDER_NO = idx(CONFIG.COLUMN.ORDER_NO);
  const COL_TEL = idx(CONFIG.COLUMN.TEL);
  const COL_NAME = idx(CONFIG.COLUMN.NAME);
  const COL_PICKUP_DATE = idx(CONFIG.COLUMN.PICKUP_DATE);
  const COL_NOTE = idx(CONFIG.COLUMN.NOTE);
  const COL_DETAILS = idx(CONFIG.COLUMN.DETAILS);
  const COL_STATUS = idx(CONFIG.COLUMN.STATUS);
  const COL_REASON = idx(CONFIG.COLUMN.REASON);
  const COL_PICKUP_DATE_RAW = idx(CONFIG.COLUMN.PICKUP_DATE_RAW);

  const targetMs = dp_dateOnly_(targetDate).getTime();
  const deadline = (typeof getChangeDeadline === "function") ? getChangeDeadline(targetDate) : null;
  const deadlineMs = deadline ? deadline.getTime() : null;

  const out = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];

    const status = String(row[COL_STATUS] || "");
    if (status !== CONFIG.STATUS.INVALID) continue;

    // 対象日判定（内部用日付列があればそれを優先）
    const raw = row[COL_PICKUP_DATE_RAW];
    if (!(raw instanceof Date)) continue;
    const dateOnly = dp_dateOnly_(raw);
    if (dateOnly.getTime() !== targetMs) continue;

    const ts = row[COL_TIMESTAMP];
    const reason = String(row[COL_REASON] || "");

    const lateByReason = /締切|期限/.test(reason) && /送信/.test(reason);
    const lateByTs = (deadlineMs != null && ts instanceof Date) ? (ts.getTime() > deadlineMs) : false;

    if (!lateByReason && !lateByTs) continue;

    out.push({
      timestamp: (ts instanceof Date) ? ts : null,
      orderNo: String(row[COL_ORDER_NO] || "").replace(/^'/, ""),
      tel: String(row[COL_TEL] || "").replace(/^'/, ""),
      name: String(row[COL_NAME] || ""),
      pickup: String(row[COL_PICKUP_DATE] || ""),
      note: String(row[COL_NOTE] || ""),
      details: String(row[COL_DETAILS] || ""),
      reason,
    });
  }

  // 時刻順
  out.sort((a, b) => {
    const at = a.timestamp ? a.timestamp.getTime() : 0;
    const bt = b.timestamp ? b.timestamp.getTime() : 0;
    return at - bt;
  });

  return out;
}

function dp_parseRecipients_(raw) {
  return String(raw || "")
    .split(/[,;\s]+/)
    .map(s => String(s || "").trim())
    .filter(Boolean);
}

function dp_dateOnly_(d) {
  const x = (d instanceof Date) ? d : new Date(d);
  return new Date(x.getFullYear(), x.getMonth(), x.getDate());
}

function dp_truncate_(text, maxLen) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!maxLen || s.length <= maxLen) return s;
  return s.slice(0, Math.max(0, maxLen - 1)) + "…";
}