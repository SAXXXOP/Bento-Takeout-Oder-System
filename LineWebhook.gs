function doPost(e) {
  try {
    if (!e || !e.postData) return;
    const data = JSON.parse(e.postData.contents);
    const event = data.events && data.events[0];
    if (!event) return;

    const replyToken = event.replyToken;
    const userId = event.source.userId;
    const props = PropertiesService.getUserProperties();

    if (event.type === "postback") {
      const postData = event.postback.data || "";

      // ▼ 詳細を確認
      if (postData.startsWith("show_details:")) {
        const index = Number(postData.split(":")[1]);
        const listJson = props.getProperty(`CHANGE_LIST_${userId}`);
        if (!listJson) {
          replyText(replyToken, "データが見つかりませんでした。");
          return;
        }
        const list = JSON.parse(listJson);
        const target = list[index];
        if (target) {
          const detailMsg = `【ご注文詳細】\n予約番号: ${target.no}\n------------------\n${target.itemsShort}`;
          replyText(replyToken, detailMsg);
        }
        return;
      }

      // ▼ この予約を変更する
      if (postData.startsWith("change_confirm:")) {
        const index = Number(postData.split(":")[1]);
        const listJson = props.getProperty(`CHANGE_LIST_${userId}`);
        if (!listJson) {
          replyText(replyToken, "期限切れです。もう一度「予約を変更する」からお願いします。");
          return;
        }

        const list = JSON.parse(listJson);
        const target = list[index];
        if (!target) {
          replyText(replyToken, "対象が見つかりませんでした。");
          return;
        }

        const formUrl = buildPrefilledFormUrl(CONFIG.LINE.FORM.FORM_URL, userId, target.no);
        const confirmFlex = buildConfirmFlex(target.no, target.itemsShort, formUrl);

        props.setProperty(`CHANGE_TARGET_${userId}`, JSON.stringify(target));
        props.deleteProperty(`CHANGE_LIST_${userId}`);
        replyFlex(replyToken, confirmFlex);
        return;
      }
      return;
    }

    if (event.type === "message" && event.message.type === "text") {
      const text = event.message.text.trim();
      if (text === "予約を変更する") {
        const list = getChangeableReservations(userId);
        if (!list.length) {
          replyText(replyToken, "変更可能な予約がありません。");
          return;
        }
        props.setProperty(`CHANGE_LIST_${userId}`, JSON.stringify(list));
        const flex = buildReservationCarousel(list);
        replyFlex(replyToken, flex);
        return;
      }

      replyText(replyToken, `受信内容：【${text}】`);
    }
  } catch (err) {
    Logger.log("doPostエラー: " + err);
  }
}

/* ========== Flex Builders ========== */
function buildReservationBubble(r, index) {
  return {
    type: "bubble",
    size: "kilo",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: "#2E7D32",
      paddingAll: "12px",
      contents: [
        { type: "text", text: "予約番号", size: "xs", color: "#FFFFFFCC" },
        { type: "text", text: r.no, size: "lg", weight: "bold", color: "#FFFFFF" }
      ]
    },
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        {
          type: "box",
          layout: "baseline",
          contents: [
            { type: "text", text: "受取", size: "sm", color: "#888888", flex: 1 },
            { type: "text", text: r.date, size: "sm", wrap: true, flex: 4 }
          ]
        },
        { type: "separator" },
        {
          type: "box",
          layout: "baseline",
          margin: "md",
          spacing: "md",
          justifyContent: "center",
          contents: [
            { type: "text", text: "ご注文合計", size: "sm", color: "#666666", flex: 0 },
            { type: "text", text: `${r.total} 点`, size: "lg", weight: "bold", color: "#222222", flex: 0 }
          ]
        }
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#1DB446",
          height: "sm",
          action: {
            type: "postback",
            label: "この予約を変更する",
            data: `change_confirm:${index}`
          }
        },
        {
          type: "button",
          style: "secondary",
          height: "sm",
          action: {
            type: "postback",
            label: "詳細を確認",
            data: `show_details:${index}`
          }
        }
      ]
    }
  };
}

function buildReservationCarousel(list) {
  return {
    type: "flex",
    altText: "変更する予約を選んでください",
    contents: {
      type: "carousel",
      contents: list.map((r, i) => buildReservationBubble(r, i))
    }
  };
}

function buildConfirmFlex(orderNo, itemsText, formUrl) {
  return {
    type: "flex",
    altText: "変更フォームを開く",
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          { type: "text", text: "予約変更の準備完了", weight: "bold", size: "md", color: "#2E7D32" },
          {
            type: "box",
            layout: "vertical",
            backgroundColor: "#F0F0F0",
            paddingAll: "10px",
            cornerRadius: "md",
            contents: [
              { type: "text", text: `対象No: ${orderNo}`, size: "sm", weight: "bold" },
              { type: "text", text: `内容:\n${itemsText}`, size: "xs", color: "#666666", wrap: true }
            ]
          },
          {
            type: "text",
            text: "※新しい内容で「再予約」をお願いします。\n送信後、古い予約（上記No）は当店にて取消処理を行いますのでご安心ください。",
            size: "xs",
            color: "#CC0000",
            wrap: true
          }
        ]
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            color: "#1DB446",
            height: "sm",
            action: {
              type: "uri",
              label: "予約フォームを開く",
              uri: formUrl
            }
          }
        ]
      }
    }
  };
}

/* ========== Utility & Data ========== */
function buildPrefilledFormUrl(baseUrl, lineId, oldNo) {
  const entryLineId = CONFIG.LINE.ENTRY_LINE_ID;
  const entryOldNo  = CONFIG.LINE.ENTRY_OLD_NO;
  return `${baseUrl}?${entryLineId}=${encodeURIComponent(lineId)}&${entryOldNo}=${encodeURIComponent(oldNo)}`;
}

function replyText(token, text) {
  replyTexts(token, [text]);
}

function replyTexts(token, texts) {
  const url = "https://api.line.me/v2/bot/message/reply";
  const accessToken = PropertiesService.getScriptProperties().getProperty("LINE_TOKEN");
  UrlFetchApp.fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    },
    payload: JSON.stringify({
      replyToken: token,
      messages: texts.map(t => ({ type: "text", text: t }))
    }),
    muteHttpExceptions: true
  });
}

function replyFlex(token, flexMsg) {
  const url = "https://api.line.me/v2/bot/message/reply";
  const accessToken = PropertiesService.getScriptProperties().getProperty("LINE_TOKEN");
  UrlFetchApp.fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    },
    payload: JSON.stringify({
      replyToken: token,
      messages: [flexMsg]
    }),
    muteHttpExceptions: true
  });
}

function getChangeableReservations(userId) {
  const sheet = SpreadsheetApp.getActive().getSheetByName("注文一覧");
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let list = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row[9] !== userId) continue;
    const status = row[12];
    if (["変更済", "キャンセル", "変更前"].includes(status)) continue;

    const pickupDateStr = row[4]?.toString();
    const pickupDate = parsePickupDate(pickupDateStr);
    if (!pickupDate || pickupDate < today) continue;

    const rawItems = String(row[6] || "");
    const firstLine = rawItems.split("\n").find(l => l.trim()) || "";
    const itemsShort = rawItems.length > 60 ? `${firstLine} 他` : rawItems;

    list.push({
      no: row[1]?.toString().replace("'", ""),
      date: pickupDateStr,
      itemsShort,
      total: row[7]
    });
  }
  return list;
}

function parsePickupDate(str) {
  if (!str) return null;
  const match = str.toString().match(/(\d{1,2})\/(\d{1,2})/);
  if (!match) return null;
  const month = parseInt(match[1], 10), day = parseInt(match[2], 10);
  const now = new Date(), year = now.getFullYear();
  const result = new Date(year, month - 1, day);
  if (now.getMonth() === 11 && month === 1) result.setFullYear(year + 1);
  return result;
}