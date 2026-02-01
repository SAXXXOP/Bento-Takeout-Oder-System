const LineService = (() => {

  function notifyReservation(r) {
    const token = PropertiesService
      .getScriptProperties()
      .getProperty("LINE_TOKEN");
    if (!r.userId || !token) return;

    const title = r.isChange
      ? "【予約内容の変更を承りました】"
      : "【ご予約ありがとうございました】";

    const text = [
      title,
      `■予約No：${r.reservationNo}`,
      `■受取：${r.pickupDate} ${r.pickupTime}`,
      `■お名前：${r.userName} 様`,
      `■合計：${r.totalItems}点 / ${r.totalPrice}円`
    ].join("\n");

    UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
      method: "post",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      payload: JSON.stringify({
        to: r.userId,
        messages: [{ type: "text", text }]
      })
    });
  }

  return { notifyReservation };

})();
