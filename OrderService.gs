const OrderService = {
  saveOrder(reservationNo, formData, isChange) {
    // シート名をConfigから取得
    const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEET.ORDER_LIST);
    if (!sheet) return;

    let oldNo = formData.oldReservationNo || "";

    // 変更の場合は、先に古い予約を探して更新する
    if (isChange && oldNo) {
      this.updateOldReservation(sheet, oldNo);
    }

    const groupText = Object.entries(formData.groupSummary || {})
      .map(([g, c]) => `${g}:${c}`).join("\n");

    const rowData = [
      new Date(),                  // A: タイムスタンプ
      "'" + reservationNo,         // B: 予約番号
      formData.phoneNumber,        // C: 電話番号
      formData.userName,           // D: 名前
      formData.pickupDate,         // E: 受取希望日
      formData.note,               // F: リクエスト
      formData.orderDetails,       // G: 商品詳細
      formData.totalItems,         // H: 総数
      formData.totalPrice,         // I: 合計金額
      formData.userId,             // J: LINE_ID
      groupText,                   // K: グループ集計
      formData.isRegular ? "常連" : "通常", // L: 常連フラグ
      isChange ? CONFIG.STATUS.CHANGE_AFTER : CONFIG.STATUS.NORMAL, // M: ステータス
      oldNo ? "'" + oldNo : ""     // N: 元予約No
    ];
    sheet.appendRow(rowData);
  },

  /**
   * 旧予約を探して「変更前」に更新し、行を灰色にする
   */
  updateOldReservation(sheet, oldNo) {
    const targetNo = oldNo.toString().replace(/'/g, "").trim();
    if (!targetNo) return;

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    // B列(予約番号)をスキャン
    const data = sheet.getRange(1, 2, lastRow, 1).getValues(); 
    
    for (let i = 1; i < data.length; i++) {
      const currentNo = data[i][0].toString().replace(/'/g, "").trim();
      
      if (currentNo === targetNo) {
        const rowNum = i + 1;
        // M列（13列目）を「変更前」に更新
        sheet.getRange(rowNum, 13).setValue(CONFIG.STATUS.CHANGE_BEFORE);
        // A列からN列までを灰色にする
        sheet.getRange(rowNum, 1, 1, 14).setBackground("#E0E0E0");
        
        break; // ✅ これでループを抜けます
      }
    }
  }
};