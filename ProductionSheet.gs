/**
 * 当日まとめシート作成
 * 修正点：見出し用ID(10,15,21,46等)の重複排除 / ID順 / ビンパッキング
 */
function updateDailySummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const src = ss.getSheetByName(CONFIG.SHEET.ORDER_LIST);
  const master = ss.getSheetByName(CONFIG.SHEET.MENU_MASTER);
  const customerSheet = ss.getSheetByName(CONFIG.SHEET.CUSTOMER_LIST);
  const sheet = ss.getSheetByName(CONFIG.SHEET.DAILY_SUMMARY);
  if (!src || !sheet || !master) return;

  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt("当日まとめ作成", "日付（例: 2/14）", ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const target = res.getResponseText().replace(/[^0-9]/g, "");

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
  let needChecks = [];

  data.slice(1).forEach(row => {
  const status = row[CONFIG.COLUMN.STATUS - 1];

  // 集計対象は「通常」「変更後」「要確認」
  if (
    status !== CONFIG.STATUS.NORMAL &&
    status !== CONFIG.STATUS.CHANGE_AFTER &&
    status !== CONFIG.STATUS.NEEDS_CHECK
  ) return;

  // 要確認は注意欄にも必ず出す（場所は後で移動しやすいよう、ここで集約）
  if (status === CONFIG.STATUS.NEEDS_CHECK) {
    const no = String(row[CONFIG.COLUMN.ORDER_NO - 1] || "").replace(/'/g, "");
    const name = row[CONFIG.COLUMN.NAME - 1] || "";
    const srcNo = String(row[CONFIG.COLUMN.SOURCE_NO - 1] || "").replace(/'/g, "");
    memos.push(`要確認 No.${no}（元No:${srcNo || "不明"}） ${name}様`);
  }

    const pickupDate = row[CONFIG.COLUMN.PICKUP_DATE - 1]?.toString().replace(/[^0-9]/g, "");
    if (!pickupDate || !pickupDate.includes(target)) return;

    const lineId = row[CONFIG.COLUMN.LINE_ID - 1];
    if (customerMap[lineId]) {
      memos.push(`No.${row[CONFIG.COLUMN.ORDER_NO - 1].toString().replace("'","")} ${row[CONFIG.COLUMN.NAME - 1]}様: 【注】${customerMap[lineId]}`);
    }

    if (status === CONFIG.STATUS.NEEDS_CHECK) {
      const no = String(row[CONFIG.COLUMN.ORDER_NO - 1] || "").replace(/'/g, "");
      const name = row[CONFIG.COLUMN.NAME - 1] || "";
      const srcNo = String(row[CONFIG.COLUMN.SOURCE_NO - 1] || "").replace(/'/g, "");
      needChecks.push(`No.${no} 要確認（元No:${srcNo || "不明"}） ${name}様`);
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
  sheet.getRange("A1").setValue(`【 ${res.getResponseText()} 当日まとめ 】`).setFontSize(14).setFontWeight("bold");
  sheet.getRange("A2").setValue(`総数: ${totalAll}`).setFontSize(22).setFontWeight("bold").setFontColor("#cc0000");

  let colRows = [4, 4, 4]; 
  const COL_START = [1, 4, 7];

  // --- 4. 備考エリア ---

  // 4-A. 要確認（先に表示）
  if (needChecks.length > 0) {
    COL_START.forEach((cIdx, i) => {
      sheet.getRange(colRows[i], cIdx, 1, 2)
        .setBackground("#fff2cc")
        .setFontWeight("bold")
        .setFontSize(11)
        .setValue("▼ 要確認");
      colRows[i]++;
    });

    needChecks.forEach(m => {
      let idx = colRows.indexOf(Math.min(...colRows));
      sheet.getRange(colRows[idx], COL_START[idx], 1, 2)
        .mergeAcross()
        .setValue(m)
        .setFontSize(10)
        .setFontColor("#cc0000")
        .setFontWeight("bold")
        .setWrap(true);
      sheet.setRowHeight(colRows[idx], 35);
      colRows[idx]++;
    });

    colRows = colRows.map(r => r + 1);
  }

  // 4-B. 既存の特別注意（従来通り）
  if (memos.length > 0) {
    COL_START.forEach((cIdx, i) => {
      sheet.getRange(colRows[i], cIdx, 1, 2)
        .setBackground("#ffd9d9")
        .setFontWeight("bold")
        .setFontSize(11)
        .setValue("▼ 特別注意");
      colRows[i]++;
    });

    memos.forEach(m => {
      let idx = colRows.indexOf(Math.min(...colRows));
      sheet.getRange(colRows[idx], COL_START[idx], 1, 2)
        .mergeAcross()
        .setValue(m)
        .setFontSize(10)
        .setFontColor("#cc0000")
        .setFontWeight("bold")
        .setWrap(true);
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

    sheet.getRange(tRow, tCol, 1, 2).setBackground("#444444").setFontColor("#ffffff").setFontWeight("bold").setFontSize(12);
    sheet.getRange(tRow, tCol).setValue(g);
    sheet.getRange(tRow, tCol+1).setValue(groupCounts[g]).setHorizontalAlignment("center");
    tRow++;

    const sortedParents = Object.keys(detailTree[g]).sort((a, b) => (itemOrder[a] || 999) - (itemOrder[b] || 999));

    sortedParents.forEach(p => {
      const children = detailTree[g][p];
      const pCount = Object.values(children).reduce((a, b) => a + b, 0);
      
      sheet.getRange(tRow, tCol, 1, 2).setBackground("#eeeeee").setFontWeight("bold").setFontSize(12);
      sheet.getRange(tRow, tCol).setValue(" " + (displayNameMap[p] || p));
      sheet.getRange(tRow, tCol + 1).setValue(pCount).setHorizontalAlignment("center");
      tRow++;

      const sortedChildren = Object.entries(children).sort((a, b) => (itemOrder[a[0]] || 999) - (itemOrder[b[0]] || 999));

      sortedChildren.forEach(([c, count]) => {
        // 見出し行（自分自身）は内訳として表示しない
        if (c === p || displayNameMap[c] === displayNameMap[p]) return;
        
        sheet.getRange(tRow, tCol).setValue("    └ " + (displayNameMap[c] || c)).setFontSize(12);
        sheet.getRange(tRow, tCol + 1).setValue(count).setFontSize(12).setFontWeight("bold").setHorizontalAlignment("center");
        tRow++;
      });
    });
    colRows[idx] = tRow + 1;
  });

  [1, 4, 7].forEach(c => sheet.setColumnWidth(c, 210));
  [2, 5, 8].forEach(c => sheet.setColumnWidth(c, 45));
  sheet.activate();

  // ProductionSheet.gs 末尾などに追加
function writeSectionHeaderOnce_(sheet, row, title, bgColor) {
  // A:H（1〜8列）を見出し行として1回だけ表示
  sheet.getRange(row, 1, 1, 8)
    .merge()
    .setValue(title)
    .setBackground(bgColor)
    .setFontWeight("bold")
    .setFontSize(11);
}
}