/**
 * SheetVisibility.gs
 * Script Properties でシート群の表示/非表示を切り替える
 */

// ★プロパティキー（値は "1"=表示, "0"=非表示）
const SHEET_VIS_PROPS = {
  ADMIN_VISIBLE: "SHEETGROUP_ADMIN_VISIBLE",
  OPS_VISIBLE:   "SHEETGROUP_OPS_VISIBLE",
  // シート名リスト（カンマ or 改行区切り）
  ADMIN_SHEETS:  "SHEETGROUP_ADMIN_SHEETS",
  OPS_SHEETS:    "SHEETGROUP_OPS_SHEETS",
};

function SheetVisibility_getDefaultSheetGroups_() {
  const sheet = (typeof CONFIG !== "undefined" && CONFIG.SHEET) ? CONFIG.SHEET : {};
  return {
    // 管理用（普段は隠す想定）
    ADMIN: [
      sheet.CUSTOMER_LIST || "顧客名簿",
      sheet.MENU_MASTER || "メニューマスタ",
      sheet.NAME_CONFLICT_LOG || "氏名不一致ログ",
      "ログ",
      "設定",
    ],
    // 運用用（普段は表示想定）
    OPS: [
      sheet.RESERVATION_CARD || "予約札",
      sheet.DAILY_SUMMARY || "当日まとめ",
      sheet.NEEDS_CHECK_VIEW || "★要確認一覧",
    ],
  };
}

function SheetVisibility_getGroupSheetNames_(groupKey) {
  const p = PropertiesService.getScriptProperties();
  const propKey =
    groupKey === "ADMIN" ? SHEET_VIS_PROPS.ADMIN_SHEETS :
    groupKey === "OPS"   ? SHEET_VIS_PROPS.OPS_SHEETS   : null;

  const raw = propKey ? p.getProperty(propKey) : "";
  if (raw && raw.trim()) {
    // カンマ or 改行区切り（シート名にカンマが入るケースは想定しない）
    return raw.split(/\s*,\s*|\s*\n+\s*/).map(s => s.trim()).filter(Boolean);
  }
  const defaults = SheetVisibility_getDefaultSheetGroups_();
  return defaults[groupKey] || [];
}

/** 初期値を入れたい時だけ実行（何度実行してもOK） */
function SheetVisibility_setDefaultProps() {
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty(SHEET_VIS_PROPS.ADMIN_VISIBLE) === null) p.setProperty(SHEET_VIS_PROPS.ADMIN_VISIBLE, "0"); // 管理は既定で隠す
  if (p.getProperty(SHEET_VIS_PROPS.OPS_VISIBLE) === null)   p.setProperty(SHEET_VIS_PROPS.OPS_VISIBLE, "1");   // 運用は既定で表示

  // シート名リストも未設定なら初期値を入れる（必要ならプロパティ側で編集）
  const defaults = SheetVisibility_getDefaultSheetGroups_();
  if (p.getProperty(SHEET_VIS_PROPS.ADMIN_SHEETS) === null) p.setProperty(SHEET_VIS_PROPS.ADMIN_SHEETS, defaults.ADMIN.join(","));
  if (p.getProperty(SHEET_VIS_PROPS.OPS_SHEETS) === null)   p.setProperty(SHEET_VIS_PROPS.OPS_SHEETS, defaults.OPS.join(","));
}

/** プロパティに従って全グループを適用 */
function SheetVisibility_applyFromProps() {
  SheetVisibility_setDefaultProps();

  const adminVisible = SheetVisibility_getBool_(SHEET_VIS_PROPS.ADMIN_VISIBLE, false);
  const opsVisible   = SheetVisibility_getBool_(SHEET_VIS_PROPS.OPS_VISIBLE, true);

  SheetVisibility_setGroupHidden_("ADMIN", !adminVisible);
  SheetVisibility_setGroupHidden_("OPS",   !opsVisible);
}

/**
 * ★追加：管理者/閲覧者で自動適用（メニュー判定と同期）
 * - 管理者(isAdmin=true): ADMIN を表示、OPS も表示
 * - 閲覧者(isAdmin=false): ADMIN を非表示、OPS は表示
 *
 * ※ SheetVisibility_setDefaultProps() は「シート名リスト初期化」のために維持
 */
function SheetVisibility_applyByRole_(isAdmin) {
  SheetVisibility_setDefaultProps();
  SheetVisibility_setGroupHidden_("ADMIN", !isAdmin);
  SheetVisibility_setGroupHidden_("OPS", false);
}

/** 管理グループ：プロパティをトグル→適用 */
function SheetVisibility_toggle_ADMIN() {
  SheetVisibility_toggleBoolProp_(SHEET_VIS_PROPS.ADMIN_VISIBLE, false);
  SheetVisibility_applyFromProps();
}

/** 運用グループ：プロパティをトグル→適用 */
function SheetVisibility_toggle_OPS() {
  SheetVisibility_toggleBoolProp_(SHEET_VIS_PROPS.OPS_VISIBLE, true);
  SheetVisibility_applyFromProps();
}

/** ====== 内部関数 ====== */

function SheetVisibility_getBool_(key, defaultValue) {
  const v = PropertiesService.getScriptProperties().getProperty(key);
  if (v === null || v === "") return !!defaultValue;
  return v === "1" || String(v).toLowerCase() === "true";
}

function SheetVisibility_toggleBoolProp_(key, defaultValue) {
  const p = PropertiesService.getScriptProperties();
  const now = SheetVisibility_getBool_(key, defaultValue);
  p.setProperty(key, now ? "0" : "1");
}

function SheetVisibility_setGroupHidden_(groupKey, hidden) {
  const ss = SpreadsheetApp.getActive();
  const names = SheetVisibility_getGroupSheetNames_(groupKey);
  const targets = names.map(n => ss.getSheetByName(n)).filter(Boolean);
  if (targets.length === 0) return;

  // 「全部非表示」事故を避ける
  if (hidden) {
    const allSheets = ss.getSheets();
    const visibleSheets = allSheets.filter(s => !s.isSheetHidden());
    const targetVisible = targets.filter(s => !s.isSheetHidden());
    if (visibleSheets.length > 0 && visibleSheets.length === targetVisible.length) {
      allSheets[0].showSheet();
      allSheets[0].activate();
    }
  }

  // アクティブシートを隠すなら先に退避
  const active = ss.getActiveSheet();
  if (hidden && active && names.includes(active.getName())) {
    const fallback = ss.getSheets().find(s => !s.isSheetHidden() && !names.includes(s.getName()))
                  || ss.getSheets()[0];
    if (fallback) fallback.activate();
  }

  targets.forEach(sh => hidden ? sh.hideSheet() : sh.showSheet());
}
