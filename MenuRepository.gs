const MenuRepository = {
  getMenu() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("メニューマスタ");
    const values = sheet.getDataRange().getValues();
    const data = [];
    
    // 2行目から開始 (ID, グループ, メニュー名, 小メニュー, 価格, 略称)
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      if (!row[2]) continue; // C列(メニュー名)が空ならスキップ
      data.push({
        group: row[1],      // B: グループ
        parentName: row[2], // C: メニュー名（フォームの質問名）
        childName: row[3],  // D: 小メニュー（グリッドの項目）
        price: row[4],      // E: 価格
        shortName: row[5]   // F: 略称
      });
    }
    return data;
  }
};