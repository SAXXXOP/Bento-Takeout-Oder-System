/**
 * ================================
 * OrderService.gs
 * 注文一覧シート書き込み
 * ================================
 */
const OrderService = {

  saveOrder(reservationNo, formData, isChange) {
    const ss = SpreadsheetApp.getActive();
    const sheet = ss.getSheetByName("注文一覧");
    if (!sheet) return;

    const groupText = Object.entries(formData.groupSummary || {})
      .map(([g, c]) => `${g}:${c}`)
      .join("\n");

    const changeSourceNo = ReservationService.getChangeSourceNo(formData.userId);

    sheet.appendRow([
      new Date(),                               // A: 登録日時
      "'" + reservationNo,                     // B: 予約No
      formData.phoneNumber,                    // C: 電話
      formData.userName,                       // D: 氏名
      `${formData.pickupDate} / ${formData.pickupTime}`, // E: 受取
      formData.note,                           // F: 要望
      formData.orderDetails,                   // G: 注文内容
      formData.totalItems,                     // H: 点数
      formData.totalPrice,                     // I: 金額
      formData.userId,                         // J: LINE ID
      groupText,                               // K: グループ集計
      formData.isRegular,                      // L: 常連
      isChange ? "変更後" : "通常",             // M: ステータス
      isChange ? changeSourceNo : ""            // N: 変更元No
    ]);
  }
};
