/**
 * ================================
 * CustomerService.gs
 * 顧客名簿管理（A〜L列構成・予約札の読み取りに準拠）
 * ================================
 */
const CustomerService = {

  updateCustomer(formData) {
    const ss = SpreadsheetApp.getActive();
    const sheet = ss.getSheetByName("顧客名簿");
    if (!sheet) return;

    const values = sheet.getDataRange().getValues();
    const userId = formData.userId;
    let rowIndex = -1;

    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === userId) {
        rowIndex = i + 1;
        break;
      }
    }

    const now = new Date();

    if (rowIndex === -1) {
      // 新規登録：予約札が読み取る H列(7)とJ列(9)を空で確保
      sheet.appendRow([
        userId,                // A: LINE ID (r[0])
        formData.userName,     // B: 氏名 (r[1])
        "'" + formData.phoneNumber, // C: 電話 (r[2])
        now,                   // D: 初回利用日 (r[3])
        now,                   // E: 最終利用日 (r[4])
        1,                     // F: 利用回数 (r[5])
        formData.totalPrice,   // G: 累計金額 (r[6])
        "",                    // H: 備考(調理) (r[7]) -> 予約札がここを読み取る
        "",                    // I: 備考(事務) (r[8])
        "",                    // J: 履歴1 (r[9]) -> 予約札がここを読み取る
        "",                    // K: 履歴2 (r[10])
        ""                     // L: 履歴3 (r[11])
      ]);
    } else {
      // 既存更新：列番号(1始まり)で指定
      sheet.getRange(rowIndex, 5).setValue(now); // E列: 最終利用日
      
      const countCell = sheet.getRange(rowIndex, 6); // F列: 利用回数
      const currentCount = Number(countCell.getValue()) || 0;
      countCell.setValue(currentCount + 1);

      const totalCell = sheet.getRange(rowIndex, 7); // G列: 累計金額
      const currentTotal = Number(totalCell.getValue()) || 0;
      totalCell.setValue(currentTotal + formData.totalPrice);

      // 基本情報の上書き
      sheet.getRange(rowIndex, 2).setValue(formData.userName);
      sheet.getRange(rowIndex, 3).setValue("'" + formData.phoneNumber);

      if (currentCount + 1 >= 2) {
        formData.isRegular = true;
      }
    }
  }
};