function doPost(e) {
  try {
    if (!e || !e.postData) return;

    const data = JSON.parse(e.postData.contents);
    const event = data.events && data.events[0];
    if (!event) return;

    const replyToken = event.replyToken;
    const userId = event.source.userId;
    const props = PropertiesService.getUserProperties();

    /* =========================
       postback（Flexボタン）
       ========================= */

    if (event.type === "postback") {
  replyText(replyToken, "postback受信OK");
  return;
}
    // if (event.type === "postback") {
    //pushText(userId, "【春場所テスト】postbackは届いています 🌸");
    //return;
    //}

    if (event.type === "postback") {
      const postData = event.postback.data || "";

      // ▼ 予約変更の最終確認と案内
      if (postData.startsWith("change_confirm:")) {
        const index = Number(postData.split(":")[1]);
        const listJson = props.getProperty(`CHANGE_LIST_${userId}`);
        
        if (!listJson) {
          replyText(replyToken, "データが見つかりませんでした。最初からやり直してください。");
          return;
        }

        const list = JSON.parse(listJson);
        const target = list[index];

        if (target) {
          const confirmFlex = {
            type: "flex",
            altText: "予約変更の準備完了",
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
                      { type: "text", text: `対象No: ${target.no}`, size: "sm", weight: "bold" },
                      { type: "text", text: `内容: ${target.items}`, size: "xs", color: "#666666", wrap: true }
                    ]
                  },
                  {
                    type: "box",
                    layout: "vertical",
                    spacing: "xs",
                    contents: [
                      { type: "text", text: "※新しい内容で「再予約」をお願いします。", size: "xs", color: "#cc0000", weight: "bold", wrap: true },
                      { type: "text", text: "送信後、古い予約（上記No）は当店にて取消処理を行いますのでご安心ください。", size: "xs", color: "#888888", wrap: true }
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
                      type: "uri",
                      label: "予約フォームを開く",
                      uri: target.formUrl // ここでGoogleフォームへ飛ばす
                    }
                  }
                ]
              }
            }
          };

          // 変更対象のデータを一時保持
          props.setProperty(`CHANGE_TARGET_${userId}`, JSON.stringify(target));
          pushFlex(userId, confirmFlex);
        }
        return;
      }
    }

    /* =========================
       テキストメッセージ
       ========================= */
    if (event.type === "message" && event.message.type === "text") {
      const text = event.message.text.trim();

      // ▼ 予約変更スタート
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

      // ▼ その他（デバッグ）
      replyText(replyToken, `受信内容：【${text}】`);
    }

  } catch (err) {
    console.error("doPostエラー: " + err);
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
            data: `change_confirm:${index}` // 案内用のアクションへ
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
  const token = CONFIG.LINE.LINE_TOKEN; // ★ 修正

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
    muteHttpExceptions: true // ← デバッグ用におすすめ
  });
}

function replyFlex(replyToken, flexMessage) {
  const url = "https://api.line.me/v2/bot/message/reply";
  const token = CONFIG.LINE.LINE_TOKEN; // ★ 修正

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

// LineWebhook.gs
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

    // ★ 修正④：ステータス判定を統一
    const status = row[CONFIG.COLUMN.STATUS - 1];
    if (status !== CONFIG.STATUS.NORMAL) continue;

    // 日付チェック（未来のみ）
    const pickupDateStr = row[CONFIG.COLUMN.PICKUP_DATE - 1];
    const pickupDate = parsePickupDate(pickupDateStr);
    if (!pickupDate || pickupDate < today) continue;

    const orderNo = row[CONFIG.COLUMN.ORDER_NO - 1]?.toString().replace("'", "");
    const lineId  = row[CONFIG.COLUMN.LINE_ID - 1];

    list.push({
      no: orderNo,
      date: pickupDateStr,
      items: row[CONFIG.COLUMN.DETAILS - 1],
      total: row[CONFIG.COLUMN.TOTAL_COUNT - 1],
      lineId: lineId,
      tel: row[CONFIG.COLUMN.TEL - 1]?.toString().replace("'", ""),
      userName: row[CONFIG.COLUMN.NAME - 1]
    });
  }

  return list;
}

/**
 * 受取希望日「1/30(金) / 6:30~7:30」から日付オブジェクトを作成する
 */
function parsePickupDate(dateVal) {
  if (!dateVal) return null;
  
  // 文字列から最初の「月/日」の部分を抽出 (例: 1/30)
  const match = dateVal.toString().match(/(\d{1,2})\/(\d{1,2})/);
  if (!match) return null;

  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);
  
  const now = new Date();
  const year = now.getFullYear();
  
  // 12月に1月の予約をした場合などの年越しを考慮
  let date = new Date(year, month - 1, day);
  
  // もし解析した日付が現在より大幅に過去（例：11ヶ月以上前）なら翌年とみなす
  if (now.getMonth() === 11 && month === 1) {
    date.setFullYear(year + 1);
  }

  return date;
}


function testDateParse() {
  const sample = "1/30(金) / 6:30~7:30";
  const result = parsePickupDate(sample);
  Logger.log("解析結果: " + result); 
  // ここで「Invalid Date」や「null」が出るなら parsePickupDate が犯人です
}