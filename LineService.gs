const LineService = (() => {
  // Config.gsで設定したトークンを使用
  const getBtnToken = () => CONFIG.LINE.CHANNEL_ACCESS_TOKEN;

  function sendReservationMessage(reservationNo, formData, isChange) {
    const token = getBtnToken();
    if (!token || !formData?.userId) {
      console.error("LINE送信不可: トークンまたはユーザーIDがありません");
      return;
    }

    const title = isChange ? "【予約変更を承りました】" : "【ご予約ありがとうございます】";
    const text = buildMessage(title, reservationNo, formData);
    push(token, formData.userId, text);
  }

  /**
   * メッセージ本文生成
   */
  function buildMessage(title, reservationNo, d) {

    const tel = d.phoneNumber ? d.phoneNumber.replace(/^'/, "") : "なし";
    
    // 【修正ポイント】d.pickupTime は FormService で定義されていないため、
    // すでに日付と時間が結合されている d.pickupDate のみを使用します。
    const pickupInfo = d.pickupDate || "未設定";

    // 予約変更（isChangeが真）の場合に補足メッセージを作成
    const changeNote = title.includes("変更") 
      ? "\n※新しい内容で再予約を承りました。以前のご予約（変更前No）は当店にて取り消し処理を行いますのでご安心ください。\n"
      : "";

    return [
      "━━━━━━━━━━━━━",
      title,
      "━━━━━━━━━━━━━",
      `■予約No：${reservationNo}`,
      `■受取り：${pickupInfo}`, // undefinedを削除
      `■お名前：${d.userName} 様`,
      `■お電話：${tel}`,
      changeNote, // 変更時の案内をここに差し込む
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