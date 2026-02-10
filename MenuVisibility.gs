/**
 * MenuVisibility.gs
 * 「★予約管理」メニューに表示する項目を Script Properties で切り替える
 *
 * 1/true/yes で表示、0/false/no で非表示
 */
const MenuVisibility = (() => {
  // ScriptProps の初期化順に依存して落ちないよう、参照は遅延評価にする
  const FALLBACK_KEYS_ = (typeof CONFIG !== "undefined" && CONFIG && CONFIG.PROPS) ? CONFIG.PROPS : {};

  function keys_() {
    try {
      if (typeof ScriptProps !== "undefined" && ScriptProps && ScriptProps.KEYS) return ScriptProps.KEYS;
    } catch (e) {}
    return FALLBACK_KEYS_;
  }

  function getBool_(key, defaultValue) {
    // ScriptProps が利用できるなら優先
    try {
      if (typeof ScriptProps !== "undefined" && ScriptProps && typeof ScriptProps.getBool === "function") {
        return ScriptProps.getBool(key, defaultValue);
      }
    } catch (e) {}

    // 最低限の直読み（MenuVisibility 単体で完結）
    const raw = PropertiesService.getScriptProperties().getProperty(key);
    if (raw === null || raw === undefined || raw === "") return !!defaultValue;
    const s = String(raw).trim().toLowerCase();
    if (["1","true","yes","y","on"].includes(s)) return true;
    if (["0","false","no","n","off"].includes(s)) return false;
    return !!defaultValue;
  }

  function key_(propName) {
    const KEYS = keys_();
    return (KEYS && KEYS[propName]) ? KEYS[propName] : propName;
  }

  function on_(propName, defaultValue) {
    return getBool_(key_(propName), defaultValue);
  }

  // マスター：これが false なら “日々の運用（基本）” だけ表示
  function showAdvanced() {
    return showAdvanced() && on_("MENU_SHOW_NAME_CONFLICT", true);
  }

  function showOrderNoTools() {
    return showAdvanced() && on_(KEYS.MENU_SHOW_ORDERNO, true);
  }

  function showNameConflict() {
    return showAdvanced() && on_(KEYS.MENU_SHOW_NAME_CONFLICT, true);
  }

  function showStatusTools() {
    return showAdvanced() && on_("MENU_SHOW_STATUS", true);
  }

  function showBackup() {
    return showAdvanced() && on_("MENU_SHOW_BACKUP", true);
  }

  function showSetupTools() {
    return showAdvanced() && on_("MENU_SHOW_SETUP", true);
  }

  function showPropCheck() {
    return showAdvanced() && on_("MENU_SHOW_PROP_CHECK", true);
  }

  return {
    showAdvanced,
    showOrderNoTools,
    showNameConflict,
    showStatusTools,
    showBackup,
    showSetupTools,
    showPropCheck,
  };
})();