// OrderService.gs

const OrderService = {
  saveOrder(reservationNo, formData, isChange) {
    const sheet = SpreadsheetApp.getActive().getSheetByName("注文一覧");
    if (!sheet) return;

    // --- 旧予約の特定と更新処理 ---
    let oldNo = "";
    if (isChange) {
      // フォームから送信された旧予約番号、または一時保存データから取得
      oldNo = formData.oldReservationNo || ""; 
      if (oldNo) {
        this.updateOldReservation(sheet, oldNo); // 旧予約を灰色＆「変更前」にする
      }
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
      isChange ? "変更後" : "通常",  // M: ステータス
      oldNo                        // N: 変更元No（ここが旧予約番号になります）
    ];
    sheet.appendRow(rowData);
  },

  /**
   * 旧予約を探して「変更前」に更新し、行を灰色にする
   */
  updateOldReservation(sheet, oldNo) {
    const data = sheet.getDataRange().getValues();
    const cleanOldNo = oldNo.toString().replace("'", "");
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][1].toString().replace("'", "") === cleanOldNo) {
        const rowNum = i + 1;
        // M列（13列目）を「変更前」に
        sheet.getRange(rowNum, 13).setValue("変更前");
        // N列（14列目）が空なら、自身の番号を記録して紐付けを明確にしても良い
        // 行を灰色に
        sheet.getRange(rowNum, 1, 1, 14).setBackground("#E0E0E0");
        break;
      }
    }
  }
};