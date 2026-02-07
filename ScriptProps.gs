// ScriptProps.gs
const ScriptProps = (() => {
  const KEYS = {
    LINE_TOKEN: CONFIG.PROPS.LINE_TOKEN,
    WEBHOOK_KEY: CONFIG.PROPS.WEBHOOK_KEY,

    // logging
    LOG_LEVEL: CONFIG.PROPS.LOG_LEVEL,
    LOG_MAX_ROWS: CONFIG.PROPS.LOG_MAX_ROWS,

    // debug
    DEBUG_ORDER_SAVE: CONFIG.PROPS.DEBUG_ORDER_SAVE,
    // optional debug flags
    DEBUG_MAIN: CONFIG.PROPS.DEBUG_MAIN,

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
    // 直アクセス撲滅：ScriptProperties は ScriptProps 内でのみ参照し、
    // 取得はキャッシュを介して統一する（読み取り頻度が高いので少しだけ最適化）
    const cache = CacheService.getScriptCache();
    const key = "SCRIPT_PROPS_CACHE_V1";

    const cached = cache.get(key);
    if (cached) {
      try {
        const obj = JSON.parse(cached);
        // getProperty互換の薄いラッパを返す
        return {
          getProperty: (k) => (k in obj ? String(obj[k]) : null),
        };
      } catch (e) {
        // キャッシュ破損時はフォールバック
      }
    }

    // ※ここが唯一の「実体アクセス」だが、ルール上は ScriptProps 内だけに閉じる
    const props = PropertiesService.getScriptProperties();
    const all = props.getProperties(); // 全取得
    cache.put(key, JSON.stringify(all), 300); // 5分キャッシュ

    return {
      getProperty: (k) => props.getProperty(k),
    };
  }

  // 必要に応じて手動でキャッシュをクリアできるように（任意）
  function clearScriptPropsCache_() {
    CacheService.getScriptCache().remove("SCRIPT_PROPS_CACHE_V1");
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
    const required = [KEYS.LINE_TOKEN, KEYS.WEBHOOK_KEY];
    const missing = required.filter(k => !get(k));
    return { ok: missing.length === 0, missing };
  }

  return { KEYS, get, getInt, getBool, validate, clearCache: clearScriptPropsCache_ };
})();
