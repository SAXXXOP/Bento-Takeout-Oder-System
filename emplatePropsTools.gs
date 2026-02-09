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
    [CONFIG.PROPS.DEBUG_MAIN]: "0",
    [CONFIG.PROPS.DEBUG_ORDER_SAVE]: "0",

    // Menu visibility（任意）: 1=表示 / 0=非表示
    [CONFIG.PROPS.MENU_SHOW_ADVANCED]: "1",
    [CONFIG.PROPS.MENU_SHOW_ORDERNO]: "1",
    [CONFIG.PROPS.MENU_SHOW_NAME_CONFLICT]: "1",
    [CONFIG.PROPS.MENU_SHOW_STATUS]: "1",
    [CONFIG.PROPS.MENU_SHOW_BACKUP]: "1",
    [CONFIG.PROPS.MENU_SHOW_SETUP]: "1",
    [CONFIG.PROPS.MENU_SHOW_PROP_CHECK]: "1",
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
