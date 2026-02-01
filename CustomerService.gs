const CustomerService = {
  /**
   * フォーム送信時に呼ばれる既存の関数（内容はそのまま）
   */
  checkAndUpdateCustomer(formData) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("顧客名簿");
    if (!sheet) return false;

    const values = sheet.getDataRange().getValues();
    const name = formData.userName;
    const lineId = formData.userId;
    if (!name) return false;

    let isRegular = false;
    let foundRow = -1;

    for (let i = 1; i < values.length; i++) {
      if (values[i][1] === name) { // B列(氏名)で検索
        foundRow = i + 1;
        isRegular = true;
        break;
      }
    }

    const now = new Date();
    if (isRegular) {
      const currentCount = parseInt(values[foundRow - 1][5]) || 0;
      sheet.getRange(foundRow, 5).setValue(now);
      sheet.getRange(foundRow, 6).setValue(currentCount + 1);
      if (!values[foundRow - 1][0] && lineId) {
        sheet.getRange(foundRow, 1).setValue(lineId);
      }
    } else {
      const newRow = [lineId, name, formData.phoneNumber, now, now, 1];
      sheet.appendRow(newRow);
    }
    return isRegular;
  },

  /**
   * 【追加】サイドバーの検索窓から顧客情報を取得する関数
   */
  getCustomerInfo(name) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("顧客名簿");
    const values = sheet.getDataRange().getValues();
    
    // B列(index 1)の「氏名」で検索
    for (let i = 1; i < values.length; i++) {
      if (values[i][1] === name) {
        return {
          lineId: values[i][0],      // A列: LINE ID
          name: values[i][1],        // B列: 氏名
          tel: values[i][2],         // C列: 電話番号
          noteCook: values[i][7],    // H列: 備考(調理)
          noteOffice: values[i][8],  // I列: 備考(事務)
          row: i + 1                 // スプレッドシートの行番号
        };
      }
    }
    return null; // 見つからない場合
  },

  /**
   * 【追加】サイドバーで保存ボタンを押した時に備考を更新する関数
   */
  updateCustomerNotes(rowData) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("顧客名簿");
    const row = rowData.row;
    
    // H列(8列目)に備考(調理)、I列(9列目)に備考(事務)を書き込む
    sheet.getRange(row, 8).setValue(rowData.noteCook);
    sheet.getRange(row, 9).setValue(rowData.noteOffice);
    
    return "備考を保存しました";
  }
};

/**
 * サイドバーのHTMLから直接呼び出すためのグローバル関数
 * (これがないと google.script.run から呼び出せません)
 */
function getCustomerInfo(name) {
  return CustomerService.getCustomerInfo(name);
}

function updateCustomerNotes(rowData) {
  return CustomerService.updateCustomerNotes(rowData);
}