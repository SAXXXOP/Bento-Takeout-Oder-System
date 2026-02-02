const LineService = (() => {

  const TOKEN = PropertiesService
    .getScriptProperties()
    .getProperty("LINE_TOKEN");

  /**
   * Main.gs から呼ばれる唯一の入口
   */
  function sendReservationMessage(reservationNo, formData, isChange) {
    if (!formData?.userId || !TOKEN) return;

    const title = isChange
      ? "【予約内容の変更を承りました】"
      : "【ご予約ありがとうございます】";

    const text = buildMessage(
      title,
      reservationNo,
      formData
    );

    push(formData.userId, text);
  }

  /**
   * メッセージ本文生成（Bロジック）
   */
  function buildMessage(title, reservationNo, d) {

  const tel = d.phoneNumber
    ? d.phoneNumber.replace(/^'/, "")
    : "";

  return [
    "━━━━━━━━━━━━━",
    title,
    "━━━━━━━━━━━━━",
    `■予約No：${reservationNo}`,
    `■受取り：${d.pickupDate} ${d.pickupTime}`,
    `■お名前：${d.userName} 様`,
    `■お電話：${tel}`,
    "【ご要望】",
    d.note || "なし",
    "【ご注文内容】",
    d.orderDetails,
    ` 合計：${d.totalItems}点 / ${Number(d.totalPrice).toLocaleString()}円`,
    "━━━━━━━━━━━━━"
  ].join("\n");
}

  /**
   * LINE push（低レイヤ）
   */
  function push(userId, text) {
    UrlFetchApp.fetch(
      "https://api.line.me/v2/bot/message/push",
      {
        method: "post",
        contentType: "application/json",
        headers: {
          Authorization: "Bearer " + TOKEN
        },
        payload: JSON.stringify({
          to: userId,
          messages: [{ type: "text", text }]
        }),
        muteHttpExceptions: true
      }
    );
  }

  return {
    sendReservationMessage
  };

})();