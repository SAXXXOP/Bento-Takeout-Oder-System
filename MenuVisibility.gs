/**
 * MenuVisibility.gs
 * 「★予約管理」メニューに表示する項目を “管理者/閲覧者” で切り替える
 *
 * - 管理者: スプレッドシートのオーナー + Script Properties の ADMIN_EMAILS（任意）
 * - 閲覧者: 上記以外
 *
 * 補足:
 * - 環境によっては Session.getActiveUser().getEmail() が空になります。
 *   その場合は互換のため MENU_SHOW_ADVANCED をフォールバックに利用します（全員に適用）。
 */
const MenuVisibility = (() => {
  // ScriptProps の初期化順に依存して落ちないよう、参照は遅延評価にする
  const FALLBACK_KEYS_ = (typeof CONFIG !== "undefined" && CONFIG && CONFIG.PROPS) ? CONFIG.PROPS : {};
  const PLACEHOLDERS_ = new Set(["__SET_ME__", "SET_ME", "DUMMY", "CHANGE_ME"]);

  function keys_() {
    try {
      if (typeof ScriptProps !== "undefined" && ScriptProps && ScriptProps.KEYS) return ScriptProps.KEYS;
    } catch (e) {}
    return FALLBACK_KEYS_;
  }

  function key_(propName) {
    const KEYS = keys_();
    return (KEYS && KEYS[propName]) ? KEYS[propName] : propName;
  }

  function getString_(key, defaultValue) {
    try {
      if (typeof ScriptProps !== "undefined" && ScriptProps && typeof ScriptProps.get === "function") {
        return ScriptProps.get(key, defaultValue);
      }
    } catch (e) {}
    const raw = PropertiesService.getScriptProperties().getProperty(key);
    return (raw === null || raw === undefined || String(raw).trim() === "") ? (defaultValue ?? "") : String(raw).trim();
  }

  function getBool_(key, defaultValue) {   
    try {
      if (typeof ScriptProps !== "undefined" && ScriptProps && typeof ScriptProps.getBool === "function") {
        return ScriptProps.getBool(key, defaultValue);
      }
    } catch (e) {}

    const raw = PropertiesService.getScriptProperties().getProperty(key);
    if (raw === null || raw === undefined || raw === "") return !!defaultValue;
    const s = String(raw).trim().toLowerCase();
    if (["1", "true", "yes", "y", "on"].includes(s)) return true;
    if (["0", "false", "no", "n", "off"].includes(s)) return false;
    return !!defaultValue;
  }

  function getUserEmails_() {
    let active = "";
    let effective = "";
    try { active = Session.getActiveUser().getEmail(); } catch (e) {}
    try { effective = Session.getEffectiveUser().getEmail(); } catch (e) {}
    const userEmail = String(active || effective || "").trim();
    return { userEmail, activeEmail: String(active || "").trim(), effectiveEmail: String(effective || "").trim() };
  }

  function getOwnerEmail_() {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const file = DriveApp.getFileById(ss.getId());
      const owner = file.getOwner();
      return owner ? String(owner.getEmail() || "").trim() : "";
    } catch (e) {
      return "";
    }
  }

  function parseEmailList_(raw) {
    const s0 = String(raw || "").trim();
    if (!s0) return [];
    if (PLACEHOLDERS_.has(s0)) return [];
    return s0
      .split(/[\s,;]+/g)
      .map(x => String(x || "").trim())
      .filter(Boolean)
      .map(x => x.toLowerCase())
      .filter(x => !PLACEHOLDERS_.has(x.toUpperCase()));
  }

  function getAdminEmails_() {
    const raw = getString_(key_("ADMIN_EMAILS"), "");
    return parseEmailList_(raw);
  }
  function getRoleInfo() {
    const emails = getUserEmails_();
    const ownerEmail = getOwnerEmail_();
    const adminEmails = getAdminEmails_();

    let isAdmin = false;
    let mode = "auto";

    if (emails.userEmail) {
      const me = emails.userEmail.toLowerCase();
      if (ownerEmail && me === ownerEmail.toLowerCase()) isAdmin = true;
      if (adminEmails.includes(me)) isAdmin = true;
    } else {
      // メールが取れない環境向けのフォールバック（互換）
      mode = "fallback:MENU_SHOW_ADVANCED";
      isAdmin = getBool_(key_("MENU_SHOW_ADVANCED"), true);
    }

    return {
      isAdmin,
      mode,
      userEmail: emails.userEmail,
      activeEmail: emails.activeEmail,
      effectiveEmail: emails.effectiveEmail,
      ownerEmail,
      adminEmails,
    };
  }
  function isAdmin() {
    return !!getRoleInfo().isAdmin;
  }

  // 互換：従来の呼び出し側が壊れないように “全部 isAdmin()” に寄せる
  function showAdvanced() { return isAdmin(); }
  function showOrderNoTools() { return isAdmin(); }
  function showNameConflict() { return isAdmin(); }
  function showStatusTools() { return isAdmin(); }
  function showBackup() { return isAdmin(); }
  function showSetupTools() { return isAdmin(); }
  function showPropCheck() { return isAdmin(); }

  return {
    // 新
    isAdmin,
    getRoleInfo,

    // 互換
    showAdvanced,
    showOrderNoTools,
    showNameConflict,
    showStatusTools,
    showBackup,
    showSetupTools,
    showPropCheck,
  };
})();