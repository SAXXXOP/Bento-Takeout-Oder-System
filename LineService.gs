// LineService.gs
const LineService = (() => {
  function sendReservationMessage(reservationNo, formData, meta) {
    if (!formData || !formData.userId) return { ok: false, reason: "missing_userId" };

    const normalized = normalizeMeta(meta);

    const title = normalized.isChange
      ? "【予約変更を承りました】"
      : "【ご予約ありがとうございます】";

    let text = "";
    try {
      text = buildMessage(title, reservationNo, formData, normalized);
    } catch (e) {
      return { ok: false, reason: "build_error", error: String(e) };
    }

    return pushText(formData.userId, text);
  }

  function normalizeMeta(meta) {
    if (meta && typeof meta === "object") {
      const oldNo = meta.oldNo ? String(meta.oldNo) : "";
      return {
        isChange: !!meta.isChange,
        // oldNo があれば「変更希望あり」とみなす（フラグ漏れ対策）
        changeRequested: !!meta.changeRequested || !!oldNo,
        oldNo,
        changeFailReason: String(meta.changeFailReason || "")
      };
    }
    // 互換：boolean の場合
    return { isChange: !!meta, changeRequested: false, oldNo: "", changeFailReason: "" };
  }

  function buildMessage(title, reservationNo, d, meta) {
    let headerNote = "";
    if (meta && meta.isChange) {
      headerNote = "\n※新しい内容で再予約を承りました。以前のご予約は当店にて取消処理を行います。\n";
    } else if (meta && meta.changeRequested) {
      const r = meta.changeFailReason || "元予約の確認ができませんでした";
      headerNote =
        `\n※予約変更の希望がありましたが、${r}ため、新規予約として受け付けました。\n` +
        "※元のご予約の取消が必要な場合は店舗へご連絡ください。\n";
    }


    const totalPrice = Number(d.totalPrice || 0);
    const totalPriceStr = isFinite(totalPrice) ? totalPrice.toLocaleString() : "0";

    const pickupInfo = String(d.pickupDate || ""); // 例: "2/14(土) / 8:30~9:30"
    const tel = String(d.phoneNumber || "").replace(/^'/, ""); // シート用の先頭'を除去

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
    const token = PropertiesService.getScriptProperties().getProperty(CONFIG.PROPS.LINE_TOKEN);
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