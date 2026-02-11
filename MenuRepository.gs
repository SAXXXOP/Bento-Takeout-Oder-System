const MenuRepository = {
  getMenu() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("メニューマスタ");
    // getLastRow()を使用して、実際にデータがある最後の行まで確実に取得する
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    
    // A列からG列まで（Gは任意：自動返信表示名）
    const values = sheet.getRange(1, 1, lastRow, 7).getValues();
    const data = [];
    
    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      // C列(メニュー名)が空の場合はスキップ
      if (!row[2] || row[2].toString().trim() === "") continue; 
      
      data.push({
        id: row[0],         // A: ID
        group: row[1],      // B: グループ
        parentName: row[2], // C: メニュー名
        childName: row[3],  // D: 小メニュー
        price: row[4],      // E: 価格
        shortName: row[5],  // F: 略称
        autoReplyName: row[6] // G: 自動返信表示名（任意）
      });
    }
    return data;
  }
};