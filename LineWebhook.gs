function doPost(e) {
  try {
    if (!e || !e.postData) return;

    const data = JSON.parse(e.postData.contents);
    const event = data.events && data.events[0];
    if (!event) return;

    const replyToken = event.replyToken;
    const userId = event.source.userId;

    // ★ 一時データは UserProperties（CHANGE_* 用）
    const props = PropertiesService.getUserProperties();

    /* =========================
       postback（Flexボタン）
       ========================= */
    if (event.type === "postback") {
      const postData = event.postback.data || "";

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

  // ★ ここから「最終形 1」
  const baseUrl =
    "https://docs.google.com/forms/d/e/1FAIpQLSc-WHjrgsi9nl8N_NcJaqvRWIX-TJHrWQICc6-i08NfxYRflQ/viewform?usp=header";

  const oldNo = String(target.no || "").replace(/'/g, "");

  const prefilledUrl = buildPrefilledFormUrl(baseUrl, userId, oldNo);

  const confirmFlex = {
    type: "flex",
    altText: "予約変更の準備完了",
    contents: {
      type: "bubble",
      body: {
        type: "box",
        layout: "vertical",
        contents: [{ type: "text", text: "予約変更の準備完了" }]
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            action: { type: "uri", label: "フォーム", uri: prefilledUrl } // ★ここが「最終形 2」
          }
        ]
      }
    }
  };

  // 必要ならここで保存
  props.setProperty(`CHANGE_TARGET_${userId}`, JSON.stringify(target));
  props.deleteProperty(`CHANGE_LIST_${userId}`);

  replyFlex(replyToken, confirmFlex);
  return;
}

      // 他のpostbackは無視
      return;
    }

    /* =========================
       テキストメッセージ
       ========================= */
    if (event.type === "message" && event.message.type === "text") {
      const text = event.message.text.trim();

      if (text === "予約を変更する") {
        const list = getChangeableReservations(userId);

        if (!list.length) {
          replyText(replyToken, "変更可能な予約がありません。");
          return;
        }

        // 一覧を保存（ユーザー単位）
        props.setProperty(`CHANGE_LIST_${userId}`, JSON.stringify(list));

        const flex = buildReservationCarousel(list);
        replyFlex(replyToken, flex);
        return;
      }

      replyText(replyToken, `受信内容：【${text}】`);
      return;
    }

  } catch (err) {
    console.error("doPostエラー: ", err);
  }
}


/* ==================================================
   Flex Message Builders
   ================================================== */

/**
 * 1予約 = 1バブル（カルーセル内）
 */
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
        }
      ]
    }
  };
}

// 複数予約 = カルーセル
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


/* ==================================================
   Reply helpers
   ================================================== */

function replyText(replyToken, text) {
  replyTexts(replyToken, [text]);
}

function replyTexts(replyToken, texts) {
  const url = "https://api.line.me/v2/bot/message/reply";
  const token = CONFIG.LINE.LINE_TOKEN;

  const payload = {
    replyToken,
    messages: texts.map(t => ({ type: "text", text: t }))
  };

  UrlFetchApp.fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

function replyFlex(replyToken, flexMessage) {
  const url = "https://api.line.me/v2/bot/message/reply";
  const token = CONFIG.LINE.LINE_TOKEN;

  const payload = {
    replyToken,
    messages: [flexMessage]
  };

  UrlFetchApp.fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

function pushText(userId, text) {
  const url = "https://api.line.me/v2/bot/message/push";
  const token = CONFIG.LINE.LINE_TOKEN;

  UrlFetchApp.fetch(url, {
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


/* ==================================================
   データ取得
   ================================================== */

function getChangeableReservations(userId) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEET.ORDER_LIST);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let list = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    // 自分の予約だけ
    if (row[CONFIG.COLUMN.LINE_ID - 1] !== userId) continue;

    // ステータスは「通常」だけ
    const status = row[CONFIG.COLUMN.STATUS - 1];
    if (status !== CONFIG.STATUS.NORMAL) continue;
    

    
    // 日付チェック（未来のみ）
    const pickupDateStr = row[CONFIG.COLUMN.PICKUP_DATE - 1];
    const pickupDate = parsePickupDate(pickupDateStr);
    if (!pickupDate || pickupDate < today) continue;

    const orderNo = row[CONFIG.COLUMN.ORDER_NO - 1]?.toString().replace("'", "");

    // ★ここ追加：items を短縮して保存（Properties容量対策）
    const rawItems = String(row[CONFIG.COLUMN.DETAILS - 1] || "");
    const firstLine = rawItems.split("\n").find(l => l.trim()) || "";
    const itemsShort = rawItems.length > 60 ? (firstLine + " 他") : rawItems;

    // ★ここ修正：保存するのは軽い情報だけ
    list.push({
      no: orderNo,
      date: pickupDateStr,
      itemsShort: itemsShort,
      total: row[CONFIG.COLUMN.TOTAL_COUNT - 1]
    });
  }

  return list;
}

//事前入力URLを作る関数
function buildPrefilledFormUrl(baseUrl, lineId, oldNo) {
  const entryLineId = CONFIG.LINE.ENTRY_LINE_ID; // entry.593652011
  const entryOldNo  = CONFIG.LINE.ENTRY_OLD_NO;  // entry.1781944258

  const params = [];
  params.push(`${entryLineId}=${encodeURIComponent(lineId || "")}`);
  params.push(`${entryOldNo}=${encodeURIComponent(oldNo || "")}`);

  const sep = baseUrl.includes("?") ? "&" : "?";
  return baseUrl + sep + params.join("&");
}

/**
 * 受取希望日「1/30(金) / 6:30~7:30」から日付オブジェクトを作成する
 */
function parsePickupDate(dateVal) {
  if (!dateVal) return null;

  const match = dateVal.toString().match(/(\d{1,2})\/(\d{1,2})/);
  if (!match) return null;

  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);

  const now = new Date();
  const year = now.getFullYear();

  let date = new Date(year, month - 1, day);

  if (now.getMonth() === 11 && month === 1) {
    date.setFullYear(year + 1);
  }

  return date;
}