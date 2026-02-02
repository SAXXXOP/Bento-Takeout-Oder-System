/**
 * 顧客管理に関連するサービス
 */
const CustomerService = {

  /**
   * フォーム送信時の名簿更新（CONFIG対応版）
   * 既存顧客なら更新してtrueを返し、新規なら追加してfalseを返す
   */
  checkAndUpdateCustomer: function(formData) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET.CUSTOMER_LIST);
    if (!sheet) return false;

    const values = sheet.getDataRange().getValues();
    const lineId = formData.userId;
    const phone = formData.phoneNumber;
    const newName = formData.userName;
    const now = new Date();

    let foundRow = -1;

    // --- ① LINE ID で検索 ---
    if (lineId) {
      const idIdx = CONFIG.CUSTOMER_COLUMN.LINE_ID - 1;
      for (let i = 1; i < values.length; i++) {
        if (values[i][idIdx] === lineId) {
          foundRow = i + 1;
          break;
        }
      }
    }

    // --- ② 保険：電話番号で検索（LINE IDで見つからなかった場合） ---
    if (foundRow === -1 && phone) {
      const telIdx = CONFIG.CUSTOMER_COLUMN.TEL - 1;
      const searchPhone = phone.toString().replace(/'/g, "");
      for (let i = 1; i < values.length; i++) {
        const currentPhone = values[i][telIdx].toString().replace(/'/g, "");
        if (currentPhone === searchPhone) {
          foundRow = i + 1;
          break;
        }
      }
    }

    // === 既存顧客の更新 ===
    if (foundRow !== -1) {
      const row = values[foundRow - 1];
      const oldName = row[CONFIG.CUSTOMER_COLUMN.NAME - 1];
      const betterName = (newName && newName.length > (oldName || "").length) ? newName : oldName;
      const currentCount = parseInt(row[CONFIG.CUSTOMER_COLUMN.VISIT_COUNT - 1]) || 0;
      const currentTotal = parseInt(row[CONFIG.CUSTOMER_COLUMN.TOTAL_SPEND - 1]) || 0;

      sheet.getRange(foundRow, CONFIG.CUSTOMER_COLUMN.LINE_ID).setValue(lineId || row[CONFIG.CUSTOMER_COLUMN.LINE_ID - 1]);
      sheet.getRange(foundRow, CONFIG.CUSTOMER_COLUMN.NAME).setValue(betterName);
      sheet.getRange(foundRow, CONFIG.CUSTOMER_COLUMN.LAST_VISIT).setValue(now);
      sheet.getRange(foundRow, CONFIG.CUSTOMER_COLUMN.VISIT_COUNT).setValue(currentCount + 1);
      sheet.getRange(foundRow, CONFIG.CUSTOMER_COLUMN.TOTAL_SPEND).setValue(currentTotal + (formData.totalPrice || 0));

      return true;
    }

    // === 新規顧客の追加 ===
    const newRow = [];
    newRow[CONFIG.CUSTOMER_COLUMN.LINE_ID - 1] = lineId;
    newRow[CONFIG.CUSTOMER_COLUMN.NAME - 1] = newName;
    newRow[CONFIG.CUSTOMER_COLUMN.TEL - 1] = phone ? "'" + phone : "";
    newRow[CONFIG.CUSTOMER_COLUMN.FIRST_VISIT - 1] = now;
    newRow[CONFIG.CUSTOMER_COLUMN.LAST_VISIT - 1] = now;
    newRow[CONFIG.CUSTOMER_COLUMN.VISIT_COUNT - 1] = 1;
    newRow[CONFIG.CUSTOMER_COLUMN.TOTAL_SPEND - 1] = formData.totalPrice || 0;
    newRow[CONFIG.CUSTOMER_COLUMN.NOTE_COOK - 1] = "";
    newRow[CONFIG.CUSTOMER_COLUMN.NOTE_OFFICE - 1] = "";
    newRow[CONFIG.CUSTOMER_COLUMN.HISTORY_1 - 1] = "";
    newRow[CONFIG.CUSTOMER_COLUMN.HISTORY_2 - 1] = "";
    newRow[CONFIG.CUSTOMER_COLUMN.HISTORY_3 - 1] = "";

    sheet.appendRow(newRow);
    return false;
  },

  /**
   * サイドバー検索（氏名・電話番号での検索）
   */
  searchCustomers: function(query) {
    if (!query) return [];
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET.CUSTOMER_LIST);
    const data = sheet.getDataRange().getValues();
    const results = [];
    const nameIdx = CONFIG.CUSTOMER_COLUMN.NAME - 1;
    const telIdx = CONFIG.CUSTOMER_COLUMN.TEL - 1;

    for (let i = 1; i < data.length; i++) {
      const name = String(data[i][nameIdx] || "");
      const tel = String(data[i][telIdx] || "");
      if (name.includes(query) || tel.includes(query)) {
        results.push({ name: name, tel: tel, row: i + 1 });
      }
    }
    return results;
  },

  /**
   * 選択された行の顧客情報を取得
   */
  getCustomerByRow: function(row) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET.CUSTOMER_LIST);
    const data = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
    return {
      row: row,
      name: data[CONFIG.CUSTOMER_COLUMN.NAME - 1],
      noteKitchen: data[CONFIG.CUSTOMER_COLUMN.NOTE_COOK - 1],
      noteOffice: data[CONFIG.CUSTOMER_COLUMN.NOTE_OFFICE - 1]
    };
  },

  /**
   * 備考の保存
   */
  saveCustomerNote: function(row, note, type) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET.CUSTOMER_LIST);
    const col = (type === 'kitchen') ? CONFIG.CUSTOMER_COLUMN.NOTE_COOK : CONFIG.CUSTOMER_COLUMN.NOTE_OFFICE;
    sheet.getRange(row, col).setValue(note);
    return "保存しました";
  }
}; // ← 最後にセミコロン付きの閉じカッコが必要