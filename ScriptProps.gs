// ScriptProps.gs
const ScriptProps = (() => {
  const KEYS = {
    LINE_TOKEN: CONFIG.PROPS.LINE_TOKEN,
    WEBHOOK_KEY: CONFIG.PROPS.WEBHOOK_KEY,

    // logging
    LOG_LEVEL: CONFIG.PROPS.LOG_LEVEL,
    LOG_MAX_ROWS: CONFIG.PROPS.LOG_MAX_ROWS,

    // debug
    DEBUG_ORDER_SAVE: "DEBUG_ORDER_SAVE",

    // backup
    BACKUP_FOLDER_ID: CONFIG.PROPS.BACKUP_FOLDER_ID,
    BACKUP_AT_HOUR: CONFIG.PROPS.BACKUP_AT_HOUR,
    BACKUP_DAILY_RETENTION_DAYS: CONFIG.PROPS.BACKUP_DAILY_RETENTION_DAYS,
    BACKUP_RETENTION_DAYS: CONFIG.PROPS.BACKUP_RETENTION_DAYS, // 互換
    BACKUP_MONTHLY_RETENTION_MONTHS: CONFIG.PROPS.BACKUP_MONTHLY_RETENTION_MONTHS,
    BACKUP_USE_MONTHLY_FOLDER: CONFIG.PROPS.BACKUP_USE_MONTHLY_FOLDER,
    BACKUP_DAILY_FOLDER_KEEP_MONTHS: CONFIG.PROPS.BACKUP_DAILY_FOLDER_KEEP_MONTHS,
    BACKUP_MONTHLY_FOLDER_NAME: CONFIG.PROPS.BACKUP_MONTHLY_FOLDER_NAME,
    BACKUP_MANUAL_FOLDER_NAME: CONFIG.PROPS.BACKUP_MANUAL_FOLDER_NAME,
  };

  function props_() {
    return PropertiesService.getScriptProperties();
  }

  function get(key, defaultValue = "") {
    const v = props_().getProperty(key);
    return (v === null || v === undefined || String(v).trim() === "") ? defaultValue : String(v).trim();
  }

  function getInt(key, defaultValue) {
    const n = parseInt(get(key, String(defaultValue)), 10);
    return Number.isFinite(n) ? n : defaultValue;
  }

  function getBool(key, defaultValue) {
    const v = get(key, defaultValue ? "1" : "0").toLowerCase();
    return v === "1" || v === "true" || v === "yes";
  }

  function validate() {
    // コア動作の必須：まずは最小限に
    const required = [KEYS.LINE_TOKEN];
    const missing = required.filter(k => !get(k));
    return { ok: missing.length === 0, missing };
  }

  return { KEYS, get, getInt, getBool, validate };
})();
