/**
 * MenuVisibility.gs
 * 「★予約管理」メニューに表示する項目を Script Properties で切り替える
 *
 * 1/true/yes で表示、0/false/no で非表示
 */
const MenuVisibility = (() => {
  const KEYS = ScriptProps.KEYS; // = CONFIG.PROPS

  function on_(key, defaultValue) {
    return ScriptProps.getBool(key, defaultValue);
  }

  // マスター：これが false なら “日々の運用（基本）” だけ表示
  function showAdvanced() {
    return on_(KEYS.MENU_SHOW_ADVANCED, true);
  }

  function showOrderNoTools() {
    return showAdvanced() && on_(KEYS.MENU_SHOW_ORDERNO, true);
  }

  function showNameConflict() {
    return showAdvanced() && on_(KEYS.MENU_SHOW_NAME_CONFLICT, true);
  }

  function showStatusTools() {
    return showAdvanced() && on_(KEYS.MENU_SHOW_STATUS, true);
  }

  function showBackup() {
    return showAdvanced() && on_(KEYS.MENU_SHOW_BACKUP, true);
  }

  function showSetupTools() {
    return showAdvanced() && on_(KEYS.MENU_SHOW_SETUP, true);
  }

  function showPropCheck() {
    return showAdvanced() && on_(KEYS.MENU_SHOW_PROP_CHECK, true);
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