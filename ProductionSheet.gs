/**
 * 当日まとめシート作成
 * 修正点：小メニューをID順（マスタ登録順）に並び替え / ビンパッキング / サイズ12
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
  const target = res.getResponseText().replace(/[^0-9]/g, "");

  // --- 1. メニューマスタのインデックス化 (ID順を保持) ---
  const masterData = master.getDataRange().getValues().slice(1);
  const itemToInfo = {};    
  const displayNameMap = {}; 
  const itemOrder = []; // ID順を保持するための配列

  masterData.forEach((r, index) => {
    const group = r[CONFIG.MENU_COLUMN.GROUP - 1];
    const parent = r[CONFIG.MENU_COLUMN.MENU_NAME - 1]?.toString().trim() || "";
    const child = r[CONFIG.MENU_COLUMN.SUB_MENU - 1]?.toString().trim() || "";
    const short = r[CONFIG.MENU_COLUMN.SHORT_NAME - 1]?.toString().trim() || "";
    
    if (!group) return;

    const info = { group, parent, child, id: index }; // 出現順(index)を保持

    if (child) {
      itemToInfo[child] = info;
      if (!itemOrder.includes(child)) itemOrder.push(child);
    }
    if (short) {
      itemToInfo[short] = info;
    }
    if (parent && !itemToInfo[parent]) {
      itemToInfo[parent] = info;
      if (!itemOrder.includes(parent)) itemOrder.push(parent);
    }
    
    displayNameMap[child || parent] = short || child || parent;
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
    if (row[CONFIG.COLUMN.STATUS - 1] === CONFIG.STATUS.CHANGE_BEFORE) return;
    const pickupDate = row[CONFIG.COLUMN.PICKUP_DATE - 1]?.toString().replace(/[^0-9]/g, "");
    if (!pickupDate || !pickupDate.includes(target)) return;

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
      const childKey = child || parent;

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
  if (memos.length > 0) {
    COL_START.forEach((cIdx, i) => {
      sheet.getRange(colRows[i], cIdx, 1, 2).setBackground("#ffd9d9").setFontWeight("bold").setFontSize(11).setValue("▼ 特別注意");
      colRows[i]++;
    });
    memos.forEach(m => {
      let idx = colRows.indexOf(Math.min(...colRows));
      sheet.getRange(colRows[idx], COL_START[idx], 1, 2).mergeAcross().setValue(m).setFontSize(10).setFontColor("#cc0000").setFontWeight("bold").setWrap(true);
      sheet.setRowHeight(colRows[idx], 35);
      colRows[idx]++;
    });
    colRows = colRows.map(r => r + 1);
  }

  // --- 5. ビンパッキング用の高さ計算 ---
  const sortedGroups = Object.keys(detailTree).map(g => {
    let h = 1; // Header
    Object.keys(detailTree[g]).forEach(p => {
      h++; // Parent row
      const cKeys = Object.keys(detailTree[g][p]);
      if (!(cKeys.length === 1 && cKeys[0] === p)) h += cKeys.length;
    });
    return { name: g, height: h + 1 };
  }).sort((a, b) => b.height - a.height);

  // --- 6. 描画 (小メニューをID順にソート) ---
  sortedGroups.forEach(item => {
    const g = item.name;
    let idx = colRows.indexOf(Math.min(...colRows));
    let tCol = COL_START[idx];
    let tRow = colRows[idx];

    // グループヘッダー
    sheet.getRange(tRow, tCol, 1, 2).setBackground("#444444").setFontColor("#ffffff").setFontWeight("bold").setFontSize(12);
    sheet.getRange(tRow, tCol).setValue(g);
    sheet.getRange(tRow, tCol+1).setValue(groupCounts[g]).setHorizontalAlignment("center");
    tRow++;

    // 親メニューの並び替え (マスタ出現順)
    const sortedParents = Object.keys(detailTree[g]).sort((a, b) => {
      const idA = itemToInfo[a]?.id ?? 999;
      const idB = itemToInfo[b]?.id ?? 999;
      return idA - idB;
    });

    sortedParents.forEach(p => {
      const children = detailTree[g][p];
      const pCount = Object.values(children).reduce((a, b) => a + b, 0);
      
      sheet.getRange(tRow, tCol, 1, 2).setBackground("#eeeeee").setFontWeight("bold").setFontSize(12);
      sheet.getRange(tRow, tCol).setValue(" " + (displayNameMap[p] || p));
      sheet.getRange(tRow, tCol + 1).setValue(pCount).setHorizontalAlignment("center");
      tRow++;

      // 子メニューの並び替え (マスタ出現順)
      const sortedChildren = Object.entries(children).sort((a, b) => {
        const idA = itemToInfo[a[0]]?.id ?? 999;
        const idB = itemToInfo[b[0]]?.id ?? 999;
        return idA - idB;
      });

      sortedChildren.forEach(([c, count]) => {
        if (c === p && Object.keys(children).length === 1) return;
        sheet.getRange(tRow, tCol).setValue("    └ " + (displayNameMap[c] || c)).setFontSize(12);
        sheet.getRange(tRow, tCol + 1).setValue(count).setFontSize(12).setFontWeight("bold").setHorizontalAlignment("center");
        tRow++;
      });
    });
    colRows[idx] = tRow + 1;
  });

  // 仕上げ
  [1, 4, 7].forEach(c => sheet.setColumnWidth(c, 210));
  [2, 5, 8].forEach(c => sheet.setColumnWidth(c, 45));
  sheet.activate();
}