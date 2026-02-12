/** 
 *  SchemaExport.gs（Apps Script / JSですが、指定に合わせてjavaフェンスで記載）
 *  新店舗での運用の際は、初手シートIDも確認しCONFIGに反映
*/
function exportSheetSchemaJson() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheets = ss.getSheets().map(s => ({
    name: s.getName(),
    sheetId: s.getSheetId(),
    hidden: s.isSheetHidden(),
    rows: s.getMaxRows(),
    cols: s.getMaxColumns()
  }));

  const payload = {
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    exportedAt: new Date().toISOString(),
    sheets
  };

  const json = JSON.stringify(payload, null, 2);

  // Loggerは長文が切れることがあるので、まずはログ＋返り値で扱いやすく
  Logger.log(json);
  return json;
}
