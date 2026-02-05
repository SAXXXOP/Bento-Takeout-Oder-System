/**
 * 【注意：LINE Flex Message】
 * - replyToken は 1イベントにつき1回のみ使用可能
 * - テキスト＋Flex を返す場合は replyMulti でまとめて送信すること
 * - carousel.contents は最大10件現状5件で運用中（超えると400エラー）
 */

function doPost(e) {
  let replyToken = null;
  let hasReplied = false;

  function replyTextOnce(token, text) {
    if (!token || hasReplied) return;
    hasReplied = true;
    replyText(token, text);
  }

  function replyFlexOnce(token, flexMsg) {
    if (!token || hasReplied) return;
    hasReplied = true;
    replyFlex(token, flexMsg);
  }

  function replyMultiOnce(token, messages) {
    if (!token || hasReplied) return;
    hasReplied = true;
    replyMulti(token, messages);
  }

  try {
    logToSheet("INFO", "doPost called", {
      hasE: !!e,
      hasPostData: !!(e && e.postData),
      hasContents: !!(e && e.postData && e.postData.contents)
    });

    if (!e || !e.postData || !e.postData.contents) return;

    const data = JSON.parse(e.postData.contents);
    const event = data.events && data.events[0];
    if (!event) return;

    replyToken = event.replyToken;
    const userId = event.source && event.source.userId;

    logToSheet("INFO", "event received", {
      type: event.type,
      userId: userId,
      text: event.message && event.message.text,
      postback: event.postback && event.postback.data
    });

    /* postback（Flexボタン） */
    if (event.type === "postback") {
      const postData = (event.postback && event.postback.data) || "";

      if (postData === "noop") {
        replyTextOnce(replyToken, "この操作はできません。");
        return;
      }

      if (postData.startsWith("change_page:")) {
        const page = Number(postData.split(":")[1] || "0");
        const list = getChangeableReservations(userId);

        const PAGE_SIZE = 5;
        const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
        const safePage = Math.max(0, Math.min(page, totalPages - 1));

        const flex = buildReservationCarouselPaged(list, safePage, PAGE_SIZE);
        replyFlexOnce(replyToken, flex);
        return;
      }

      if (postData.startsWith("change_confirm_no:")) {
        const orderNo = postData.split(":")[1] || "";
        const target = findReservationForUser(userId, orderNo, { forceFresh: true });

        if (!target) {
          replyTextOnce(replyToken, "対象が見つかりませんでした（期限切れ/変更済の可能性）。もう一度「予約を変更する」からお願いします。");
          return;
        }

        const formUrl = buildPrefilledFormUrl(CONFIG.LINE.FORM.FORM_URL, userId, target.no);
        const confirmFlex = buildConfirmFlex(target.no, target.itemsFull, formUrl);

        replyFlexOnce(replyToken, confirmFlex);
        return;
      }

      // 未対応のpostbackも無反応にしない
      replyTextOnce(replyToken, "操作が期限切れか未対応です。もう一度「予約を変更する」からお願いします。");
      return;
    }

    /* text message */
    if (event.type === "message" && event.message && event.message.type === "text") {
      const text = (event.message.text || "").trim();

      if (text === "予約を変更する") {
        const list = getChangeableReservations(userId);

        logToSheet("INFO", "changeable reservations fetched", {
          userId: userId,
          total: list.length
        });

        if (!list.length) {
          replyTextOnce(replyToken, "変更可能な予約がありません（変更は前日20時まで）。必要な場合は店舗へご連絡ください。");
          return;
        }

        const page = 0;
        const pageSize = 5;

        const flex = buildReservationCarouselPaged(list, page, pageSize);
        replyFlexOnce(replyToken, flex);
        return;
      }

      replyTextOnce(replyToken, `受信内容：【${text}】`);
      return;
    }

  } catch (err) {
    logToSheet("ERROR", "doPost error", {
      message: String(err),
      stack: err && err.stack
    });

    // replyTokenが取れていて、まだ返信していなければ返す
    replyTextOnce(replyToken, "エラーが発生しました。お手数ですがもう一度お試しください。");
  }
}

/* =========================
   Flex Builders
   ========================= */

// ★追加：注文概要を「1行」に整形して省略
function formatOrderSummaryOneLine_(r, maxLen) {
  const raw = (r && (r.itemsShort || r.itemsFull)) || "";
  const s = String(raw)
    .replace(/\r?\n/g, " / ")
    .replace(/\s+/g, " ")
    .trim();

  if (!s) return "（内容なし）";

  const limit = maxLen || 34;
  return s.length > limit ? s.slice(0, limit - 1) + "…" : s;
}

// ★追加：内容を「先頭N品 + 他◯点」に整形（1行表示用）
function formatOrderSummaryTopN_(r, maxItems, maxLen) {
  const raw = String((r && r.itemsFull) || (r && r.itemsShort) || "");

  // 改行 or / 区切りを想定して分割（「・」などの先頭記号も除去）
  const parts = raw
    .replace(/\r/g, "")
    .split(/\n|\/|／/)
    .map(s => s.replace(/^[・└\s]+/, "").trim())
    .filter(Boolean);

  if (!parts.length) return "（内容なし）";

  const N = Math.max(1, Number(maxItems || 3));

  // "チョコバナナ x1" / "のり弁×2" をパース
  const parse = (s) => {
    const m = String(s).match(/^(.+?)\s*[x×]\s*(\d+)\s*$/i);
    if (m) return { name: m[1].trim(), qty: parseInt(m[2], 10) || 0 };
    return { name: String(s).trim(), qty: 1 }; // qty不明は1扱い（totalから差し引く用）
  };

  const items = parts.map(parse);

  const shown = items.slice(0, N);
  const shownText = shown.map(it => `${it.name}×${it.qty}`).join(" / ");

  const total = Number((r && r.total) || 0);
  const shownQty = shown.reduce((a, it) => a + (it.qty || 0), 0);

  let otherQty = 0;
  if (total > 0) {
    otherQty = Math.max(0, total - shownQty);
  } else if (items.length > N) {
    // totalが取れないときの保険（本来は total あるのでほぼ通りません）
    otherQty = items.length - N;
  }

  const suffix = otherQty > 0 ? " 他" : "";
  let out = shownText + suffix;

  // 1行に収める（末尾 …）。suffix はなるべく残す
  const LIMIT = Math.max(10, Number(maxLen || 26));
  if (out.length > LIMIT) {
    const keep = suffix ? Math.min(suffix.length, LIMIT - 1) : 0;
    const headLimit = LIMIT - keep - 1; // "…" 分
    const head = shownText.slice(0, Math.max(0, headLimit));
    out = head + "…" + (suffix ? suffix : "");
    // それでも長い場合は最後に単純トリム
    if (out.length > LIMIT) out = out.slice(0, LIMIT - 1) + "…";
  }

  return out;
}


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
    // 受取
    {
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "受取", size: "sm", color: "#888888", flex: 1 },
        { type: "text", text: String(r.date || ""), size: "sm", wrap: true, flex: 4 }
      ]
    },

    // 内容：先頭3品 + 他◯点（1行）
    {
      type: "box",
      layout: "baseline",
      contents: [
        { type: "text", text: "内容", size: "sm", color: "#888888", flex: 1 },
        {
          type: "text",
          text: formatOrderSummaryTopN_(r, 3, 34),
          size: "sm",
          wrap: true,
          maxLines: 2,
          flex: 4
        }
      ]
    },

    { type: "separator" },

    // 合計◯点
    {
      type: "box",
      layout: "baseline",
      margin: "md",
      contents: [
        { type: "text", text: "合計", size: "sm", color: "#666666", flex: 1 },
        { type: "text", text: `${r.total || 0}点`, size: "md", weight: "bold", color: "#222222", flex: 0 }
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
function findReservationForUser(userId, orderNo, options) {
  const list = getChangeableReservations(userId, options);
  return list.find(x => String(x.no) === String(orderNo)) || null;
}

function getChangeableReservations(userId, options) {
  if (!userId) return [];

  const forceFresh = !!(options && options.forceFresh);

  const cache = CacheService.getUserCache();
  const cacheKey = `CHANGEABLE_LIST_${userId}`;

  if (!forceFresh) {
    const cached = cache.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) || [];
      } catch (e) {
        // ignore
      }
    }
  }

  const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEET.ORDER_LIST);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // 最終列は「内部用日付列」まで読む（理由列追加で P になる想定）
  const maxColNeeded = CONFIG.COLUMN.PICKUP_DATE_RAW;
  const data = sheet.getRange(1, 1, lastRow, maxColNeeded).getValues();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const idx = (colNo) => colNo - 1;

  const COL_NO = idx(CONFIG.COLUMN.ORDER_NO);
  const COL_PICKUP_DATE = idx(CONFIG.COLUMN.PICKUP_DATE);          // E
  const COL_PICKUP_DATE_RAW = idx(CONFIG.COLUMN.PICKUP_DATE_RAW);  // O
  const COL_DETAILS = idx(CONFIG.COLUMN.DETAILS);
  const COL_TOTAL_COUNT = idx(CONFIG.COLUMN.TOTAL_COUNT);
  const COL_LINE_ID = idx(CONFIG.COLUMN.LINE_ID);
  const COL_STATUS = idx(CONFIG.COLUMN.STATUS);

  const list = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    if (String(row[COL_LINE_ID] || "") !== String(userId || "")) continue;

    const status = String(row[COL_STATUS] || "");

    // B案：候補に出さない（無効・要確認）
    const NG = [
      CONFIG.STATUS.INVALID,
      CONFIG.STATUS.NEEDS_CHECK,

      // 旧データ互換も除外するなら
      CONFIG.STATUS.LEGACY_CHANGE_BEFORE,
      CONFIG.STATUS.LEGACY_CHANGED,
      "変更前", "変更済", "キャンセル"
    ];

    if (NG.includes(status)) continue;

    const pickupDateStrRaw = row[COL_PICKUP_DATE];      // E
    const pickupDateRawCell = row[COL_PICKUP_DATE_RAW]; // O

    let dateOnly = parsePickupDate(pickupDateRawCell);
    if (!dateOnly) dateOnly = parsePickupDate(pickupDateStrRaw);
    if (!dateOnly) continue;
    if (dateOnly < today) continue;

    if (!isWithinChangeDeadline(dateOnly, new Date())) continue;

    let pickupDateStr = String(pickupDateStrRaw || "");
    if (!pickupDateStr) {
      pickupDateStr = Utilities.formatDate(dateOnly, "Asia/Tokyo", "M/d");
    }

    const pickupTimeKey = extractStartTime(pickupDateStr);

    const rawItems = String(row[COL_DETAILS] || "");
    const firstLine = rawItems.split("\n").find(l => l.trim()) || "";
    const itemsShort = rawItems.length > 60 ? `${firstLine} 他` : rawItems;

    list.push({
      no: String(row[COL_NO] || "").replace(/'/g, ""),
      date: pickupDateStr,
      pickupDateRaw: dateOnly,      // ソート用
      pickupTimeKey: pickupTimeKey, // ソート用
      itemsShort: itemsShort,
      itemsFull: rawItems,
      total: row[COL_TOTAL_COUNT] || 0
    });
  }

  list.sort((a, b) => {
    const d = a.pickupDateRaw - b.pickupDateRaw;
    if (d !== 0) return d;

    const t = a.pickupTimeKey - b.pickupTimeKey;
    if (t !== 0) return t;

    return a.no.localeCompare(b.no);
  });

  list.forEach(x => {
    delete x.pickupDateRaw;
    delete x.pickupTimeKey;
  });

  cache.put(cacheKey, JSON.stringify(list), 60);

  return list;
}

function getChangeDeadline(dateOnly) {
  const d = new Date(dateOnly);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - 1);
  d.setHours(20, 0, 0, 0);
  return d;
}

function isWithinChangeDeadline(dateOnly, now) {
  const deadline = getChangeDeadline(dateOnly);
  return now.getTime() <= deadline.getTime();
}

/**
 * "M/D" 形式や Date っぽい文字列から Date を作る（年は今年基準、年跨ぎも軽くケア）
 */
function parsePickupDate(value) {
  if (!value) return null;

  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    const d = new Date(value);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  const str = String(value).trim();

  // YYYY/MM/DD or YYYY-MM-DD
  let m = str.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) {
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const da = parseInt(m[3], 10);
    const d = new Date(y, mo - 1, da);
    d.setHours(0, 0, 0, 0);
    if (!isNaN(d.getTime())) return d;
  }

  // M/D（"2/14(土) 6:30~" 等を救済）
  m = str.match(/(\d{1,2})\/(\d{1,2})/);
  if (m) {
    const month = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);

    const now = new Date();
    const year = now.getFullYear();

    const d = new Date(year, month - 1, day);
    d.setHours(0, 0, 0, 0);

    if (now.getMonth() === 11 && month === 1) d.setFullYear(year + 1);

    if (!isNaN(d.getTime())) return d;
  }

  return null;
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