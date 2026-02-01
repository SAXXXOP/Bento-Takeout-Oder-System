/**
 * ================================
 * LineService.gs
 * LINE通知送信
 * ================================
 */
const LineService = {

  /**
   * 予約完了／変更 完了メッセージ送信
   */
  sendReservationMessage(reservationNo, formData, isChange) {
    const token = PropertiesService.getScriptProperties().getProperty("LINE_TOKEN");
    if (!formData.userId || !token) return;

    const titleHeader = isChange
      ? "【予約内容の変更を承りました】"
      : "【ご予約ありがとうございました】";

    LineService._sendText(
      formData.userId,
      token,
      reservationNo,
      formData.pickupDate,
      formData.pickupTime,
      formData.userName,
      formData.phoneNumber,
      formData.note,
      formData.orderDetails,
      formData.totalItems,
      formData.totalPrice,
      titleHeader
    );
  },

  /**
   * 実送信（既存ロジック完全移植）
   */
  _sendText(
    userId,
    token,
    reservationNo,
    pickupDate,
    pickupTime,
    userName,
    phoneNumber,
    note,
    orderDetails,
    totalItems,
    totalPrice,
    titleHeader
  ) {

    const text = [
      "━━━━━━━━━━━━━",
      ` ${titleHeader}`,
      "━━━━━━━━━━━━━",
      `■予約No：${reservationNo}`,
      `■受取り：${pickupDate} ${pickupTime}`,
      `■お名前：${userName} 様`,
      `■お電話：${phoneNumber.replace("'", "")}`,
      "【ご要望】",
      note || "なし",
      "【ご注文内容】",
      orderDetails.trim(),
      ` 合計：${totalItems}点 / ${totalPrice.toLocaleString()}円`,
      "━━━━━━━━━━━━━"
    ].join("\n");

    UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
      method: "post",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      payload: JSON.stringify({
        to: userId,
        messages: [{ type: "text", text }]
      }),
      muteHttpExceptions: true
    });
  }
}
