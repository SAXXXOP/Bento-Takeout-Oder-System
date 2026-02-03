// LineService.gs
const LineService = (() => {
  function sendReservationMessage(reservationNo, formData, meta) {
    if (!formData || !formData.userId) return { ok: false, reason: "missing_userId" };

    const normalized = normalizeMeta(meta);

    const title = normalized.isChange
      ? "【予約変更を承りました】"
      : "【ご予約ありがとうございます】";

    const text = buildMessage(title, reservationNo, formData, normalized);

    return pushText(formData.userId, text);
  }

  function normalizeMeta(meta) {
    if (meta && typeof meta === "object") {
      return {
        isChange: !!meta.isChange,
        changeRequested: !!meta.changeRequested,
        oldNo: meta.oldNo ? String(meta.oldNo) : ""
      };
    }
    // 互換：boolean で渡された場合
    return { isChange: !!meta, changeRequested: false, oldNo: "" };
  }

  function buildMessage(title, reservationNo, d, meta) {
    const tel = d.phoneNumber ? String(d.phoneNumber).replace(/^'/, "") : "なし";
    const pickupInfo = d.pickupDate || "未設定";

    let headerNote = "";
    if (meta && meta.isChange) {
      headerNote =
        "\n※新しい内容で再予約を承りました。以前のご予約は当店にて取消処理を行います。\n";
    } else if (meta && meta.changeRequested) {
      // 変更を試みたが isChange にならなかったケース（締切など）
      headerNote =
        "\n※予約変更として受け付けようとしましたが、変更期限（前日20時）を過ぎていたため、新規予約として受け付けました。\n" +
        "※元のご予約の取消が必要な場合は店舗へご連絡ください。\n";
    }

    const totalPrice = Number(d.totalPrice || 0);
    const totalPriceStr = isFinite(totalPrice) ? totalPrice.toLocaleString() : "0";

    return [
      "━━━━━━━━━━━━━",
      title,
      "━━━━━━━━━━━━━",
      "■予約No：" + reservationNo,
      "■受取り：" + pickupInfo,
      "■お名前：" + (d.userName || "") + " 様",
      "■お電話：" + tel,
      headerNote,
      "【ご要望】",
      d.note || "なし",
      "【ご注文内容】",
      d.orderDetails || "",
      " 合計：" + (d.totalItems || 0) + "点 / " + totalPriceStr + "円",
      "━━━━━━━━━━━━━"
    ].join("\n");
  }

  function pushText(toUserId, text) {
    const token = PropertiesService.getScriptProperties().getProperty("LINE_TOKEN");
    if (!token) return { ok: false, reason: "missing_LINE_TOKEN" };

    const url = "https://api.line.me/v2/bot/message/push";
    const payload = {
      to: String(toUserId),
      messages: [{ type: "text", text: String(text) }]
    };

    try {
      const res = UrlFetchApp.fetch(url, {
        method: "post",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      });

      const code = res.getResponseCode();
      const body = res.getContentText();

      if (code >= 200 && code < 300) return { ok: true, code: code };
      return { ok: false, code: code, body: body };
    } catch (e) {
      return { ok: false, reason: "fetch_error", error: String(e) };
    }
  }

  return { sendReservationMessage: sendReservationMessage };
})();