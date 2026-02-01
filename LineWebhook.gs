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
      const postData = event.postback.data || "";

      // ▼ 予約選択（修正版：ボタン付きFlexメッセージで返信）
      if (postData.startsWith("change:")) {
        const index = Number(postData.split(":")[1]);
        const listJson = props.getProperty(`CHANGE_LIST_${userId}`);

        if (!listJson) {
          replyText(replyToken, "予約情報が見つかりません。最初からやり直してください。");
          return;
        }

        const list = JSON.parse(listJson);
        const target = list[index];

        if (!target) {
          replyText(replyToken, "選択された予約が見つかりません。");
          return;
        }

        // --- フォームのEntry ID ---
        const ENTRY_LINE_ID = "entry.593652011"; 
        const ENTRY_NO      = "entry.1781944258"; 

        // URLを組み立て
        const baseUrl = "https://docs.google.com/forms/d/e/1FAIpQLSc-WHjrgsi9nl8N_NcJaqvRWIX-TJHrWQICc6-i08NfxYRflQ/viewform";
        const formUrl = `${baseUrl}?${ENTRY_LINE_ID}=${userId}&${ENTRY_NO}=${encodeURIComponent(target.no)}`;

        // ★ 方法2：ボタン型のFlexメッセージを作成
        const confirmFlex = {
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
                    { type: "text", text: `対象No: ${target.no}`, size: "sm", weight: "bold" },
                    { type: "text", text: `内容: ${target.items}`, size: "xs", color: "#666666", wrap: true }
                  ]
                },
                { type: "text", text: "下のボタンから新しい予約内容を入力してください。以前の情報は自動入力されています。", size: "xs", color: "#888888", wrap: true }
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
                    label: "変更フォームを開く",
                    uri: formUrl // 長いURLはここに隠れる
                  }
                }
              ]
            }
          }
        };

        // 変更対象を保存
        props.setProperty(`CHANGE_TARGET_${userId}`, JSON.stringify(target));

        // 返信（Flexメッセージを送信）
        replyFlex(replyToken, confirmFlex);
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

// 1予約 = 1バブル
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
        {
          type: "text",
          text: "予約番号",
          size: "xs",
          color: "#FFFFFFCC"
        },
        {
          type: "text",
          text: r.no,
          size: "lg",
          weight: "bold",
          color: "#FFFFFF"
        }
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
            {
              type: "text",
              text: "受取",
              size: "sm",
              color: "#888888",
              flex: 1
            },
            {
              type: "text",
              text: r.date,
              size: "sm",
              wrap: true,
              flex: 4
            }
          ]
        },
        {
          type: "separator"
        },
        {
          type: "text",
          text: "ご注文内容",
          size: "sm",
          color: "#888888"
        },
        {
          type: "text",
          text: r.items,
          size: "sm",
          wrap: true
        },
        {
          type: "box",
          layout: "baseline",
          margin: "md",
          contents: [
            {
              type: "text",
              text: "点数",
              size: "sm",
              color: "#888888",
              flex: 1
            },
            {
              type: "text",
              text: `${r.total} 点`,
              size: "md",
              weight: "bold",
              color: "#D32F2F",
              flex: 4
            }
          ]
        }
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: [
        {
          type: "button",
          style: "primary",
          color: "#1DB446",
          action: {
            type: "postback",
            label: "この予約を変更",
            data: `change:${index}`
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
  const token = PropertiesService.getScriptProperties().getProperty("LINE_TOKEN");

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
    payload: JSON.stringify(payload)
  });
}

function replyFlex(replyToken, flexMessage) {
  const url = "https://api.line.me/v2/bot/message/reply";
  const token = PropertiesService.getScriptProperties().getProperty("LINE_TOKEN");

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
    payload: JSON.stringify(payload)
  });
}


/* ==================================================
   データ取得
   ================================================== */

function getChangeableReservations(userId) {
  if (!userId) return [];
  const sheet = SpreadsheetApp.getActive().getSheetByName("注文一覧");
  const data = sheet.getDataRange().getValues();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const list = [];
  console.log("検索開始: " + userId); // デバッグログ

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const lineId = row[9]?.toString().trim();
    if (lineId !== userId) continue;

    const statusText = row[12]?.toString().trim();
    // 「変更前」などのステータスで除外されていないか確認
    if (statusText === "変更済" || statusText === "キャンセル" || statusText === "変更前") continue;

    const pickupDateStr = row[4]?.toString();
    const pickupDate = parsePickupDate(pickupDateStr);
    
    console.log(`行${i+1}: 注文No${row[1]} 日付解析結果: ${pickupDate}`); // デバッグログ

    if (!pickupDate || pickupDate < today) continue;

    list.push({
      no: row[1]?.toString().replace("'", ""),
      date: pickupDateStr,
      items: row[6],
      total: row[7],
      tel: row[2]?.toString().replace("'", ""),
      userName: row[3]
    });
  }
  console.log("見つかった件数: " + list.length);
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