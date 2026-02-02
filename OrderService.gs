const OrderService = {
  saveOrder(reservationNo, formData, isChange) {
    const sheet = SpreadsheetApp.getActive().getSheetByName("注文一覧");
    if (!sheet) return;

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
      ""                           // N: 変更元No
    ];
    sheet.appendRow(rowData);
  }
};