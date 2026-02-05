/**const status = String
 * 当日まとめシート作成
 * 修正点：見出し用ID(10,15,21,46等)の重複排除 / ID順 / ビンパッキング
 */
function createProductionSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const src = ss.getSheetByName(CONFIG.SHEET.ORDER_LIST);
  const master = ss.getSheetByName(CONFIG.SHEET.MENU_MASTER);
  const customerSheet = ss.getSheetByName(CONFIG.SHEET.CUSTOMER_LIST);
  const sheet = ss.getSheetByName(CONFIG.SHEET.DAILY_SUMMARY);
  if (!src || !sheet || !master) return;

  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt("当日まとめ作成", "日付（例: 2/14）", ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;

  const targetInput = String(res.getResponseText() || "").trim();
  const targetMD = parseMonthDay_(targetInput);            // {m,d} or null
  const targetDigits = targetInput.replace(/[^0-9]/g, ""); // フォールバック用
  let matchedDateRaw = null;                               // ★A1表示用に保持


  // --- 1. メニューマスタのインデックス化 ---
  const masterData = master.getDataRange().getValues().slice(1);
  const itemToInfo = {};    
  const displayNameMap = {}; 
  const itemOrder = {}; 

  masterData.forEach((r, index) => {
    const group = r[CONFIG.MENU_COLUMN.GROUP - 1];
    const parent = r[CONFIG.MENU_COLUMN.MENU_NAME - 1]?.toString().trim() || "";
    const child = r[CONFIG.MENU_COLUMN.SUB_MENU - 1]?.toString().trim() || "";
    const short = r[CONFIG.MENU_COLUMN.SHORT_NAME - 1]?.toString().trim() || "";
    
    if (!group) return;

    const info = { group, parent, child, id: index };
    const isHeaderOnly = !child || child === parent; // 見出し行かどうかの判定

    if (child) itemToInfo[child] = info;
    if (short) itemToInfo[short] = info;
    
    // 親メニュー名での登録（見出し行、または小メニューなし注文のヒット用）
    if (parent && (!itemToInfo[parent] || isHeaderOnly)) {
      itemToInfo[parent] = info;
    }
    
    const key = child || parent;
    displayNameMap[key] = short || child || parent;
    if (itemOrder[key] === undefined) itemOrder[key] = index;
  });

  // --- 2. データの集計 ---
  const data = src.getDataRange().getValues();
  const customerMap = {};
  if (customerSheet) {
    customerSheet.getDataRange().getValues().slice(1).forEach(r => {
      const lineId = r[CONFIG.CUSTOMER_COLUMN.LINE_ID - 1];
      const cookNote = r[CONFIG.CUSTOMER_COLUMN.NOTE_COOK - 1];
      if(lineId && cookNote) customerMap[lineId] = cookNote.toString();
    });
  }

  let groupCounts = {};
  let detailTree = {};
  let totalAll = 0;
  let memos = [];

  data.slice(1).forEach(row => {
  const status = String(row[CONFIG.COLUMN.STATUS - 1] || "");
  const isActive = (status === CONFIG.STATUS.ACTIVE); // ACTIVEは空文字
  if (!isActive) return;

    const rawCol = CONFIG.COLUMN.PICKUP_DATE_RAW; // P列(16)想定（無ければ undefined）

  let isTarget = false;

  const pickupDateRaw = rawCol ? row[rawCol - 1] : null;
  const hasValidDate = pickupDateRaw instanceof Date && !isNaN(pickupDateRaw.getTime());

  if (targetMD && hasValidDate) {
    const m = pickupDateRaw.getMonth() + 1;
    const d = pickupDateRaw.getDate();
    isTarget = (m === targetMD.m && d === targetMD.d);

    if (isTarget && !matchedDateRaw) matchedDateRaw = pickupDateRaw; // ★最初の一致を保持
  } else {
    // フォールバック：従来通り E列文字
    const pickupDigits = row[CONFIG.COLUMN.PICKUP_DATE - 1]
      ?.toString()
      .replace(/[^0-9]/g, "");
    if (pickupDigits && targetDigits && pickupDigits.includes(targetDigits)) {
      isTarget = true;
    }
  }

  if (!isTarget) return;


    const lineId = row[CONFIG.COLUMN.LINE_ID - 1];
    if (customerMap[lineId]) {
      memos.push(`No.${row[CONFIG.COLUMN.ORDER_NO - 1].toString().replace("'","")} ${row[CONFIG.COLUMN.NAME - 1]}様: 【注】${customerMap[lineId]}`);
    }

    const itemsText = row[CONFIG.COLUMN.DETAILS - 1] || "";
    itemsText.toString().split("\n").forEach(line => {
      const m = line.match(/(.+?)\s*x\s*(\d+)/);
      if (!m) return;
      
      const rawName = m[1].replace(/^[・\s└]+/, "").trim();
      const cleanName = rawName.replace(/[¥￥]?\d+円?/, "").trim();
      const count = Number(m[2]);

      let info = itemToInfo[cleanName] || itemToInfo[rawName];
      if (!info) {
        const hitKey = Object.keys(itemToInfo).find(key => cleanName.includes(key));
        info = hitKey ? itemToInfo[hitKey] : { group: "その他", parent: "その他", child: cleanName, id: 999 };
      }

      const { group, parent, child } = info;
      
      // 重要：小メニューが空、または親と同じなら「親自身」として集計
      const isRedundant = !child || child === parent || displayNameMap[child] === displayNameMap[parent];
      const childKey = isRedundant ? parent : child;

      if (!detailTree[group]) detailTree[group] = {};
      if (!detailTree[group][parent]) detailTree[group][parent] = {};
      detailTree[group][parent][childKey] = (detailTree[group][parent][childKey] || 0) + count;
      groupCounts[group] = (groupCounts[group] || 0) + count;
      totalAll += count;
    });
  });

  // --- 3. シート初期化 ---
  sheet.clear().clearFormats();
  const displayDate = matchedDateRaw
  ? formatMDFromDate_(matchedDateRaw)
  : (targetMD ? `${targetMD.m}/${targetMD.d}` : targetInput);

  sheet.getRange("A1")
    .setValue(`【 ${displayDate} 当日まとめ 】`)
    .setFontSize(14)
    .setFontWeight("bold");

  sheet.getRange("A2")
    .setValue(`総数: ${totalAll}`)
    .setFontSize(22)
    .setFontWeight("bold")
    .setFontColor("#000000");


  let colRows = [4, 4, 4]; 
  const COL_START = [1, 4, 7];

  // --- 4. 備考エリア ---
  if (memos.length > 0) {
    // ▼ 特別注意 は 1回だけ（A列側）
  // 文字：A4 だけ / 枠：A4:B4
  const memoHeaderRow = Math.min(...colRows); // 通常は 4

  // 枠（A4:B4）
  sheet.getRange(memoHeaderRow, COL_START[0], 1, 2)
    .setBorder(true, true, true, true, false, false, "#000000", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // 文字（A4のみ）
  sheet.getRange(memoHeaderRow, COL_START[0])
    .setFontWeight("bold").setFontSize(11)
    .setValue("▼ 特別注意");

  // 3列すべて、本文開始行を1行下げる
  colRows = colRows.map(r => r + 1);
    memos.forEach(m => {
      let idx = colRows.indexOf(Math.min(...colRows));
      sheet.getRange(colRows[idx], COL_START[idx], 1, 2).mergeAcross().setValue(m).setFontSize(10).setFontColor("#000000").setFontWeight("bold").setWrap(true);
      sheet.setRowHeight(colRows[idx], 35);
      colRows[idx]++;
    });
    colRows = colRows.map(r => r + 1);
  }

  // --- 5. 高さ計算（ビンパッキング用） ---
  const sortedGroups = Object.keys(detailTree).map(g => {
    let h = 1; 
    Object.keys(detailTree[g]).forEach(p => {
      h++; 
      const cKeys = Object.keys(detailTree[g][p]);
      const validChildren = cKeys.filter(c => c !== p && displayNameMap[c] !== displayNameMap[p]);
      h += validChildren.length;
    });
    return { name: g, height: h + 1 };
  }).sort((a, b) => b.height - a.height);

  // --- 6. 描画 ---
sortedGroups.forEach(item => {
  const g = item.name;
  let idx = colRows.indexOf(Math.min(...colRows));
  let tCol = COL_START[idx];
  let tRow = colRows[idx];

  const groupStartRow = tRow;

  sheet.getRange(tRow, tCol, 1, 2).setFontWeight("bold").setFontSize(12);
  sheet.getRange(tRow, tCol).setValue(g);
  sheet.getRange(tRow, tCol+1).setValue(groupCounts[g]).setHorizontalAlignment("center");
    
  tRow++;

  const sortedParents = Object.keys(detailTree[g]).sort((a, b) => (itemOrder[a] || 999) - (itemOrder[b] || 999));

  if (sortedParents.length === 1) {
  // グループ全体枠＋見出し枠（二重）を「この時点で」確定させるなら、ここで引いて終わる
  const groupEndRow = tRow - 1; // 見出し行を書いた直後なので、ここは見出し行
  applyGroupOuterBorder_(sheet, groupStartRow, groupEndRow, tCol, tCol + 1);
  applyGroupOuterBorder_(sheet, groupStartRow, groupStartRow, tCol, tCol + 1);

  colRows[idx] = tRow + 1;
  return; // ← このグループの描画をここで終える（親・子を出さない）
}

  sortedParents.forEach(p => {
    const children = detailTree[g][p];
    const pCount = Object.values(children).reduce((a, b) => a + b, 0);
    
    sheet.getRange(tRow, tCol, 1, 2).setFontWeight("bold").setFontSize(12);
    sheet.getRange(tRow, tCol).setValue(" " + (displayNameMap[p] || p)).setFontLine("underline");
    sheet.getRange(tRow, tCol + 1).setValue(pCount).setHorizontalAlignment("center").setFontLine("underline");
    tRow++;

    const sortedChildren = Object.entries(children).sort((a, b) => (itemOrder[a[0]] || 999) - (itemOrder[b[0]] || 999));

    sortedChildren.forEach(([c, count]) => {
      // 見出し行（自分自身）は内訳として表示しない
      if (c === p || displayNameMap[c] === displayNameMap[p]) return;
      
      sheet.getRange(tRow, tCol).setValue("   " + (displayNameMap[c] || c)).setFontSize(12);
      sheet.getRange(tRow, tCol + 1).setValue(count).setFontSize(12).setFontWeight("bold").setHorizontalAlignment("center");
      tRow++;
    });
  });

  const groupEndRow = tRow - 1;

  applyGroupOuterBorder_(sheet, groupStartRow, groupEndRow, tCol, tCol + 1);
  applyGroupOuterBorder_(sheet, groupStartRow, groupStartRow, tCol, tCol + 1);

  colRows[idx] = tRow + 1;
});


  [1, 4, 7].forEach(c => sheet.setColumnWidth(c, 210));
  [2, 5, 8].forEach(c => sheet.setColumnWidth(c, 45));
  sheet.activate();
}

/**
 * グループ範囲に四方罫線（外枠のみ）を引く
 */
function applyGroupOuterBorder_(sheet, rowStart, rowEnd, colStart, colEnd) {
  if (!sheet) return;
  if (rowEnd < rowStart) return;

  sheet.getRange(rowStart, colStart, rowEnd - rowStart + 1, colEnd - colStart + 1)
    // top, left, bottom, right, vertical, horizontal
    .setBorder(true, true, true, true, false, false, "#000000", SpreadsheetApp.BorderStyle.SOLID);
}

/**
 * 入力 "2/14", "2月14日", "0214", "214", "11/1" など → {m,d} にする
 */
function parseMonthDay_(input) {
  const s = String(input || "").trim();
  if (!s) return null;

  // 1) M/D
  const slash = s.match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
  if (slash) return { m: Number(slash[1]), d: Number(slash[2]) };

  // 2) M月D日（D日は省略可）
  const mdj = s.match(/^(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/);
  if (mdj) return { m: Number(mdj[1]), d: Number(mdj[2]) };

  // 3) 数字だけ（MMDD or MDD）
  const digits = s.replace(/[^0-9]/g, "");
  if (digits.length === 4) return { m: Number(digits.slice(0, 2)), d: Number(digits.slice(2, 4)) };
  if (digits.length === 3) return { m: Number(digits.slice(0, 1)), d: Number(digits.slice(1, 3)) };

  return null;
}

/** Date → "M/d"（A1表示用） */
function formatMDFromDate_(dt) {
  return Utilities.formatDate(dt, Session.getScriptTimeZone(), "M/d");
}
