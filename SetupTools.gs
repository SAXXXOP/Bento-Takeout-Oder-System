// ===== 導入ツール（統合）：日次準備設定 / トリガー =====

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

function getTemplatePropsDefaults_() {
  const defaults = {
    [CONFIG.PROPS.LINE_TOKEN]: "__SET_ME__",
    [CONFIG.PROPS.WEBHOOK_KEY]: "__SET_ME__",
    [CONFIG.PROPS.LOG_LEVEL]: "WARN",
    [CONFIG.PROPS.LOG_MAX_ROWS]: "2000",
    [CONFIG.PROPS.BACKUP_FOLDER_ID]: "__SET_ME__",
    [CONFIG.PROPS.BACKUP_AT_HOUR]: "3",
    [CONFIG.PROPS.BACKUP_DAILY_RETENTION_DAYS]: "60",
    [CONFIG.PROPS.BACKUP_DAILY_FOLDER_KEEP_MONTHS]: "12",
    [CONFIG.PROPS.BACKUP_USE_MONTHLY_FOLDER]: "1",
    [CONFIG.PROPS.BACKUP_MONTHLY_RETENTION_MONTHS]: "12",
    [CONFIG.PROPS.BACKUP_MONTHLY_FOLDER_NAME]: "MonthlySnapshots",
    [CONFIG.PROPS.BACKUP_MANUAL_FOLDER_NAME]: "ManualSnapshots",
    [CONFIG.PROPS.BACKUP_RETENTION_DAYS]: "60",
    // Daily prep（運用：予約札 + 当日まとめ 自動作成）
    [CONFIG.PROPS.DAILY_PREP_AT_HOUR]: "7",
    [CONFIG.PROPS.DAILY_PREP_AT_MINUTE]: "0",
    [CONFIG.PROPS.DAILY_PREP_OFFSET_DAYS]: "0",
    // 曜日指定：空=毎日、0=日…6=土（例：月-金 → "1-5" / "月-金" / "Mon-Fri" でもOK）
    [CONFIG.PROPS.DAILY_PREP_WEEKDAYS]: "0,1,2,3,4,5,6",

    // 締切後送信メール（任意）
    // 例）有効化: LATE_SUBMISSION_NOTIFY_ENABLED=1 / 宛先: LATE_SUBMISSION_NOTIFY_TO=aaa@example.com,bbb@example.com
    [CONFIG.PROPS.LATE_SUBMISSION_NOTIFY_ENABLED]: "0",
    [CONFIG.PROPS.LATE_SUBMISSION_NOTIFY_TO]: "__SET_ME__",
    [CONFIG.PROPS.DEBUG_MAIN]: "0",
    // Menu visibility（任意）
    // 管理者追加（カンマ区切り）。未設定なら「オーナーのみ管理者」
    [CONFIG.PROPS.ADMIN_EMAILS]: "__SET_ME__",

    // 互換：ユーザーのメールが取得できない環境向け（全員に適用されるフォールバック）

    // Menu visibility（任意）
    // 1=管理者メニュー表示 / 0=日々の運用のみ
    [CONFIG.PROPS.MENU_SHOW_ADVANCED]: "0",
  };

  // 互換：LOG_MAX が残ってる環境向け
  defaults["LOG_MAX"] = defaults[CONFIG.PROPS.LOG_MAX_ROWS];
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

  SpreadsheetApp.getUi().alert(
    "OK：テンプレ用 Script Properties を作成しました（未設定のみ）。\n\n作成/更新数: " + Object.keys(toSet).length
  );
}

function overwriteTemplateScriptProperties() {
  const defaults = getTemplatePropsDefaults_();
  ScriptProps.setMany(defaults);
  SpreadsheetApp.getUi().alert("OK：テンプレ用 Script Properties を上書きしました（全部ダミー）。");
}

// ===== 初期設定チェック（Script Properties） =====

function checkScriptProperties() {
  const ui = SpreadsheetApp.getUi();
  const r = ScriptProps.validate();
  if (r.ok) {
    ui.alert("OK：必須の Script Properties は設定済みです。");
  } else {
    ui.alert("NG：未設定の Script Properties があります。\n\n- " + r.missing.join("\n- "));
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
  const set = new Set();
  const parts = normalized.split(",").filter(Boolean);
  parts.forEach(p => {
    const m = p.match(/^(\d)(?:-(\d))?$/);
    if (!m) throw new Error("weekdays が不正です（例: 1-5, 0,2,4,6）。");
    const a = parseInt(m[1], 10);
    const b = m[2] ? parseInt(m[2], 10) : a;
    if (a < 0 || a > 6 || b < 0 || b > 6) throw new Error("weekdays は 0(日)〜6(土) です。");
    if (a <= b) {
      for (let i = a; i <= b; i++) set.add(i);
    } else {
      // 5-1 のような逆は週跨ぎ扱いで展開（5,6,0,1）
      for (let i = a; i <= 6; i++) set.add(i);
      for (let i = 0; i <= b; i++) set.add(i);
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

