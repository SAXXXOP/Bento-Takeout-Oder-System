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

    // 受取日（E列） "2/14(土) / 6:30~7:30" から "0214" 形式へ
    const pickup = String(row[CONFIG.COLUMN.PICKUP_DATE - 1] || "");
    const m = pickup.match(/(\d{1,2})\/(\d{1,2})/);
    if (!m) continue;

    const mm = String(m[1]).padStart(2, "0");
    const dd = String(m[2]).padStart(2, "0");
    const mmdd = mm + dd;

    if (mmdd !== target) continue;

    const orderNo = String(row[CONFIG.COLUMN.ORDER_NO - 1] || "");
    const name = String(row[CONFIG.COLUMN.NAME - 1] || "");
    const tel = String(row[CONFIG.COLUMN.TEL - 1] || "");
    const details = String(row[CONFIG.COLUMN.DETAILS - 1] || "");
    const totalCount = Number(row[CONFIG.COLUMN.TOTAL_COUNT - 1] || 0);
    const totalPrice = Number(row[CONFIG.COLUMN.TOTAL_PRICE - 1] || 0);
    const lineId = String(row[CONFIG.COLUMN.LINE_ID - 1] || "");
    const sourceNo = String(row[CONFIG.COLUMN.SOURCE_NO - 1] || "");

    const note = String(row[CONFIG.COLUMN.NOTE - 1] || "");

    // 顧客情報（前回利用日、備考）
    const customer = customerMap[lineId] || {};
    const lastVisit = customer.lastVisit || "";
    const specialNote = customer.specialNote || ""; // H/I 統合済

    // 商品行（短縮済みを作る）
    const items = buildItemLines_(details, menuShortMap);

    // 要確認表示
    const needsCheckLine =
      status === NEEDS_CHECK
        ? (sourceNo ? `要確認（元No:${sourceNo}）` : "要確認")
        : "";

    // カードの行配列
    const lines = [];

    // 1) 予約No
    lines.push({ type: "orderNo", text: `予約No: ${orderNo}` });

    // 2) 要確認（該当時のみ）
    if (needsCheckLine) lines.push({ type: "needsCheck", text: needsCheckLine });

    // 3) 名前
    lines.push({ type: "name", text: `名前: ${name}` });

    // 4) 電話（ないときは空欄）
    lines.push({ type: "tel", text: tel ? `電話: ${tel.replace(/^'/, "")}` : "電話:" });

    // 5) 商品
    items.forEach(t => lines.push({ type: "item", text: t }));

    // 6) 計
    lines.push({ type: "total", text: `計: ${totalCount}点 / ${totalPrice}円` });

    // 7) 顧客名簿H/I備考 → 【注】
    if (specialNote) {
      splitLongText_(specialNote, 20).forEach((seg, idx) => {
        lines.push({ type: "special", text: (idx === 0 ? "【注】" : "　　") + seg });
      });
    }

    // 8) フォーム備考 → 【要】
    if (note) {
      splitLongText_(note, 20).forEach((seg, idx) => {
        lines.push({ type: "note", text: (idx === 0 ? "【要】" : "　　") + seg });
      });
    }

    // 9) 前回利用日（無ければ行自体出さない）
    if (lastVisit) {
      lines.push({ type: "lastVisit", text: `前回利用: ${lastVisit}` });
    }

    // カード情報（neededRowsなど）
    const card = {
      orderNo: orderNo,
      rowData: row,
      lines: lines,
      neededRows: lines.length,
      status: status
    };

    cardsToPrint.push(card);
  }

  if (!cardsToPrint.length) {
    ui.alert("指定日に該当する予約がありません。");
    return;
  }

  // --- 既存の予約札シートをクリア ---
  cardSheet.clear();

  // --- 罫線・表示スタイル共通 ---
  cardSheet.setColumnWidths(1, 11, 110);
  cardSheet.setDefaultRowHeight(21);
  cardSheet.getRange(1, 1, cardSheet.getMaxRows(), cardSheet.getMaxColumns())
    .setFontColor("#000000")
    .setBackground(null)
    .setFontSize(11);

  // --- ページング（46行枠） + Bin Packing（3列） ---
  const MAX_PAGE_ROWS = 46;
  const PAGE_GAP_ROWS = 1;

  // カードを高さの大きい順に
  cardsToPrint.sort((a, b) => (b.neededRows || 0) - (a.neededRows || 0));

  // 1ページ = 3列（A-D / E-H / I-K）
  const COLS = [
    { startCol: 1, width: 4 },
    { startCol: 5, width: 4 },
    { startCol: 9, width: 3 }
  ];

  let currentPageTopRow = 1;

  // 残カードがある限りページを作る
  let remaining = cardsToPrint.slice();

  while (remaining.length) {
    // 各列の次の書き込み行（ページ内）
    const colHeights = [0, 0, 0];

    // このページに載ったカード
    const usedIndex = new Set();

    // Bin Packing：残りカードを順に見て、入る列に置く
    for (let idx = 0; idx < remaining.length; idx++) {
      const card = remaining[idx];
      const h = Number(card.neededRows || 0);

      // どの列に置けるか（最小高さの列優先）
      const candidates = [0, 1, 2]
        .filter(c => (colHeights[c] + h) <= MAX_PAGE_ROWS)
        .sort((a, b) => colHeights[a] - colHeights[b]);

      if (!candidates.length) continue;

      const colIndex = candidates[0];
      const colInfo = COLS[colIndex];

      const topRow = currentPageTopRow + colHeights[colIndex];
      const leftCol = colInfo.startCol;

      // 描画（ガード付き）
      drawDynamicCard(cardSheet, topRow, leftCol, colInfo.width, card);

      colHeights[colIndex] += h;
      usedIndex.add(idx);
    }

    // このページで1枚も置けない（カードが大きすぎる等）
    if (!usedIndex.size) {
      // 破綻回避：先頭カードだけ強制配置（はみ出しは許容）
      const card = remaining[0];
      drawDynamicCard(cardSheet, currentPageTopRow, COLS[0].startCol, COLS[0].width, card);
      usedIndex.add(0);
      colHeights[0] += Number(card.neededRows || 0);
    }

    // 使ったカードを除外
    remaining = remaining.filter((_, i) => !usedIndex.has(i));

    // 次ページへ（46行 + 空白1行）
    currentPageTopRow += MAX_PAGE_ROWS + PAGE_GAP_ROWS;
  }

  ui.alert("予約札を作成しました。");
}

/**
 * 動的カード描画（堅牢化版）
 * - card / card.rowData が無い場合は何もしない
 */
function drawDynamicCard(sheet, topRow, leftCol, colWidth, card) {
  // ★ ガード（単体実行や呼び出し不備で落ちない）
  if (!card || !card.rowData) return;

  const lines = Array.isArray(card.lines) ? card.lines : [];
  const neededRows = Number(card.neededRows || lines.length || 0);

  if (!neededRows) return;

  // 描画範囲
  const range = sheet.getRange(topRow, leftCol, neededRows, colWidth);

  // 外枠：太線
  range.setBorder(true, true, true, true, null, null, "#000000", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // 中身を書き込み（左端セルに行ごと）
  for (let r = 0; r < neededRows; r++) {
    const line = lines[r] ? String(lines[r].text || "") : "";
    const cell = sheet.getRange(topRow + r, leftCol, 1, colWidth);

    cell.merge();
    cell.setValue(line);
    cell.setFontColor("#000000");

    // タイプ別装飾（白黒前提）
    const type = lines[r] ? lines[r].type : "";

    if (type === "orderNo") {
      cell.setFontWeight("bold");
      cell.setFontSize(12);
    } else if (type === "needsCheck") {
      cell.setFontWeight("bold");
      cell.setUnderline(true);
    } else if (type === "name") {
      cell.setFontWeight("bold");
    } else if (type === "total") {
      cell.setFontWeight("bold");
      cell.setBorder(null, null, true, null, null, null, "#000000", SpreadsheetApp.BorderStyle.SOLID);
    } else if (type === "special") {
      // 【注】
      cell.setFontSize(10);
    } else if (type === "note") {
      // 【要】
      cell.setFontSize(10);
      cell.setFontWeight("bold");
    } else if (type === "lastVisit") {
      cell.setFontSize(9);
      cell.setFontStyle("italic");
    } else {
      // item / tel など
      cell.setFontSize(10);
    }
  }
}

/**
 * 明細文字列を短縮整形して「表示行」の配列へ
 * - 既存仕様：details は "・xxx x n\n" の積み上げを想定
 */
function buildItemLines_(details, menuShortMap) {
  const raw = String(details || "").split("\n").map(s => s.trim()).filter(Boolean);

  // 例: "・のり弁 x 2" から "のり弁 x2" に整形
  return raw.map(line => {
    const cleaned = line.replace(/^・/, "").trim();
    // もし長すぎる場合は20文字で分割（商品行は優先で分割）
    const parts = splitLongText_(cleaned, 20);
    if (parts.length <= 1) return cleaned;

    // 2行以上になる場合、先頭だけ表示して残りはインデント
    const out = [];
    parts.forEach((p, idx) => out.push(idx === 0 ? p : "　" + p));
    return out.join("\n");
  }).flatMap(x => String(x).split("\n"));
}

/**
 * メニューマスタから「正式名→略称」辞書を作る（現状は使いどころ限定）
 */
function buildMenuShortMap_(masterSheet) {
  const map = {};
  if (!masterSheet) return map;

  const data = masterSheet.getDataRange().getValues();
  if (data.length < 2) return map;

  const NAME_COL = CONFIG.MENU_COLUMN.MENU_NAME - 1;  // C
  const SHORT_COL = CONFIG.MENU_COLUMN.SHORT_NAME - 1; // F

  for (let i = 1; i < data.length; i++) {
    const name = String(data[i][NAME_COL] || "").trim();
    const shortName = String(data[i][SHORT_COL] || "").trim();
    if (name && shortName) map[name] = shortName;
  }

  return map;
}

/**
 * 顧客名簿のマップを作る
 * - LINE_ID をキーに、lastVisit と specialNote(H/I統合) を載せる
 */
function buildCustomerMap_(customerSheet) {
  const map = {};
  if (!customerSheet) return map;

  const data = customerSheet.getDataRange().getValues();
  if (data.length < 2) return map;

  const COL_LINE = CONFIG.CUSTOMER_COLUMN.LINE_ID - 1;       // A
  const COL_LAST = CONFIG.CUSTOMER_COLUMN.LAST_VISIT - 1;     // E
  const COL_NOTE_H = CONFIG.CUSTOMER_COLUMN.NOTE_COOK - 1;    // H
  const COL_NOTE_I = CONFIG.CUSTOMER_COLUMN.NOTE_OFFICE - 1;  // I

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const lineId = String(row[COL_LINE] || "");
    if (!lineId) continue;

    const lastVisitVal = row[COL_LAST];
    const lastVisit =
      lastVisitVal instanceof Date
        ? Utilities.formatDate(lastVisitVal, Session.getScriptTimeZone(), "yyyy/MM/dd")
        : String(lastVisitVal || "");

    // ★ H/I 統合（どちらもあれば改行で連結）
    const noteH = String(row[COL_NOTE_H] || "").trim();
    const noteI = String(row[COL_NOTE_I] || "").trim();
    const specialNote = [noteH, noteI].filter(Boolean).join("\n");

    map[lineId] = {
      lastVisit: lastVisit,
      specialNote: specialNote
    };
  }

  return map;
}

/**
 * 長文を n文字ごとに分割（改行も区切りとして扱う）
 */
function splitLongText_(text, n) {
  const t = String(text || "");
  if (!t) return [];
  const lines = t.split("\n");
  const out = [];

  lines.forEach(line => {
    let s = line;
    while (s.length > n) {
      out.push(s.slice(0, n));
      s = s.slice(n);
    }
    if (s.length) out.push(s);
  });

  return out;
}

/**
 * 互換：CONFIG.STATUS.NEEDS_CHECK が無いプロジェクトでも動くように吸収
 */
function resolveNeedsCheckStatus_() {
  try {
    if (CONFIG && CONFIG.STATUS && CONFIG.STATUS.NEEDS_CHECK) return CONFIG.STATUS.NEEDS_CHECK;
  } catch (e) {}
  // 互換：文字列運用
  return "要確認";
}

/**
 * 互換用：過去のトリガー名 createDailyReservationCards から呼べるようにする
 * 既存実装は updateReservationCards() に集約しているので中継するだけ。
 */
function createDailyReservationCards() {
  return updateReservationCards();
}