// LineService.gs
const LineService = (() => {

    function getAutoReplyMap_() {
      const cache = CacheService.getScriptCache();
      const key = "AUTO_REPLY_MAP_V1";
      const cached = cache.get(key);
      if (cached) {
        try { return JSON.parse(cached) || {}; } catch (e) {}
      }

      const map = {};
      const menus = MenuRepository.getMenu();
      menus.forEach(menu => {
        const parent = String(menu.parentName || "").trim();
        if (!parent) return;
        const child = String(menu.childName || "").trim();
        const fullKey = child ? `${parent}(${child})` : parent;

        const auto = String(menu.autoReplyName || "").trim();
        const display = auto || fullKey; // 空欄なら従来のフル表記にフォールバック

        map[fullKey] = display;
        const short = String(menu.shortName || "").trim();
        if (short) map[short] = display;
      });

      cache.put(key, JSON.stringify(map), 300); // 5分キャッシュ
      return map;
    }

    function formatOrderDetailsForCustomer(orderDetails) {
      const s = String(orderDetails || "").replace(/\r\n/g, "\n");
      if (!s.trim()) return "";
      const map = getAutoReplyMap_();

      return s
        .split("\n")
        .filter(l => l.trim() !== "")
        .map(line => {
          // 例）・KARA_S x 2 / ・唐揚げ弁当(小) x 2
          const m = line.match(/^(\s*・\s*)(.+?)(\s*(?:x|×)\s*\d+.*)$/i);
          if (!m) return line;
          const name = m[2].trim();
          const display = map[name] || name;
          return m[1] + display + m[3];
        })
        .join("\n");
    }

  function sendReservationMessage(reservationNo, formData, meta) {
    if (!formData || !formData.userId) return { ok: false, reason: "missing_userId" };

    const normalized = normalizeMeta(meta);

    const title = normalized.lateSubmission
      ? "【受付できませんでした（締切後）】"
      : (normalized.isChange ? "【予約変更を承りました】" : "【ご予約ありがとうございます】");

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
        changeFailReason: String(meta.changeFailReason || ""),
        lateSubmission: !!meta.lateSubmission
      };
    }
    // 互換：boolean の場合
    return { isChange: !!meta, changeRequested: false, oldNo: "", changeFailReason: "", lateSubmission: false };
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
    const nameRaw = String(d.userName || "").trim();
    const nameLine = nameRaw ? `■お名前:${nameRaw} 様` : null;
    // 末尾にまとめて注意書きを出す（締切後は出さない）
    const footerNotes = (meta && meta.lateSubmission) ? [] : [
      "◆受け取り時は予約Noをお伝え下さい。",
      "◆予定時刻より遅れそうでしたらご連絡ください。ご連絡がないまま30分を過ぎるとキャンセル扱いとなる場合があります。",
      "【野菜を肴に 096-360-8083】"
    ];
    return [
      "━━━━━━━━━━━━━",
      title,
      "━━━━━━━━━━━━━",
      "■予約No:" + reservationNo,
      "■受取り:" + pickupInfo,
      nameLine,
      "■お電話:" + tel,
      headerNote,
      "【ご要望】",
      d.note || "なし",
      "【ご注文内容】",
      formatOrderDetailsForCustomer(d.orderDetails),
      " 合計：" + (d.totalItems || 0) + "点 / " + totalPriceStr + "円",
      "━━━━━━━━━━━━━",
      ...footerNotes
    ].filter(v => v !== null && v !== undefined).join("\n");
  }

  function pushText(toUserId, text) {
    const token = ScriptProps.get(ScriptProps.KEYS.LINE_TOKEN);
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

  return {
    sendReservationMessage: sendReservationMessage,
    formatOrderDetailsForCustomer: formatOrderDetailsForCustomer
  };
})();