const OrderService = {
  saveOrder(reservationNo, formData, isChange) {
    const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEET.ORDER_LIST);
    if (!sheet) return;

    let oldNo = String(formData.oldReservationNo || "")
      .replace(/'/g, "")
      .trim();

    // 1. 旧予約の更新（検索と色付け）を先に実行
    if (isChange && oldNo) {
      try {
        this.updateOldReservation(sheet, oldNo);
      } catch (err) {
        console.warn("updateOldReservation failed:", String(err));
      }
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
    
    rowData[CONFIG.COLUMN.STATUS - 1] =
    isChange
      ? CONFIG.STATUS.CHANGE_AFTER
      : (oldNo ? CONFIG.STATUS.NEEDS_CHECK : CONFIG.STATUS.NORMAL);

    rowData[CONFIG.COLUMN.SOURCE_NO - 1] = oldNo ? "'" + oldNo : "";

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
        
        // ★旧予約を無効化（B案運用）
      sheet.getRange(rowNum, CONFIG.COLUMN.STATUS).setValue(CONFIG.STATUS.INVALID);
      sheet.getRange(rowNum, CONFIG.COLUMN.REASON).setValue("予約変更により無効（再予約あり）");

      // 灰色化はそのまま（列が増えたので PICKUP_DATE_RAW まで塗る）
      sheet.getRange(rowNum, 1, 1, CONFIG.COLUMN.PICKUP_DATE_RAW).setBackground("#E0E0E0");
        
        console.log("マッチしました！行番号: " + rowNum);
        break; // 見つかったらループを抜ける
      }
    }
  }
}

function markReservationAsChanged(orderNo) {
  try {
    const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEET.ORDER_LIST);
    if (!sheet) return;

    // 既存呼び出し互換：旧予約更新（ステータス更新＋灰色化）に統一
    OrderService.updateOldReservation(sheet, orderNo);
  } catch (e) {
    console.warn("markReservationAsChanged wrapper failed:", String(e));
  }
}

function setStatusAndReason_(sheet, rowNum, status, reason) {
  sheet.getRange(rowNum, CONFIG.COLUMN.STATUS).setValue(status);
  sheet.getRange(rowNum, CONFIG.COLUMN.REASON).setValue(reason || "");
}