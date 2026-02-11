/**
 * SheetVisibility.gs
 * Script Properties でシート群の表示/非表示を切り替える
 */

const SHEET_GROUPS = {
  // ★ここをあなたのシート名に合わせて編集
  ADMIN: ["顧客名簿", "ログ", "設定"],
  OPS:   ["予約札", "当日まとめ", "要確認一覧"],
};

// ★プロパティキー（値は "1"=表示, "0"=非表示）
const SHEET_VIS_PROPS = {
  ADMIN_VISIBLE: "SHEETGROUP_ADMIN_VISIBLE",
  OPS_VISIBLE:   "SHEETGROUP_OPS_VISIBLE",
};

/** 初期値を入れたい時だけ実行（何度実行してもOK） */
function SheetVisibility_setDefaultProps() {
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty(SHEET_VIS_PROPS.ADMIN_VISIBLE) === null) p.setProperty(SHEET_VIS_PROPS.ADMIN_VISIBLE, "0"); // 管理は既定で隠す
  if (p.getProperty(SHEET_VIS_PROPS.OPS_VISIBLE) === null)   p.setProperty(SHEET_VIS_PROPS.OPS_VISIBLE, "1");   // 運用は既定で表示
}

/** プロパティに従って全グループを適用 */
function SheetVisibility_applyFromProps() {
  SheetVisibility_setDefaultProps();

  const adminVisible = SheetVisibility_getBool_(SHEET_VIS_PROPS.ADMIN_VISIBLE, false);
  const opsVisible   = SheetVisibility_getBool_(SHEET_VIS_PROPS.OPS_VISIBLE, true);

  SheetVisibility_setGroupHidden_("ADMIN", !adminVisible);
  SheetVisibility_setGroupHidden_("OPS",   !opsVisible);
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
  const names = SHEET_GROUPS[groupKey] || [];
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
