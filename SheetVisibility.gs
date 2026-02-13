/**
 * SheetVisibility.gs
 * “管理者/閲覧者” 判定に同期してシート群を表示/非表示
 *
 * 方針（削れるものは削る）:
 * - Script Properties による表示トグル機能は廃止
 * - シート群は CONFIG.SHEET から決定（存在しないシートは無視）
 * - 管理者: ADMIN + OPS 表示
 * - 閲覧者: ADMIN 非表示、OPS 表示
 */

function SheetVisibility_getDefaultSheetGroups_() {
  const sheet = (typeof CONFIG !== "undefined" && CONFIG.SHEET) ? CONFIG.SHEET : {};
  return {
    // 管理用（普段は隠す想定）
    ADMIN: [
      sheet.MENU_MASTER || "メニューマスタ",
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
  const defaults = SheetVisibility_getDefaultSheetGroups_();
  return defaults[groupKey] || [];
}

/**
 * ★追加：管理者/閲覧者で自動適用（メニュー判定と同期）
 * - 管理者(isAdmin=true): ADMIN を表示、OPS も表示
 * - 閲覧者(isAdmin=false): ADMIN を非表示、OPS は表示
 */
function SheetVisibility_applyByRole_(isAdmin) {
  SheetVisibility_setGroupHidden_("ADMIN", !isAdmin);
  SheetVisibility_setGroupHidden_("OPS", false);
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
