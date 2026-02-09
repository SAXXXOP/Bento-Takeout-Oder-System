// ScriptProps.gs
const ScriptProps = (() => {
  const KEYS = CONFIG.PROPS; // キー定義は Config.gs の CONFIG.PROPS に一本化


  // テンプレ用ダミー値（これらは「未設定」とみなす）
  const PLACEHOLDERS_ = new Set(["__SET_ME__", "SET_ME", "DUMMY", "CHANGE_ME"]);

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

  // 書き込みはキャッシュを使わず “実体” に直接
  function writableProps_() {
    return PropertiesService.getScriptProperties();
  }

  function get(key, defaultValue = "") {
    const v = props_().getProperty(key);
    return (v === null || v === undefined || String(v).trim() === "") ? defaultValue : String(v).trim();
  }

  function isUnset_(key) {
    const v = String(get(key, "")).trim();
    return !v || PLACEHOLDERS_.has(v);
  }

  // ★追加：Script Properties の設定（キャッシュもクリア）
  function set(key, value) {
    writableProps_().setProperty(String(key), value === null || value === undefined ? "" : String(value));
    clearScriptPropsCache_();
  }

  // ★追加：まとめて設定（deleteAllOthers=false）
  function setMany(obj) {
    writableProps_().setProperties(obj || {}, false);
    clearScriptPropsCache_();
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
    const missing = required.filter(k => isUnset_(k));
    return { ok: missing.length === 0, missing };
  }

  return { KEYS, get, getInt, getBool, validate, clearCache: clearScriptPropsCache_, set, setMany };
})();
