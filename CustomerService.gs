const CustomerService = {
  /**
   * フォーム送信時に呼ばれる顧客管理ロジック
   */
  checkAndUpdateCustomer(formData) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("顧客名簿");
    if (!sheet) return false;

    const values = sheet.getDataRange().getValues();
    const name = formData.userName; // 氏名(簡易) または 氏名
    const lineId = formData.userId;
    if (!name) return false;

    let isRegular = false;
    let foundRow = -1;

    // B列(index 1)の「氏名」で検索
    for (let i = 1; i < values.length; i++) {
      if (values[i][1] === name) {
        foundRow = i + 1;
        isRegular = true;
        break;
      }
    }

    const now = new Date();
    if (isRegular) {
      // 既存顧客：E列(5)最終、F列(6)回数を更新
      const currentCount = parseInt(values[foundRow - 1][5]) || 0;
      sheet.getRange(foundRow, 5).setValue(now);
      sheet.getRange(foundRow, 6).setValue(currentCount + 1);
      
      // A列(LINE ID)が空なら補完
      if (!values[foundRow - 1][0] && lineId) {
        sheet.getRange(foundRow, 1).setValue(lineId);
      }
    } else {
      // 新規顧客：ID, 氏名, 電話, 初回, 最終, 回数 (A-F列)
      sheet.appendRow([
        lineId,               // A: LINE ID
        name,                 // B: 氏名
        formData.phoneNumber, // C: 電話番号
        now,                  // D: 初回
        now,                  // E: 最終
        1                     // F: 回数
      ]);
    }
    return isRegular;
  },

  /**
   * サイドバー用：氏名(B列)で検索
   */
  getCustomerInfo(name) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("顧客名簿");
    const values = sheet.getDataRange().getValues();
    
    for (let i = 1; i < values.length; i++) {
      if (values[i][1] === name) {
        return {
          lineId: values[i][0],      // A: LINE ID
          name: values[i][1],        // B: 氏名
          tel: values[i][2],         // C: 電話番号
          noteCook: values[i][7],    // H: 備考(調理)
          noteOffice: values[i][8],  // I: 備考(事務)
          row: i + 1
        };
      }
    }
    return null;
  },

  /**
   * サイドバー用：保存
   */
  updateCustomerNotes(rowData) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("顧客名簿");
    sheet.getRange(rowData.row, 8).setValue(rowData.noteCook); // H列
    sheet.getRange(rowData.row, 9).setValue(rowData.noteOffice); // I列
    return "保存しました";
  }
};

// サイドバーとの接続用グローバル関数
function getCustomerInfo(name) { return CustomerService.getCustomerInfo(name); }
function updateCustomerNotes(rowData) { return CustomerService.updateCustomerNotes(rowData); }