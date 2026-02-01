let MENU_CACHE = null;

/**
 * メニューマスタを取得
 * { name, price, short } の配列
 */
function getMenuMaster() {
  if (MENU_CACHE) return MENU_CACHE;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("メニューマスタ");
  if (!sheet) throw new Error("メニューマスタ シートが見つかりません");

  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();

  MENU_CACHE = values
    .filter(r => r[0] && r[1])
    .map(r => ({
      name: r[0].toString(),
      price: Number(r[1]),
      short: r[2] ? r[2].toString() : ""
    }));

  return MENU_CACHE;
}

