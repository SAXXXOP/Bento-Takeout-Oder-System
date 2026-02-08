/**
 * TemplatePropsTools.gs
 * テンプレ配布用：Script Properties の「キーを作り直す」「値をダミー化する」
 */

function getTemplatePropsDefaults_() {
  // 推奨値の例（READMEの推奨値をベース）
  const defaults = {
    // 必須（テンプレではダミーにして未設定扱いにする）
    [CONFIG.PROPS.LINE_TOKEN]: "__SET_ME__",
    [CONFIG.PROPS.WEBHOOK_KEY]: "__SET_ME__",

    // ログ（任意）
    [CONFIG.PROPS.LOG_LEVEL]: "WARN",
    [CONFIG.PROPS.LOG_MAX_ROWS]: "2000",

    // バックアップ（運用）
    [CONFIG.PROPS.BACKUP_FOLDER_ID]: "__SET_ME__",
    [CONFIG.PROPS.BACKUP_AT_HOUR]: "3",
    [CONFIG.PROPS.BACKUP_DAILY_RETENTION_DAYS]: "60",
    [CONFIG.PROPS.BACKUP_DAILY_FOLDER_KEEP_MONTHS]: "12",
    [CONFIG.PROPS.BACKUP_USE_MONTHLY_FOLDER]: "1",
    [CONFIG.PROPS.BACKUP_MONTHLY_RETENTION_MONTHS]: "12",
    [CONFIG.PROPS.BACKUP_MONTHLY_FOLDER_NAME]: "MonthlySnapshots",
    [CONFIG.PROPS.BACKUP_MANUAL_FOLDER_NAME]: "ManualSnapshots",

    // 互換/任意
    [CONFIG.PROPS.BACKUP_RETENTION_DAYS]: "60",

    // デバッグ（任意）
    [CONFIG.PROPS.DEBUG_MAIN]: "0",
    [CONFIG.PROPS.DEBUG_ORDER_SAVE]: "0",
  };

  // あなたが挙げていた “LOG_MAX” が残ってる環境もあるので保険で作る（コード上は LOG_MAX_ROWS が正）
  defaults["LOG_MAX"] = defaults[CONFIG.PROPS.LOG_MAX_ROWS];

  return { defaults };
}

/**
 * テンプレ用：未設定のキーだけ作成（既存値は触らない）
 */
function ensureTemplateScriptProperties() {
  const cur = PropertiesService.getScriptProperties().getProperties();
  const toSet = {};

  function ensureTemplateScriptProperties() {
  const defaults = getTemplatePropsDefaults_();
  const cur = PropertiesService.getScriptProperties().getProperties();
  const toSet = {};

  Object.keys(defaults).forEach(k => {
    const v = (k in cur) ? String(cur[k] ?? "") : "";
    if (!v.trim()) {
      toSet[k] = defaults[k];
    }
  });

  ScriptProps.setMany(toSet);
  SpreadsheetApp.getUi().alert(
    "OK：テンプレ用 Script Properties を作成しました（未設定のみ）。\n\n作成/更新数: " + Object.keys(toSet).length
  );
  }
}

function overwriteTemplateScriptProperties() {
  const defaults = getTemplatePropsDefaults_();
  ScriptProps.setMany(defaults);
  SpreadsheetApp.getUi().alert(
    "OK：テンプレ用 Script Properties を上書きしました（全部ダミー）。"
  );
}