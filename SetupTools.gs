// ===== 導入ツール（統合）：本番初期化 / 日次準備設定 / トリガー =====

/**
 * 本番初期化（危険）：シート上のテストデータのみ削除（フォーム回答は残す）
 * メニュー「導入ツール > 本番初期化（危険） > テストデータ削除」から呼ばれます。
 */
function initProductionCleanSheetOnly() {
  initProductionClean_(false);
}

/**
 * 本番初期化（危険）：シートのテストデータ削除 + フォーム回答も全削除
 * メニュー「導入ツール > 本番初期化（危険） > ＋フォーム回答も削除」から呼ばれます。
 */
function initProductionCleanWithFormResponses() {
  initProductionClean_(true);
}

function initProductionClean_(deleteFormResponses) {
  // UIが使えない実行（トリガー等）は事故りやすいので拒否
  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) {}
  if (!ui) throw new Error("initProductionClean: UI が使用できない実行環境です（トリガー実行不可）。");

  // 管理者ガード（MenuVisibility があれば）
  try {
    if (typeof MenuVisibility !== "undefined" && MenuVisibility && typeof MenuVisibility.isAdmin === "function") {
      if (!MenuVisibility.isAdmin()) {
        ui.alert("権限エラー", "管理者のみ実行できます。", ui.ButtonSet.OK);
        return;
      }
    }
  } catch (e) {}

  const title = "本番初期化（危険）";
  const msg = [
    "以下を削除します：",
    "- 注文一覧 / 顧客名簿 / ★要確認一覧 / ログ / 氏名不一致ログ（データ行）",
    "- 当日まとめ / 予約札（内容）",
    deleteFormResponses ? "- フォーム回答（全件）" : "",
    "",
    "実行する場合は DELETE と入力してください。"
  ].filter(Boolean).join("\n");

  const res = ui.prompt(title, msg, ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  if (String(res.getResponseText() || "").trim().toUpperCase() !== "DELETE") {
    ui.alert("キャンセルしました（DELETE が一致しません）");
    return;
  }

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) {
    ui.alert("他の処理が実行中のため中止しました（ロック取得失敗）");
    return;
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // CONFIG があればそれを優先。無い場合は固定名でフォールバック。
    const SH = (typeof CONFIG !== "undefined" && CONFIG && CONFIG.SHEET) ? CONFIG.SHEET : {
      ORDER_LIST: "注文一覧",
      DAILY_SUMMARY: "当日まとめ",
      RESERVATION_CARD: "予約札",
      MENU_MASTER: "メニューマスタ",
      CUSTOMER_LIST: "顧客名簿",
      NEEDS_CHECK_VIEW: "★要確認一覧",
      LOG: "ログ",
      SETTINGS: "設定",
      NAME_CONFLICT_LOG: "氏名不一致ログ",
    };

    const cleared = [];

    // データ行だけ削除（1行目はヘッダ想定）
    [SH.ORDER_LIST, SH.CUSTOMER_LIST, SH.NEEDS_CHECK_VIEW, "ログ", SH.NAME_CONFLICT_LOG].forEach(name => {
      const sh = ss.getSheetByName(name);
      if (!sh) return;
      const n = st_clearBelowHeader_(sh, 1);
      cleared.push(`${name}: ${n}行`);
    });

    // 内容を全部クリア（レイアウトは残す）
    [SH.DAILY_SUMMARY, SH.RESERVATION_CARD].forEach(name => {
      const sh = ss.getSheetByName(name);
      if (!sh) return;
      sh.clearContents();
      cleared.push(`${name}: クリア`);
    });

    let formMsg = "";
    if (deleteFormResponses) {
      const formUrl = ss.getFormUrl();
      if (!formUrl) {
        formMsg = "フォーム未紐づけのため、フォーム回答削除はスキップしました。";
      } else {
        const form = FormApp.openByUrl(formUrl);
        const before = form.getResponses().length;
        form.deleteAllResponses();
        formMsg = `フォーム回答を削除しました: ${before}件`;
      }
    }

    ui.alert(
      "完了：本番初期化",
      "削除/クリア結果\n" + cleared.join("\n") + (formMsg ? ("\n\n" + formMsg) : ""),
      ui.ButtonSet.OK
    );
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function st_clearBelowHeader_(sheet, headerRows) {
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= headerRows || lastCol <= 0) return 0;
  const rows = lastRow - headerRows;
  sheet.getRange(headerRows + 1, 1, rows, lastCol).clearContent();
  return rows;
}

// ===== トリガー（フォーム送信） =====
/**
 * フォーム送信トリガーを設定（既存の onFormSubmit トリガーは削除して作り直す）
 * メニュー「導入ツール > トリガー（フォーム送信） > 設定」から呼ばれます。
 */
function installFormSubmitTrigger() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const handler = "onFormSubmit";

  // 既存トリガーを削除（重複防止）
  const deleted = st_deleteTriggersByHandler_(handler);

  // スプレッドシートがフォームに紐づいているか
  const formUrl = (ss.getFormUrl && ss.getFormUrl()) || "";
  if (!formUrl) {
    ui.alert(
      "NG：このスプレッドシートがフォームに紐づいていません。\n" +
      "スプレッドシートの「フォーム」メニューからフォームを紐づけてから実行してください。"
    );
    return;
  }

  // まずはフォーム側トリガー（e.response が取れて安定）→ダメならスプレッドシート側でフォールバック
  let createdTarget = "フォーム";
  try {
    const form = FormApp.openByUrl(formUrl);
    ScriptApp.newTrigger(handler).forForm(form).onFormSubmit().create();
  } catch (e) {
    createdTarget = "スプレッドシート（フォールバック）";
    ScriptApp.newTrigger(handler).forSpreadsheet(ss).onFormSubmit().create();
  }

  ui.alert(`OK：フォーム送信トリガーを設定しました。\n削除：${deleted}件 / 作成先：${createdTarget}`);
}

/**
 * フォーム送信トリガーを削除
 * メニュー「導入ツール > トリガー（フォーム送信） > 削除」から呼ばれます。
 */
function deleteFormSubmitTrigger() {
  const ui = SpreadsheetApp.getUi();
  const deleted = st_deleteTriggersByHandler_("onFormSubmit");
  ui.alert(`OK：フォーム送信トリガーを削除しました（${deleted}件）。`);
}

function configureDailyPrepSettingsPrompt() {
  const ui = SpreadsheetApp.getUi();

  // 現在値
  const curHour = st_clampInt_(ScriptProps.getInt(ScriptProps.KEYS.DAILY_PREP_AT_HOUR, 7), 0, 23);
  const curMin  = st_clampInt_(ScriptProps.getInt(ScriptProps.KEYS.DAILY_PREP_AT_MINUTE, 0), 0, 59);
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
  const text = String(raw || "").replace(/\u3000/g, " ").trim(); // 全角スペース対策
  const re = /([a-zA-Z_]+)\s*=\s*([^\s]*)/g; // valueは空でもOK（weekdays=）
  let m;
  while ((m = re.exec(text)) !== null) {
    map[m[1].toLowerCase()] = String(m[2] ?? "").trim();
  }

  // 入力が無ければ現状維持
  const hour = ("hour" in map) ? st_clampInt_(map.hour, 0, 23) : curHour;
  const minute = ("minute" in map) ? st_clampInt_(map.minute, 0, 59) : curMin;

  let offset = curOff;
  if ("offset" in map) {
    const n = parseInt(map.offset, 10);
    if (!Number.isFinite(n)) throw new Error("offset が不正です（整数）。");
    offset = Math.min(365, Math.max(-365, n));
  }

  const weekdaysText = ("weekdays" in map) ? map.weekdays : curWds;

  // weekdays の妥当性チェック（ここで例外にして入力ミスを検知）
  st_parseWeekdays_(weekdaysText);

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
  const deleted = st_deleteTriggersByHandler_(handler);

  const hour = st_clampInt_(ScriptProps.getInt(ScriptProps.KEYS.DAILY_PREP_AT_HOUR, 7), 0, 23);
  const minute = st_clampInt_(ScriptProps.getInt(ScriptProps.KEYS.DAILY_PREP_AT_MINUTE, 0), 0, 59);
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
    weekdaysLabel: st_weekdaysLabel_(weekdaysText),
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

  const deleted = st_deleteTriggersByHandler_("dailyPrepTrigger");
  if (ui) ui.alert(`OK：日次準備トリガーを削除しました（${deleted}件）。`);
}

// ===== 導入ツール（統合）：テンプレ配布用 Script Properties =====

/**
 * TemplatePropsTools.gs
 * テンプレ配布用：Script Properties の「キーを作り直す」「値をダミー化する」
 */

// UI が使えない文脈（トリガー/エディタ等）でも落ちないためのヘルパ
function st_getUi_() {
  try { return SpreadsheetApp.getUi(); } catch (e) { return null; }
}
function st_alertOrLog_(message) {
  const ui = st_getUi_();
  if (ui) ui.alert(String(message));
  else console.log(String(message));
}

function getTemplatePropsDefaults_() {
  // テンプレ/配布用：まずは「必須最小限」だけ作る方針
  // （必要な機能を有効化したいときに、該当キーだけ追加で設定する）
  const defaults = {
    // LINE連携を使う場合に必要
    [CONFIG.PROPS.LINE_TOKEN]: "__SET_ME__",
    [CONFIG.PROPS.WEBHOOK_KEY]: "__SET_ME__",

    // バックアップを使う場合に必要（使わない運用なら未設定でもOK）
    [CONFIG.PROPS.BACKUP_FOLDER_ID]: "__SET_ME__",
  };
  return defaults;
}

function ensureTemplateScriptProperties() {
  const defaults = getTemplatePropsDefaults_();
  const cur = PropertiesService.getScriptProperties().getProperties();
  const toSet = {};

  Object.keys(defaults).forEach((k) => {
    const v = (k in cur) ? String(cur[k] ?? "").trim() : "";
    if (!v) toSet[k] = defaults[k];
  });

  if (Object.keys(toSet).length > 0) ScriptProps.setMany(toSet);

  st_alertOrLog_(
    "OK：テンプレ用 Script Properties を作成しました（未設定のみ）。\n\n作成/更新数: " + Object.keys(toSet).length
  );
}

function overwriteTemplateScriptProperties() {
  const defaults = getTemplatePropsDefaults_();
  ScriptProps.setMany(defaults);
  st_alertOrLog_("OK：テンプレ用 Script Properties を上書きしました（全部ダミー）。");
}

/**
 * バックアップ関連の「任意キー」を削除して、プロパティを最小化する。
 * ※ BACKUP_FOLDER_ID（必須）は残す
 */
function cleanupBackupScriptProperties() {
  const ui = st_getUi_();
  const keys = [
    CONFIG.PROPS.BACKUP_AT_HOUR,
    CONFIG.PROPS.BACKUP_DAILY_RETENTION_DAYS,
    CONFIG.PROPS.BACKUP_DAILY_FOLDER_KEEP_MONTHS,
    CONFIG.PROPS.BACKUP_USE_MONTHLY_FOLDER,
    CONFIG.PROPS.BACKUP_MONTHLY_RETENTION_MONTHS,
    CONFIG.PROPS.BACKUP_MONTHLY_FOLDER_NAME,
    CONFIG.PROPS.BACKUP_MANUAL_FOLDER_NAME,
    CONFIG.PROPS.BACKUP_RETENTION_DAYS, // 旧互換キー
  ];

  const all = PropertiesService.getScriptProperties().getProperties();
  const existed = keys.filter(k => (k in all));

  ScriptProps.delMany(existed);

  const msg =
    "OK：バックアップ関連の任意キーを削除しました。\n\n" +
    "削除数: " + existed.length + "\n" +
    "残る必須キー: " + CONFIG.PROPS.BACKUP_FOLDER_ID;
  if (ui) ui.alert(msg); else console.log(msg);
}

/**
 * ログ関連の「任意キー」を削除して、プロパティを最小化する。
 * ※ 未設定でも logToSheet は既定（WARN/2000行）で動きます
 */
function cleanupLogScriptProperties() {
  const ui = st_getUi_();
  const keys = [
    CONFIG.PROPS.LOG_LEVEL,
    CONFIG.PROPS.LOG_MAX_ROWS,
    "LOG_MAX", // 旧互換キー
  ];
  const all = PropertiesService.getScriptProperties().getProperties();
  const existed = keys.filter(k => (k in all));
  ScriptProps.delMany(existed);
  const msg = "OK：ログ関連の任意キーを削除しました。\n\n削除数: " + existed.length;
  if (ui) ui.alert(msg); else console.log(msg);
}

/**
 * 日次準備（予約札/当日まとめ）の設定キーを削除して、プロパティを最小化する。
 * ※ 未設定でも DailyPrep は既定（7:00/offset0/全曜日）で動きます
 */
function cleanupDailyPrepScriptProperties() {
  const ui = st_getUi_();
  const keys = [
    CONFIG.PROPS.DAILY_PREP_AT_HOUR,
    CONFIG.PROPS.DAILY_PREP_AT_MINUTE,
    CONFIG.PROPS.DAILY_PREP_OFFSET_DAYS,
    CONFIG.PROPS.DAILY_PREP_WEEKDAYS,
  ];
  const all = PropertiesService.getScriptProperties().getProperties();
  const existed = keys.filter(k => (k in all));
  ScriptProps.delMany(existed);
  const msg =
    "OK：日次準備の設定キーを削除しました。\n\n" +
    "削除数: " + existed.length + "\n" +
    "（必要なら「日次準備設定」メニューで再設定できます）";
  if (ui) ui.alert(msg); else console.log(msg);
}

/**
 * 締切後送信メール通知の「任意キー」を削除して、プロパティを最小化する。
 * ※ 通知は LATE_SUBMISSION_NOTIFY_TO が未設定なら無効です（ENABLED は旧互換）
 */
function cleanupLateSubmissionNotifyScriptProperties() {
  const ui = st_getUi_();
  const keys = [CONFIG.PROPS.LATE_SUBMISSION_NOTIFY_ENABLED]; // 旧互換キー
  const all = PropertiesService.getScriptProperties().getProperties();
  const existed = keys.filter(k => (k in all));
  ScriptProps.delMany(existed);
  const msg =
    "OK：締切後送信メール通知（旧互換キー）を削除しました。\n\n" +
    "削除数: " + existed.length + "\n" +
    "通知の有効/無効は " + CONFIG.PROPS.LATE_SUBMISSION_NOTIFY_TO + " の有無で制御します。";
  if (ui) ui.alert(msg); else console.log(msg);
}

/**
 * Debug の「任意キー」を削除して、プロパティを最小化する。
 */
function cleanupDebugScriptProperties() {
  const ui = st_getUi_();
  const keys = [
    CONFIG.PROPS.DEBUG_MAIN,
    CONFIG.PROPS.DEBUG_ORDER_SAVE, // 旧互換キー
  ];
  const all = PropertiesService.getScriptProperties().getProperties();
  const existed = keys.filter(k => (k in all));
  ScriptProps.delMany(existed);
  ui.alert("OK：Debug 関連の任意キーを削除しました。\n\n削除数: " + existed.length);
}

/**
 * メニュー表示制御の「任意キー」を削除して、プロパティを最小化する。
 * ※ ADMIN_EMAILS は未設定でも「オーナーのみ管理者」扱いで動きます
 */
function cleanupMenuVisibilityScriptProperties() {
  const ui = SpreadsheetApp.getUi();
  const keys = [
    CONFIG.PROPS.ADMIN_EMAILS,
    CONFIG.PROPS.MENU_SHOW_ADVANCED, // 旧互換キー
  ];
  const all = PropertiesService.getScriptProperties().getProperties();
  const existed = keys.filter(k => (k in all));
  ScriptProps.delMany(existed);
  const msg = "OK：メニュー表示制御の任意キーを削除しました。\n\n削除数: " + existed.length;
  if (ui) ui.alert(msg); else console.log(msg);
}

/**
 * まとめて最小化（バックアップ含む任意キーを一括削除）
 */
function cleanupAllOptionalScriptProperties() {
  const ui = st_getUi_();
  const groups = [
    // backup optional
    [CONFIG.PROPS.BACKUP_AT_HOUR, CONFIG.PROPS.BACKUP_DAILY_RETENTION_DAYS, CONFIG.PROPS.BACKUP_DAILY_FOLDER_KEEP_MONTHS,
     CONFIG.PROPS.BACKUP_USE_MONTHLY_FOLDER, CONFIG.PROPS.BACKUP_MONTHLY_RETENTION_MONTHS, CONFIG.PROPS.BACKUP_MONTHLY_FOLDER_NAME,
     CONFIG.PROPS.BACKUP_MANUAL_FOLDER_NAME, CONFIG.PROPS.BACKUP_RETENTION_DAYS],
    // log
    [CONFIG.PROPS.LOG_LEVEL, CONFIG.PROPS.LOG_MAX_ROWS, "LOG_MAX"],
    // daily prep
    [CONFIG.PROPS.DAILY_PREP_AT_HOUR, CONFIG.PROPS.DAILY_PREP_AT_MINUTE, CONFIG.PROPS.DAILY_PREP_OFFSET_DAYS, CONFIG.PROPS.DAILY_PREP_WEEKDAYS],
    // late notify (legacy)
    [CONFIG.PROPS.LATE_SUBMISSION_NOTIFY_ENABLED],
    // debug (旧互換含む)
    [CONFIG.PROPS.DEBUG_MAIN, CONFIG.PROPS.DEBUG_ORDER_SAVE],
    // menu visibility (旧互換含む)
    [CONFIG.PROPS.ADMIN_EMAILS, CONFIG.PROPS.MENU_SHOW_ADVANCED],
  ];
  const all = PropertiesService.getScriptProperties().getProperties();
  const toDelete = [];
  groups.forEach(keys => keys.forEach(k => { if (k in all) toDelete.push(k); }));
  ScriptProps.delMany(toDelete);
  const msg =
    "OK：任意キーをまとめて削除しました。\n\n" +
    "削除数: " + toDelete.length + "\n" +
    "残る必須キー（例）: " + [CONFIG.PROPS.LINE_TOKEN, CONFIG.PROPS.WEBHOOK_KEY, CONFIG.PROPS.BACKUP_FOLDER_ID].join(", ");
  if (ui) ui.alert(msg); else console.log(msg);
}

// ===== 初期設定チェック（Script Properties） =====

function checkScriptProperties() {
  const ui = st_getUi_();
  const r = ScriptProps.validate();
  if (r.ok) {
    const msg = "OK：必須の Script Properties は設定済みです。";
    if (ui) ui.alert(msg); else console.log(msg);
  } else {
    const msg = "NG：未設定の Script Properties があります。\n\n- " + r.missing.join("\n- ");
    if (ui) ui.alert(msg); else console.log(msg);
  }
}

// ===== 内部（上記の導入ツール用） =====

function st_clampInt_(n, min, max) {
  const x = parseInt(n, 10);
  if (!Number.isFinite(x)) return min;
  return Math.min(max, Math.max(min, x));
}

function st_deleteTriggersByHandler_(handlerName) {
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

function st_parseWeekdays_(text) {
  let s = String(text ?? "").trim();
  if (!s) return null;

  // 全角数字→半角
  s = s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

  // 日本語曜日→数字（例: 月-金 / 月金 / 月,火）
  const map = {
    "日": "0", "sun": "0", "sunday": "0",
    "月": "1", "mon": "1", "monday": "1",
    "火": "2", "tue": "2", "tuesday": "2",
    "水": "3", "wed": "3", "wednesday": "3",
    "木": "4", "thu": "4", "thursday": "4",
    "金": "5", "fri": "5", "friday": "5",
    "土": "6", "sat": "6", "saturday": "6",
  };
  const lower = s.toLowerCase();
  let normalized = lower;
  Object.keys(map).forEach(k => {
    normalized = normalized.replaceAll(k, map[k]);
  });

  // 区切りを統一
  normalized = normalized
    .replace(/[，、]/g, ",")
    .replace(/[~〜]/g, "-")
    .replace(/\s+/g, "");

  // "1-5" のような範囲を展開、"," で複数可
  // 0(日)〜6(土) に加えて 7(日) も許容（=日）
  const set = new Set();
  const parts = normalized.split(",").filter(Boolean);
  parts.forEach(p => {
    const m = p.match(/^(\d)(?:-(\d))?$/);
    if (!m) throw new Error("weekdays が不正です（例: 1-5, 0,2,4,6）。");
    const a0 = parseInt(m[1], 10);
    const b0 = m[2] ? parseInt(m[2], 10) : a0;
    if (a0 < 0 || a0 > 7 || b0 < 0 || b0 > 7) throw new Error("weekdays は 0(日)〜6(土)（または 7=日）です。");

    const add = (x0) => set.add(x0 === 7 ? 0 : x0); // 7 を日(0)として扱う

    if (a0 <= b0) {
      // 例: 4-7 => 4,5,6,7(=0)
      for (let i = a0; i <= b0; i++) add(i);
    } else {
      // 例: 5-1 => 5,6,7(=0),0,1
      for (let i = a0; i <= 7; i++) add(i);
      for (let i = 0; i <= b0; i++) add(i);
    }
  });
  return set;
}

function st_weekdaysLabel_(text) {
  const set = st_parseWeekdays_(text);
  if (!set) return "全曜日";

  const labels = ["日","月","火","水","木","金","土"];
  // 表示は 月→…→日 の順にしたいので並び替え
  const order = [1,2,3,4,5,6,0];
  const out = order.filter(d => set.has(d)).map(d => labels[d]);
  return out.length ? out.join("") : "全曜日";
}

