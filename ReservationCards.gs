/**
 * 予約札（ReservationCards.gs）完成版
 *
 * 仕様：
 * - 文字色は黒のみ（塗りつぶし無し）
 * - 予約札の配置：
 *   1) 予約No
 *   2) （要確認なら）要確認（元No:xxx） ※予約番号の下に1行
 *   3) 名前
 *   4) 電話（ないときは空欄）
 *   5) 商品（明細行）
 *   6) 計:◯点/ ◯円
 *   7) 備考（顧客名簿H/I → 【注】として表示：あれば）
 *   8) フォーム備考（注文一覧F → 【要】として表示：あれば）
 *   9) 前回利用日（なければ行削除）
 *
 * - 46行の中に収める（MAX_PAGE_ROWS=46）
 * - 46行目は空白行を入れて区切る（PAGE_GAP_ROWS=1）
 * - 46行から次の「46行枠」を同じロジックで繰り返す
 * - Bin Packing（高さ大きい順→各列の最小高さへ配置）
 */

function updateReservationCards() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const src = ss.getSheetByName(CONFIG.SHEET.ORDER_LIST);
  const master = ss.getSheetByName(CONFIG.SHEET.MENU_MASTER);
  const customerSheet = ss.getSheetByName(CONFIG.SHEET.CUSTOMER_LIST);
  const cardSheet = ss.getSheetByName(CONFIG.SHEET.RESERVATION_CARD);

  if (!src || !cardSheet) return;

  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt("予約札作成", "日付（例: 2/14）", ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;

  const target = String(res.getResponseText() || "").replace(/[^0-9]/g, "");
  if (!target) {
    ui.alert("日付が読み取れませんでした（例: 2/14）。");
    return;
  }

  const data = src.getDataRange().getValues();
  if (data.length < 2) {
    ui.alert("注文一覧にデータがありません。");
    return;
  }

  const menuShortMap = buildMenuShortMap_(master);
  const customerMap = buildCustomerMap_(customerSheet);

  const NEEDS_CHECK = resolveNeedsCheckStatus_();

  // --- 対象行 → カード化 ---
  const cardsToPrint = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    const status = String(row[CONFIG.COLUMN.STATUS - 1] || "");

    // 印字対象：通常 / 変更後 / 要確認（※要確認は文字列 or CONFIG.STATUS.NEEDS_CHECK）
    const isPrintable =
      status === CONFIG.STATUS.NORMAL ||
      status === CONFIG.STATUS.CHANGE_AFTER ||
      status === NEEDS_CHECK;

    if (!isPrintable) continue;

    const pickupDateDigits = String(row[CONFIG.COLUMN.PICKUP_DATE - 1] || "").replace(/[^0-9]/g, "");
    if (!pickupDateDigits || !pickupDateDigits.includes(target)) continue;

    const lineId = row[CONFIG.COLUMN.LINE_ID - 1];
    const customer = customerMap[String(lineId || "")] || {
      noteKitchen: "",
      noteOffice: "",
      lastVisitLabel: ""
    };

    const items = parseOrderItemsForCard_(row[CONFIG.COLUMN.DETAILS - 1], menuShortMap);

    const formNote = String(row[CONFIG.COLUMN.NOTE - 1] || "").trim();
    const customerNote = buildCustomerNoteText_(customer);

    const srcNo = String(row[CONFIG.COLUMN.SOURCE_NO - 1] || "").replace(/'/g, "").trim();
    const needsCheckText =
      (status === NEEDS_CHECK)
        ? (srcNo ? `要確認（元No:${srcNo}）` : "要確認")
        : "";

    // --- 高さ見積（1セル=1行として計算） ---
    // No, Name, Tel, Items..., Total, Notes..., LastVisit
    let neededRows = 0;

    neededRows += 1; // 予約No
    if (needsCheckText) neededRows += 1; // 要確認
    neededRows += 1; // 名前
    neededRows += 1; // 電話（空欄でも行は確保：仕様の並びを固定）
    neededRows += Math.max(1, items.length); // 商品（最低1行確保）
    neededRows += 1; // 合計

    const customerNoteLines = splitToChunks_(customerNote, 20).length;
    const formNoteLines = splitToChunks_(formNote ? "【要】" + formNote : "", 20).length;
    neededRows += customerNoteLines;
    neededRows += formNoteLines;

    if (customer.lastVisitLabel) neededRows += 1; // 前回利用日

    // 余白（カード間の1行スペース）は配置側で +1 するので、ここでは含めない
    cardsToPrint.push({
      rowData: row,
      items,
      customer,
      needsCheckText,
      customerNote,
      formNote,
      height: neededRows
    });
  }

  if (cardsToPrint.length === 0) {
    ui.alert("該当データがありませんでした。");
    return;
  }

  // --- Bin Packing（高さ大きい順） ---
  cardsToPrint.sort((a, b) => b.height - a.height);

  // --- シート初期化（塗りつぶし無し運用なので clearFormats もOK） ---
  cardSheet.clear({ contentsOnly: true });
  cardSheet.clearFormats();

  // レイアウト定数
  const MAX_PAGE_ROWS = 46;
  const PAGE_GAP_ROWS = 1; // 47行目を空白にする
  const PAGE_STEP = MAX_PAGE_ROWS + PAGE_GAP_ROWS;

  const colWidths = [230, 230, 230];
  for (let c = 1; c <= 3; c++) cardSheet.setColumnWidth(c, colWidths[c - 1]);

  // 各列の「今のページ内の積み上げ高さ」
  let columnHeights = [1, 1, 1];   // 1始まり
  let pageOffset = 0;             // 0, 46, 92, ...

  cardsToPrint.forEach((card) => {
    // 念のためガード（card が undefined で落ちる事故を防ぐ）
    if (!card || !card.rowData) return;

    // 現ページに置ける列を探す（最小高さの列へ）
    let targetColIndex = -1;
    let minHeight = 999999;

    for (let i = 0; i < 3; i++) {
      if (columnHeights[i] + card.height <= MAX_PAGE_ROWS) {
        if (columnHeights[i] < minHeight) {
          minHeight = columnHeights[i];
          targetColIndex = i;
        }
      }
    }

    // どの列にも入らない → 次ページへ（3列同時にページ送り）
    if (targetColIndex === -1) {
      pageOffset += PAGE_STEP;      // 46行ぶん進める（46行＋空白1行）
      columnHeights = [1, 1, 1];    // リセット
      targetColIndex = 0;           // 新ページの先頭列から
    }

    const startRow = pageOffset + columnHeights[targetColIndex];

    ensureSheetRows_(cardSheet, startRow + card.height + 2); // 少し余裕
    drawDynamicCard(cardSheet, startRow, targetColIndex + 1, card);

    // カードの次は「1行空白」を必ず挟む（見やすさ）
    columnHeights[targetColIndex] += (card.height + 1);
  });

  // 行高は固定（必要なら調整）
  cardSheet.setRowHeights(1, cardSheet.getMaxRows(), 17);

  cardSheet.activate();
}

/**
 * カード描画（黒文字のみ・塗りつぶし無し）
 */
function drawDynamicCard(sheet, startRow, col, card) {
  if (!card || !card.rowData) return;

  const rowData = card.rowData;
  const items = card.items || [];
  const customer = card.customer || {};
  const height = card.height || 1;

  const orderNo = String(rowData[CONFIG.COLUMN.ORDER_NO - 1] || "").replace(/'/g, "").trim();
  const isRegular = String(rowData[CONFIG.COLUMN.REGULAR_FLG - 1] || "") === "常連";
  const name = (isRegular ? "★ " : "") + String(rowData[CONFIG.COLUMN.NAME - 1] || "不明") + " 様";

  const telRaw = String(rowData[CONFIG.COLUMN.TEL - 1] || "").replace(/'/g, "").trim();
  const telLine = telRaw ? ("TEL: " + telRaw) : ""; // 電話が無いときは空欄

  const totalCount = Number(rowData[CONFIG.COLUMN.TOTAL_COUNT - 1] || 0);
  const totalPrice = Number(rowData[CONFIG.COLUMN.TOTAL_PRICE - 1] || 0);
  const totalStr = `計:${totalCount}点/ ${totalPrice.toLocaleString()}円`;

  const needsCheckText = String(card.needsCheckText || "").trim();

  const customerNote = String(card.customerNote || "").trim();
  const formNote = String(card.formNote || "").trim();
  const formNoteText = formNote ? "【要】" + formNote : "";

  const lastVisitLabel = customer.lastVisitLabel ? String(customer.lastVisitLabel) : "";

  let r = startRow;

  // 外枠（塗りつぶし無し・黒罫線）
  sheet.getRange(startRow, col, height, 1)
    .setBorder(true, true, true, true, null, null, "#000000", SpreadsheetApp.BorderStyle.SOLID);

  // 1) 予約番号
  setCellText_(sheet, r++, col, "No: " + orderNo, { bold: true, size: 10 });

  // 2) 要確認（予約番号の下に1行）
  if (needsCheckText) {
    setCellText_(sheet, r++, col, needsCheckText, { bold: true, size: 10 });
  }

  // 3) 名前
  setCellText_(sheet, r++, col, name, { bold: true, size: 11 });

  // 4) 電話（無いときは空欄）
  setCellText_(sheet, r++, col, telLine, { bold: false, size: 10 });

  // 5) 商品
  if (items.length === 0) {
    setCellText_(sheet, r++, col, "", { size: 10 });
  } else {
    items.forEach(it => {
      setCellText_(sheet, r++, col, it.text || "", { size: 10 });
    });
  }

  // 6) 合計
  setCellText_(sheet, r++, col, totalStr, { bold: true, size: 9 });

  // 7) 顧客備考（H/I → 【注】）
  if (customerNote) {
    splitToChunks_(customerNote, 20).forEach(chunk => {
      setCellText_(sheet, r++, col, chunk, { bold: true, size: 9, wrap: true });
    });
  }

  // 8) フォーム備考（F → 【要】）
  if (formNoteText) {
    splitToChunks_(formNoteText, 20).forEach(chunk => {
      setCellText_(sheet, r++, col, chunk, { bold: true, size: 8, wrap: true });
    });
  }

  // 9) 前回利用日
  if (lastVisitLabel) {
    setCellText_(sheet, r++, col, lastVisitLabel, { size: 8 });
  }

  // 念のため、余った枠は空に（罫線は残る）
  while (r < startRow + height) {
    setCellText_(sheet, r++, col, "", { size: 8 });
  }
}

/* =========================
   Helper: build maps
   ========================= */

function buildCustomerMap_(customerSheet) {
  const map = {};
  if (!customerSheet) return map;

  const values = customerSheet.getDataRange().getValues();
  if (values.length < 2) return map;

  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    const lineId = String(r[CONFIG.CUSTOMER_COLUMN.LINE_ID - 1] || "").trim();
    if (!lineId) continue;

    const noteKitchen = String(r[CONFIG.CUSTOMER_COLUMN.NOTE_COOK - 1] || "").trim();   // H
    const noteOffice = String(r[CONFIG.CUSTOMER_COLUMN.NOTE_OFFICE - 1] || "").trim(); // I

    const lastVisit = r[CONFIG.CUSTOMER_COLUMN.LAST_VISIT - 1];
    const lastVisitLabel = formatLastVisitLabel_(lastVisit);

    map[lineId] = { noteKitchen, noteOffice, lastVisitLabel };
  }
  return map;
}

function buildMenuShortMap_(menuSheet) {
  const map = {};
  if (!menuSheet) return map;

  const values = menuSheet.getDataRange().getValues();
  if (values.length < 2) return map;

  // 1行目ヘッダー想定
  for (let i = 1; i < values.length; i++) {
    const r = values[i];

    const parent = String(r[CONFIG.MENU_COLUMN.MENU_NAME - 1] || "").trim();
    const child = String(r[CONFIG.MENU_COLUMN.SUB_MENU - 1] || "").trim();
    const short = String(r[CONFIG.MENU_COLUMN.SHORT_NAME - 1] || "").trim();

    // 登録（複数キーでヒットしやすくする）
    // 表示は short 優先、なければ child、なければ parent
    const disp = short || child || parent;
    if (!disp) continue;

    addMenuKey_(map, parent, disp);
    addMenuKey_(map, child, disp);
    addMenuKey_(map, short, disp);

    // 価格付きなどの揺れ対策（「xxx 500円」→「xxx」）
    addMenuKey_(map, stripPrice_(parent), disp);
    addMenuKey_(map, stripPrice_(child), disp);
    addMenuKey_(map, stripPrice_(short), disp);
  }
  return map;
}

function addMenuKey_(map, key, disp) {
  const k = String(key || "").trim();
  if (!k) return;
  if (!map[k]) map[k] = disp;
}

/* =========================
   Helper: parse items
   ========================= */

function parseOrderItemsForCard_(itemsText, menuShortMap) {
  const items = [];
  const text = String(itemsText || "").trim();
  if (!text) return items;

  text.split("\n").forEach(line => {
    const m = String(line || "").match(/(.+?)\s*x\s*(\d+)/);
    if (!m) return;

    const rawName = m[1].replace(/^[・\s└]+/, "").trim();
    const cleanName = stripPrice_(rawName);
    const count = Number(m[2] || 0);

    const short = resolveShortName_(cleanName, rawName, menuShortMap);

    items.push({ text: `${short} x${count}` });
  });

  return items;
}

function resolveShortName_(cleanName, rawName, menuShortMap) {
  if (menuShortMap[cleanName]) return menuShortMap[cleanName];
  if (menuShortMap[rawName]) return menuShortMap[rawName];

  // 部分一致で救済（ただし最初に見つかったもの）
  const keys = Object.keys(menuShortMap);
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    if (k && cleanName.includes(k)) return menuShortMap[k];
  }
  return cleanName || rawName || "";
}

function stripPrice_(s) {
  return String(s || "")
    .replace(/[¥￥]?\s*\d+\s*円?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================
   Helper: notes / formatting
   ========================= */

function buildCustomerNoteText_(customer) {
  const nk = String(customer.noteKitchen || "").trim();
  const no = String(customer.noteOffice || "").trim();

  const parts = [];
  if (nk) parts.push(nk);
  if (no) parts.push(no);

  if (parts.length === 0) return "";
  return "【注】" + parts.join(" / ");
}

function formatLastVisitLabel_(value) {
  if (!value) return "";

  // Date のとき
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return "前回: " + Utilities.formatDate(value, "Asia/Tokyo", "yyyy/M/d");
  }

  // 文字列のとき
  const s = String(value).trim();
  if (!s) return "";
  return "前回: " + s;
}

function splitToChunks_(text, chunkSize) {
  const s = String(text || "");
  if (!s) return [];
  const size = Math.max(1, Number(chunkSize || 20));
  const out = [];
  for (let i = 0; i < s.length; i += size) out.push(s.substring(i, i + size));
  return out;
}

function setCellText_(sheet, row, col, text, opt) {
  const o = opt || {};
  const range = sheet.getRange(row, col);

  range.setValue(String(text || ""));

  // 黒のみ（保険で明示）
  range.setFontColor("#000000");

  range.setFontSize(o.size || 10);
  range.setFontWeight(o.bold ? "bold" : "normal");

  if (o.wrap) range.setWrap(true);
  else range.setWrap(false);

  // 塗りつぶしはしない（clearFormats 後なので基本白）
}

function ensureSheetRows_(sheet, requiredLastRow) {
  const need = Number(requiredLastRow || 0);
  if (need <= 0) return;

  const max = sheet.getMaxRows();
  if (max < need) {
    sheet.insertRowsAfter(max, need - max);
  }
}

/**
 * CONFIG.STATUS.NEEDS_CHECK が無い時でも動くように吸収
 */
function resolveNeedsCheckStatus_() {
  try {
    if (CONFIG && CONFIG.STATUS && CONFIG.STATUS.NEEDS_CHECK) return CONFIG.STATUS.NEEDS_CHECK;
  } catch (e) {}
  // 互換：文字列運用
  return "要確認";
}