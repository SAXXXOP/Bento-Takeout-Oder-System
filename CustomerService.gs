/**
 * ================================
 * CustomerService.gs
 * 顧客名簿管理
 * ================================
 */
const CustomerService = {

  /**
   * 顧客名簿を更新
   */
  update(userId, userName, phoneNumber, price, orderDetails, totalItems) {
    if (!userId) return;

    const ss = SpreadsheetApp.getActive();
    let sheet = ss.getSheetByName("顧客名簿");

    if (!sheet) {
      sheet = ss.insertSheet("顧客名簿");
      sheet.appendRow([
        "LINE ID", "氏名", "電話番号", "初回来店日", "最終来店日",
        "合計回数", "合計金額", "備考(調理)", "備考(事務)",
        "履歴1", "履歴2", "履歴3"
      ]);
      sheet.setFrozenRows(1);
    }

    const data = sheet.getDataRange().getValues();
    const today = new Date();
    const todayStr = Utilities.formatDate(today, "JST", "MM/dd");

    const summary = `${todayStr} (${totalItems}点) ${price.toLocaleString()}円`;
    const detail = orderDetails.trim();

    let foundRow = -1;
    for (let i = 1; i < data.length; i++) {
      if (data[i][0] === userId) {
        foundRow = i + 1;
        break;
      }
    }

    if (foundRow > 0) {
      // --- 既存顧客 ---
      const historyRange = sheet.getRange(foundRow, 10, 1, 2);
      const oldValues = historyRange.getValues()[0];
      const oldNotes  = historyRange.getNotes()[0];

      const rowValues = data[foundRow - 1];
      const basicInfo = [
        userId,
        userName,
        phoneNumber,
        rowValues[3],
        today,
        Number(rowValues[5] || 0) + 1,
        Number(rowValues[6] || 0) + price
      ];
      sheet.getRange(foundRow, 1, 1, 7).setValues([basicInfo]);

      // 履歴スライド
      sheet.getRange(foundRow, 10).setValue(summary).setNote(detail);
      sheet.getRange(foundRow, 11).setValue(oldValues[0]).setNote(oldNotes[0]);
      sheet.getRange(foundRow, 12).setValue(oldValues[1]).setNote(oldNotes[1]);

    } else {
      // --- 新規顧客 ---
      sheet.appendRow([
        userId, userName, phoneNumber,
        today, today, 1, price,
        "", "", summary, "", ""
      ]);
      sheet.getRange(sheet.getLastRow(), 10).setNote(detail);
    }
  },

  /**
   * 名前検索
   */
  search(query) {
    if (!query) return [];
    const sheet = SpreadsheetApp.getActive().getSheetByName("顧客名簿");
    const data = sheet.getDataRange().getValues();

    return data.slice(1)
      .filter(r => r[1].toString().includes(query))
      .map(r => ({
        row: data.indexOf(r) + 1,
        name: r[1],
        tel: r[2].toString()
      }));
  },

  /**
   * 行番号から顧客取得
   */
  getByRow(row) {
    const sheet = SpreadsheetApp.getActive().getSheetByName("顧客名簿");
    const data = sheet.getRange(row, 1, 1, 9).getValues()[0];

    return {
      row,
      name: data[1],
      noteKitchen: data[7],
      noteOffice: data[8]
    };
  },

  /**
   * 備考保存
   */
  saveNote(row, note, type) {
    const sheet = SpreadsheetApp.getActive().getSheetByName("顧客名簿");
    const col = (type === "kitchen") ? 8 : 9;
    sheet.getRange(row, col).setValue(note);
    return "保存しました！";
  }
};
