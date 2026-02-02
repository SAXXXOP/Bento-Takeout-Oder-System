const CustomerService = {

  // ================================
  // フォーム送信時の名簿更新（改修版）
  // ================================
  checkAndUpdateCustomer(formData) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("顧客名簿");
    if (!sheet) return false;

    const values = sheet.getDataRange().getValues();
    const lineId = formData.userId;
    const phone = formData.phoneNumber;
    const newName = formData.userName;
    const now = new Date();

    let foundRow = -1;

    // ① LINE ID 最優先で検索
    for (let i = 1; i < values.length; i++) {
      if (lineId && values[i][0] === lineId) {
        foundRow = i + 1;
        break;
      }
    }

    // ② 保険：電話番号一致
    if (foundRow === -1 && phone) {
      for (let i = 1; i < values.length; i++) {
        if (values[i][2] === phone) {
          foundRow = i + 1;
          break;
        }
      }
    }

    // === 既存顧客 ===
    if (foundRow !== -1) {
      const row = values[foundRow - 1];
      const oldName = row[1];

      // 名前は「情報量が多い方」を採用
      const betterName =
        newName && newName.length > (oldName || "").length
          ? newName
          : oldName;

      const currentCount = parseInt(row[5]) || 0;
      const currentTotal = parseInt(row[6]) || 0;

      sheet.getRange(foundRow, 1).setValue(lineId || row[0]); // LINE ID
      sheet.getRange(foundRow, 2).setValue(betterName);      // 氏名
      sheet.getRange(foundRow, 5).setValue(now);             // 最終
      sheet.getRange(foundRow, 6).setValue(currentCount + 1);// 回数
      sheet.getRange(foundRow, 7).setValue(
        currentTotal + (formData.totalPrice || 0)
      );

      return true; // 常連
    }

    // === 新規顧客 ===
    sheet.appendRow([
      lineId,                 // A: LINE ID
      newName,                // B: 氏名
      phone,                  // C: 電話番号
      now,                    // D: 初回
      now,                    // E: 最終
      1,                      // F: 回数
      formData.totalPrice||0, // G: 金額
      "",                     // H: 備考(調理)
      "",                     // I: 備考(事務)
      "", "", ""              // 履歴
    ]);

    return false;
  },

  // ================================
  // サイドバー検索（氏名部分一致）
  // ================================
  getCustomerInfo(name) {
    if (!name) return null;
    const values = SpreadsheetApp.getActiveSpreadsheet()
      .getSheetByName("顧客名簿")
      .getDataRange()
      .getValues();

    for (let i = 1; i < values.length; i++) {
      if (values[i][1] && values[i][1].includes(name)) {
        return {
          lineId: values[i][0],
          name: values[i][1],
          tel: values[i][2],
          noteCook: values[i][7],
          noteOffice: values[i][8],
          row: i + 1
        };
      }
    }
    return null;
  },

  // ================================
  // サイドバー保存
  // ================================
  updateCustomerNotes(rowData) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("顧客名簿");
    sheet.getRange(rowData.row, 8).setValue(rowData.noteCook);
    sheet.getRange(rowData.row, 9).setValue(rowData.noteOffice);
    return "保存しました";
  }
};