const OrderService = {
  saveOrder(reservationNo, formData, isChange) {
    const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEET.ORDER_LIST);
    if (!sheet) return;

    let oldNo = formData.oldReservationNo || "";

    // 1. 旧予約の更新（検索と色付け）を先に実行
    if (isChange && oldNo) {
      this.updateOldReservation(sheet, oldNo);
    }

    const groupText = Object.entries(formData.groupSummary || {})
      .map(([g, c]) => `${g}:${c}`).join("\n");

    // 2. 新規行のデータ作成（Configの列番号を使用）
    const rowData = [];
    rowData[CONFIG.COLUMN.TIMESTAMP - 1] = new Date();
    rowData[CONFIG.COLUMN.ORDER_NO - 1] = "'" + reservationNo; // 新規番号にも ' を付ける
    rowData[CONFIG.COLUMN.TEL - 1] = formData.phoneNumber;
    rowData[CONFIG.COLUMN.NAME - 1] = formData.userName;
    // 表示用（既存）
    rowData[CONFIG.COLUMN.PICKUP_DATE - 1] = formData.pickupDate;
    // ★ 内部判定用（Date型）
    rowData[CONFIG.COLUMN.PICKUP_DATE_RAW - 1] = formData.pickupDateRaw;
    rowData[CONFIG.COLUMN.NOTE - 1] = formData.note;
    rowData[CONFIG.COLUMN.DETAILS - 1] = formData.orderDetails;
    rowData[CONFIG.COLUMN.TOTAL_COUNT - 1] = formData.totalItems;
    rowData[CONFIG.COLUMN.TOTAL_PRICE - 1] = formData.totalPrice;
    rowData[CONFIG.COLUMN.LINE_ID - 1] = formData.userId;
    rowData[CONFIG.COLUMN.DAILY_SUMMARY - 1] = ""; 
    rowData[CONFIG.COLUMN.REGULAR_FLG - 1] = formData.isRegular ? "常連" : "通常";
    rowData[CONFIG.COLUMN.STATUS - 1] = isChange ? CONFIG.STATUS.CHANGE_AFTER : CONFIG.STATUS.NORMAL;
    rowData[CONFIG.COLUMN.SOURCE_NO - 1] = oldNo ? "'" + oldNo : ""; // 元予約Noにも ' を付ける

    sheet.appendRow(rowData);
  },

  /**
   * 旧予約を探して「変更前」に更新し、行を灰色にする
   */
  updateOldReservation(sheet, oldNo) {
    // 比較前に、検索キーワードから全ての ' を取り除く
    const targetNo = oldNo.toString().replace(/'/g, "").trim();
    if (!targetNo) return;

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    // B列（予約番号）の範囲を特定して取得
    const range = sheet.getRange(1, CONFIG.COLUMN.ORDER_NO, lastRow, 1);
    const data = range.getValues(); 
    
    for (let i = 0; i < data.length; i++) {
      // シート上のデータからも全ての ' を取り除いて比較
      const currentNo = data[i][0].toString().replace(/'/g, "").trim();
      
      if (currentNo === targetNo) {
        const rowNum = i + 1;
        
        // M列（ステータス）を「変更前」に更新
        sheet.getRange(rowNum, CONFIG.COLUMN.STATUS).setValue(CONFIG.STATUS.CHANGE_BEFORE);
        
        // A列(1)からN列(14)までを灰色(#E0E0E0)にする
        // ※列が増えても大丈夫なように CONFIG.COLUMN.SOURCE_NO を使用
        sheet.getRange(rowNum, 1, 1, CONFIG.COLUMN.SOURCE_NO).setBackground("#E0E0E0");
        
        console.log("マッチしました！行番号: " + rowNum);
        break; // 見つかったらループを抜ける
      }
    }
  }
}


function markReservationAsChanged(orderNo) {
  const sheet = SpreadsheetApp
    .getActive()
    .getSheetByName(CONFIG.SHEET.ORDER_LIST);
  if (!sheet) return;

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const no = data[i][CONFIG.COLUMN.ORDER_NO - 1]
      ?.toString()
      .replace("'", "");

    if (no === orderNo) {
      sheet
        .getRange(i + 1, CONFIG.COLUMN.STATUS)
        .setValue(CONFIG.STATUS.CHANGE_BEFORE);
      return;
    }
  }
};