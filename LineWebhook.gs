/**
 * 【注意：LINE Flex Message】
 * - replyToken は 1イベントにつき1回のみ使用可能
 * - テキスト＋Flex を返す場合は replyMulti でまとめて送信すること
 * - carousel.contents は最大10件現状5件で運用中（超えると400エラー）
 */

function doPost(e) {
  try {

        logToSheet("INFO", "doPost called", {  //確認用
      hasE: !!e,
      hasPostData: !!(e && e.postData),
      hasContents: !!(e && e.postData && e.postData.contents)
    });  // ここまで

    // 確認用 ★ ここに入れる（returnより前）
    console.log("doPost called");
    console.log("has e:", !!e);
    console.log("has postData:", !!(e && e.postData));
    console.log("has contents:", !!(e && e.postData && e.postData.contents));

    if (!e || !e.postData || !e.postData.contents) return;

    const data = JSON.parse(e.postData.contents);
    const event = data.events && data.events[0];
    if (!event) return;

    logToSheet("INFO", "event received", {  // 確認用
      type: event.type,
      userId: event.source && event.source.userId,
      text: event.message && event.message.text,
      postback: event.postback && event.postback.data
    });  // ここまで

    const replyToken = event.replyToken;
    const userId = event.source && event.source.userId;

    // 確認用 --- Debug log (必要なら残してOK) ---
    Logger.log("event.type=" + event.type);
    Logger.log("userId=" + userId);
    Logger.log("text=" + (event.message && event.message.text));
    Logger.log("postback.data=" + (event.postback && event.postback.data));

    /* =========================
       postback（Flexボタン）
       ========================= */
    if (event.type === "postback") {
  const postData = (event.postback && event.postback.data) || "";

  // （任意）noop は無視
  if (postData === "noop") return;

  // ① ページング
  if (postData.startsWith("change_page:")) {
    const page = Number(postData.split(":")[1] || "0");
    const list = getChangeableReservations(userId);

    const PAGE_SIZE = 5;
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    const safePage = Math.max(0, Math.min(page, totalPages - 1));

    const flex = buildReservationCarouselPaged(list, safePage, PAGE_SIZE);
    replyFlex(replyToken, flex);
    return;
  }

  // ② 詳細
  if (postData.startsWith("show_details_no:")) {
    const orderNo = postData.split(":")[1] || "";
    const target = findReservationForUser(userId, orderNo);
    if (!target) {
      replyText(replyToken, "対象が見つかりませんでした（期限切れ/変更済の可能性）。もう一度「予約を変更する」からお願いします。");
      return;
    }

    const detailMsg =
      `【ご注文詳細】\n予約番号: ${target.no}\n------------------\n${target.itemsFull || target.itemsShort || ""}`;
    replyText(replyToken, detailMsg);
    return;
  }

  // ③ 変更フォームへ
  if (postData.startsWith("change_confirm_no:")) {
    const orderNo = postData.split(":")[1] || "";
    const target = findReservationForUser(userId, orderNo);
    if (!target) {
      replyText(replyToken, "対象が見つかりませんでした（期限切れ/変更済の可能性）。もう一度「予約を変更する」からお願いします。");
      return;
    }

    const formUrl = buildPrefilledFormUrl(CONFIG.LINE.FORM.FORM_URL, userId, target.no);
    const confirmFlex = buildConfirmFlex(target.no, target.itemsShort, formUrl);

    replyFlex(replyToken, confirmFlex);
    return;
  }

  // 未対応は何も返さない（誤反応防止）
  return;
}

    /* =========================
       text message
       ========================= */
    if (event.type === "message" && event.message && event.message.type === "text") {
      const text = (event.message.text || "").trim();

      console.log("text received:", "[" + text + "]"); // 確認用

      if (text === "予約を変更する") {

      console.log("ENTER change flow");

      const list = getChangeableReservations(userId);

      // ★ 追加：取得件数をログシートへ
      logToSheet("INFO", "changeable reservations fetched", {
        userId: userId,
        total: list.length
      });

      if (!list.length) {
        replyText(replyToken, "変更可能な予約がありません。");
        return;
      }

      const page = 0;       // 初期ページ
      const pageSize = 5;  // 1ページ表示数
      const totalPages = Math.max(1, Math.ceil(list.length / pageSize));

      // ★ 追加：ページング計算ログ
      logToSheet("INFO", "paging info", {
        page,
        pageSize,
        totalPages
      });

      // propsを使うならここ（将来消す予定でもOK）
      props.setProperty(`CHANGE_LIST_${userId}`, JSON.stringify(list));

      const flex = buildReservationCarouselPaged(list, page, pageSize);

      replyFlex(replyToken, flex);
      return;
}

      // それ以外
      replyText(replyToken, `受信内容：【${text}】`);
      return;
    }

  } catch (err) {
  logToSheet("ERROR", "doPost error", {
    message: String(err),
    stack: err && err.stack
  });
}
}

/* =========================
   Flex Builders
   ========================= */

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
        { type: "text", text: String(r.no || ""), size: "lg", weight: "bold", color: "#FFFFFF" }
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
            { type: "text", text: String(r.date || ""), size: "sm", wrap: true, flex: 4 }
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
            { type: "text", text: `${r.total || 0} 点`, size: "lg", weight: "bold", color: "#222222", flex: 0 }
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
          height: "sm",
          action: {
            type: "postback",
            label: "この予約を変更する",
            data: `change_confirm_no:${r.no}`
          }
        },
        {
          type: "button",
          style: "secondary",
          height: "sm",
          action: {
            type: "postback",
            label: "詳細を確認",
            data: `show_details_no:${r.no}`
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

/* =========================
   ★ 追加：ページング付きカルーセル
   ========================= */

function buildReservationCarouselPaged(list, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const start = page * pageSize;
  const slice = list.slice(start, start + pageSize);

  const bubbles = slice.map(r => buildReservationBubble(r));

  // ナビバブル（必要なときだけ）
  if (totalPages > 1) {
    bubbles.push(buildPagerBubble(page, totalPages));
  }

  return {
    type: "flex",
    altText: `変更する予約を選んでください（${start + 1}〜${Math.min(start + pageSize, list.length)} / ${list.length}）`,
    contents: { type: "carousel", contents: bubbles }
  };
}

function buildPagerBubble(page, totalPages) {
  const hasPrev = page > 0;
  const hasNext = page < totalPages - 1;

  const buttons = [];
  if (hasPrev) {
    buttons.push({
      type: "button",
      style: "secondary",
      height: "sm",
      action: { type: "postback", label: "前へ", data: `change_page:${page - 1}` }
    });
  }
  if (hasNext) {
    buttons.push({
      type: "button",
      style: "primary",
      height: "sm",
      action: { type: "postback", label: "次へ", data: `change_page:${page + 1}` }
    });
  }

  return {
    type: "bubble",
    size: "kilo",
    body: {
      type: "box",
      layout: "vertical",
      spacing: "md",
      contents: [
        { type: "text", text: "さらに表示", weight: "bold", size: "md" },
        { type: "text", text: `表示：${page + 1}/${totalPages}ページ`, size: "sm", color: "#666666" }
      ]
    },
    footer: {
      type: "box",
      layout: "vertical",
      spacing: "sm",
      contents: buttons.length
        ? buttons
        : [{ type: "text", text: "（これ以上ありません）", size: "xs", color: "#999999" }]
    }
  };
}

/* =========================
   既存：確認画面Flex
   ========================= */

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
              { type: "text", text: `内容:\n${itemsText || ""}`, size: "xs", color: "#666666", wrap: true }
            ]
          },
          {
            type: "text",
            text:
              "※新しい内容で「再予約」をお願いします。\n送信後、古い予約（上記No）は当店にて取消処理を行いますのでご安心ください。",
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

/* =========================
   Utility & LINE Reply
   ========================= */

function buildPrefilledFormUrl(baseUrl, lineId, oldNo) {
  const entryLineId = CONFIG.LINE.ENTRY_LINE_ID;
  const entryOldNo = CONFIG.LINE.ENTRY_OLD_NO;

  const sep = baseUrl.indexOf("?") >= 0 ? "&" : "?";
  return (
    `${baseUrl}${sep}` +
    `${entryLineId}=${encodeURIComponent(lineId)}` +
    `&${entryOldNo}=${encodeURIComponent(oldNo)}`
  );
}

function replyText(token, text) {
  replyTexts(token, [text]);
}

function replyTexts(token, texts) {
  const url = "https://api.line.me/v2/bot/message/reply";
  const accessToken = PropertiesService.getScriptProperties().getProperty("LINE_TOKEN");

  const payload = {
    replyToken: token,
    messages: texts.map(t => ({ type: "text", text: String(t) }))
  };

  const res = UrlFetchApp.fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  logToSheet("INFO", "replyTexts result", {
    status: res.getResponseCode(),
    body: res.getContentText()
  });
}

function replyFlex(token, flexMsg) {
  const url = "https://api.line.me/v2/bot/message/reply";
  const accessToken = PropertiesService.getScriptProperties().getProperty("LINE_TOKEN");

  const payload = {
    replyToken: token,
    messages: [flexMsg]
  };

  const res = UrlFetchApp.fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  logToSheet("INFO", "replyFlex result", {
    status: res.getResponseCode(),
    body: res.getContentText()
  });
}

/**
 * 複数メッセージを1回の reply で送信する
 * （replyTokenは1回しか使えないため必須）
 */
function replyMulti(token, messages) {
  const url = "https://api.line.me/v2/bot/message/reply";
  const accessToken = PropertiesService.getScriptProperties().getProperty("LINE_TOKEN");

  const payload = {
    replyToken: token,
    messages: messages
  };

  const res = UrlFetchApp.fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  // ログシートにも残す
  logToSheet("INFO", "replyMulti result", {
    status: res.getResponseCode(),
    body: res.getContentText()
  });
}

/* =========================
   Data: get changeable reservations
   ========================= */

// ★追加：予約番号から“いま変更可能な予約”を特定する（props不要）
function findReservationForUser(userId, orderNo) {
  const list = getChangeableReservations(userId);
  return list.find(x => String(x.no) === String(orderNo)) || null;
}

function getChangeableReservations(userId) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEET.ORDER_LIST);
  if (!sheet) return [];

  const data = sheet.getDataRange().getValues();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const idx = (colNo) => colNo - 1;

  const COL_NO = idx(CONFIG.COLUMN.ORDER_NO);
  const COL_PICKUP_DATE = idx(CONFIG.COLUMN.PICKUP_DATE);          // E（表示用）
  const COL_PICKUP_DATE_RAW = idx(CONFIG.COLUMN.PICKUP_DATE_RAW);  // O（Date型）
  const COL_DETAILS = idx(CONFIG.COLUMN.DETAILS);
  const COL_TOTAL_COUNT = idx(CONFIG.COLUMN.TOTAL_COUNT);
  const COL_LINE_ID = idx(CONFIG.COLUMN.LINE_ID);
  const COL_STATUS = idx(CONFIG.COLUMN.STATUS);

  const list = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    // userId一致
    if (String(row[COL_LINE_ID] || "") !== String(userId || "")) continue;

    // ステータス除外
    const status = String(row[COL_STATUS] || "");
    if (["変更済", "キャンセル", CONFIG.STATUS.CHANGE_BEFORE].includes(status)) continue;

    // 日付（RAW）
    const pickupDateRaw = row[COL_PICKUP_DATE_RAW];
    if (!(pickupDateRaw instanceof Date)) continue;

    const rawDateOnly = new Date(pickupDateRaw);
    rawDateOnly.setHours(0, 0, 0, 0);
    if (rawDateOnly < today) continue;

    // 表示用文字列（E）
    const pickupDateStr = row[COL_PICKUP_DATE];

    // 時刻キー（Eから抽出：6:30~7:30 → 390）
    const pickupTimeKey = extractStartTime(pickupDateStr);

    // 商品文字列
    const rawItems = String(row[COL_DETAILS] || "");
    const firstLine = rawItems.split("\n").find(l => l.trim()) || "";
    const itemsShort = rawItems.length > 60 ? `${firstLine} 他` : rawItems;

    list.push({
      no: String(row[COL_NO] || "").replace(/'/g, ""),
      date: String(pickupDateStr || ""),
      // ★ソート用（内部）
      pickupDateRaw: rawDateOnly,
      pickupTimeKey: pickupTimeKey,

      itemsShort: itemsShort,
      itemsFull: rawItems,
      total: row[COL_TOTAL_COUNT] || 0
    });
  }

  // ★並び替え：日付 → 時刻 → 予約番号
  list.sort((a, b) => {
    const d = a.pickupDateRaw - b.pickupDateRaw;
    if (d !== 0) return d;

    const t = a.pickupTimeKey - b.pickupTimeKey;
    if (t !== 0) return t;

    return a.no.localeCompare(b.no);
  });

  // ★内部キーは返却前に削除
  list.forEach(x => {
    delete x.pickupDateRaw;
    delete x.pickupTimeKey;
  });

  return list;
}

/**
 * "M/D" 形式や Date っぽい文字列から Date を作る（年は今年基準、年跨ぎも軽くケア）
 */
function parsePickupDate(value) {
  if (!value) return null;

  // Date型が来たらそのまま
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    const d = new Date(value);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  const str = String(value);
  const match = str.match(/(\d{1,2})\/(\d{1,2})/);
  if (!match) return null;

  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);

  const now = new Date();
  const year = now.getFullYear();

  const result = new Date(year, month - 1, day);
  result.setHours(0, 0, 0, 0);

  // 年末に 1月予約が来たら翌年扱い
  if (now.getMonth() === 11 && month === 1) result.setFullYear(year + 1);

  return result;
}

function logToSheet(level, message, extra) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("ログ") || ss.insertSheet("ログ");

    // ヘッダーが無ければ作る
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["timestamp", "level", "message", "extra"]);
    }

    const ts = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");
    const extraStr = (extra === undefined || extra === null)
      ? ""
      : (typeof extra === "string" ? extra : JSON.stringify(extra));

    sheet.appendRow([ts, level, String(message || ""), extraStr]);
  } catch (e) {
    // ログに失敗しても doPost を止めない
  }
}

function extractStartTime(pickupDateStr) {
  if (!pickupDateStr) return 24 * 60;

  const str = String(pickupDateStr);
  const m = str.match(/(\d{1,2}):(\d{2})\s*~/);
  if (!m) return 24 * 60;

  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  return h * 60 + min;
}