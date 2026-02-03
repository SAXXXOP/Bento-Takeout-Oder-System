const LineService = (() => {

  const getBtnToken = () => CONFIG.LINE.LINE_TOKEN;

  function sendReservationMessage(reservationNo, formData, isChange) {
    if (!formData?.userId) {
      console.error("LINE送信不可: userIdなし");
      return;
    }

    const title = isChange
      ? "【予約変更を承りました】"
      : "【ご予約ありがとうございます】";

    const text = buildMessage(title, reservationNo, formData);
    pushText(formData.userId, text);
  }

  function buildMessage(title, reservationNo, d) {
    const tel = d.phoneNumber ? d.phoneNumber.replace(/^'/, "") : "なし";
    const pickupInfo = d.pickupDate || "未設定";

    const changeNote = title.includes("変更")
      ? "\n※新しい内容で再予約を承りました。以前のご予約は当店にて取消処理を行います。\n"
      : "";

    return [
      "━━━━━━━━━━━━━",
      title,
      "━━━━━━━━━━━━━",
      `■予約No：${reservationNo}`,
      `■受取り：${pickupInfo}`,
      `■お名前：${d.userName} 様`,
      `■お電話：${tel}`,
      changeNote,
      "【ご要望】",
      d.note || "なし",
      "【ご注文内容】",
      d.orderDetails,
      ` 合計：${d.totalItems}点 / ${Number(d.totalPrice).toLocaleString()}円`,
      "━━━━━━━━━━━━━"
    ].join("\n");
  }

  function push(userId, text) {
    const res = UrlFetchApp.fetch(url, {
  method: "post",
  headers: {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + token
  },
  payload: JSON.stringify(payload)
});

console.log("ここ通過");
console.log(res.getResponseCode());
console.log(res.getContentText());
  }

  return { sendReservationMessage };
})();