// ================================
// ProductionSheet.gs   : 厨房用。当日の注文数をメニュー別に集計。
// ================================

function createProductionSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const src = ss.getSheetByName("注文一覧");
  const master = ss.getSheetByName("メニューマスタ");
  const customerSheet = ss.getSheetByName("顧客名簿");
  const sheet = ss.getSheetByName("当日まとめ");
  if (!src || !sheet || !master) return;

  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt("当日まとめ作成", "日付（例: 1/30）", ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;
  const target = res.getResponseText().replace(/[^0-9]/g, "");

  // --- 顧客名簿マッピング (H列: 調理用備考のみ取得) ---
  const customerMap = {};
  if (customerSheet) {
    const cData = customerSheet.getDataRange().getValues();
    cData.slice(1).forEach(r => { 
      if(r[0] && r[7]) customerMap[r[0]] = r[7].toString(); 
    });
  }

  const data = src.getDataRange().getValues();
  const masterData = master.getDataRange().getValues().slice(1);

  // --- 1. マスタ構造の解析 ---
  const groupOrder = [];
  const parentOrder = {};
  const itemToInfo = {};
  const displayNameMap = {}; 

  masterData.forEach(r => {
    const [id, group, parent, child, price, short] = r;
    if (!group) return;
    if (!groupOrder.includes(group)) groupOrder.push(group);
    if (!parentOrder[group]) parentOrder[group] = [];
    if (!parentOrder[group].includes(parent)) parentOrder[group].push(parent);

    const info = { group, parent, child: child ? child.toString().trim() : "" };
    const pName = parent ? parent.toString().trim() : "";
    const cName = child ? child.toString().trim() : "";
    const sName = short ? short.toString().trim() : "";

    if (child) {
      itemToInfo[cName] = info;
      if (sName) displayNameMap[cName] = sName; 
    }
    if (parent) {
      if (!itemToInfo[pName]) itemToInfo[pName] = info;
      if (!child && sName) displayNameMap[pName] = sName;
    }
    if (short) itemToInfo[sName] = info;
  });

  // --- 2. データの集計 ---
  let groupCounts = {};
  let detailTree = {};
  let totalAll = 0;
  let memos = [];

  data.slice(1).forEach(row => {
    const pickupDate = row[4]?.toString().replace(/[^0-9]/g, "");
    if (!pickupDate || !pickupDate.includes(target)) return;

    // 名簿の「調理用備考」がある場合のみリストに追加
    const lineId = row[9];
    const cNote = customerMap[lineId];
    if (cNote) {
      memos.push(`No.${row[1]} ${row[3]}様: 【注】${cNote}`);
    }

    const itemsText = row[6] || "";
    const lines = itemsText.toString().split("\n");
    lines.forEach(line => {
      const m = line.match(/(.+?)\s*x\s*(\d+)/);
      if (!m) return;
      let rawName = m[1].replace(/^[・\s└]+/, "").trim();
      const cleanName = rawName.replace(/[¥￥]?\d+円?/, "").trim();
      const count = Number(m[2]);

      const info = itemToInfo[cleanName] || itemToInfo[rawName] || { group: "その他", parent: "その他", child: rawName };
      const { group, parent, child } = info;
      const childKey = child || parent;

      if (!detailTree[group]) detailTree[group] = {};
      if (!detailTree[group][parent]) detailTree[group][parent] = {};
      detailTree[group][parent][childKey] = (detailTree[group][parent][childKey] || 0) + count;
      groupCounts[group] = (groupCounts[group] || 0) + count;
      totalAll += count;
    });
  });

  // --- 3. 描画準備 ---
  sheet.clear().clearFormats();
  sheet.getRange("A1").setValue(`【 ${res.getResponseText()} 当日まとめ 】`).setFontSize(16).setFontWeight("bold");
  sheet.getRange("A2").setValue(`総数: ${totalAll}`).setFontSize(22).setFontWeight("bold").setFontColor("#cc0000");

  let colRows = [4, 4, 4]; 
  const COL_START = [1, 4, 7]; 

  // --- 4. 備考セクション (調理用備考のみを表示) ---
  if (memos.length > 0) {
    // 3列分に見出しを作成
    COL_START.forEach((cIdx, i) => {
      sheet.getRange(colRows[i], cIdx, 1, 2).setBackground("#ffd9d9").setFontWeight("bold");
      sheet.getRange(colRows[i], cIdx).setValue("▼ 特別注意（名簿より）");
      colRows[i]++;
    });

    memos.forEach(m => {
      // 一番高さが低い（行数が少ない）列を選択
      let targetIdx = colRows.indexOf(Math.min(...colRows));
      let tCol = COL_START[targetIdx];
      let tRow = colRows[targetIdx];

      const r = sheet.getRange(tRow, tCol, 1, 2); // 数量列も含めて2列分結合はせず、表示領域として確保
      r.mergeAcross(); // 横に結合して読みやすくする（任意）
      r.setValue(m)
       .setFontSize(10)
       .setFontColor("#cc0000")
       .setFontWeight("bold")
       .setWrap(true); // ★セル内で折り返し

      sheet.setRowHeight(tRow, 30); // 折り返し用に少し行高を確保（自動調整が必要な場合は調整）
      colRows[targetIdx]++;
    });

    // 備考セクションの後に少し余白を入れる
    colRows = colRows.map(r => r + 2);
  }

  // --- 5. 集計セクション ---
  groupOrder.concat(detailTree["その他"] ? ["その他"] : []).forEach(g => {
    const gCount = groupCounts[g] || 0;
    if (gCount === 0) return;

    let targetIdx = colRows.indexOf(Math.min(...colRows));
    let tCol = COL_START[targetIdx];
    let tRow = colRows[targetIdx];

    sheet.getRange(tRow, tCol, 1, 2).setBackground("#444444").setFontColor("#ffffff").setFontWeight("bold");
    sheet.getRange(tRow, tCol).setValue(g).setFontSize(11);
    sheet.getRange(tRow, tCol + 1).setValue(gCount).setHorizontalAlignment("center");
    tRow++;

    const parents = parentOrder[g] || Object.keys(detailTree[g] || {});
    parents.forEach(p => {
      const children = detailTree[g] ? detailTree[g][p] : null;
      if (!children) return;
      const pCount = Object.values(children).reduce((a, b) => a + b, 0);
      
      const pDisplayName = displayNameMap[p] || p;
      sheet.getRange(tRow, tCol, 1, 2).setBackground("#eeeeee").setFontWeight("bold");
      sheet.getRange(tRow, tCol).setValue(" " + pDisplayName).setFontSize(12);
      sheet.getRange(tRow, tCol + 1).setValue(pCount).setFontSize(12).setHorizontalAlignment("center");
      tRow++;

      Object.entries(children).forEach(([c, count]) => {
        if (c === p && Object.keys(children).length === 1) return; 
        const cDisplayName = displayNameMap[c] || c;
        sheet.getRange(tRow, tCol).setValue("    └ " + cDisplayName).setFontSize(12);
        sheet.getRange(tRow, tCol + 1).setValue(count).setFontSize(12).setFontWeight("bold").setHorizontalAlignment("center");
        tRow++;
      });
    });
    tRow++; 
    colRows[targetIdx] = tRow; 
  });

  // --- レイアウト仕上げ ---
  [1, 4, 7].forEach(c => sheet.setColumnWidth(c, 180));
  [2, 5, 8].forEach(c => sheet.setColumnWidth(c, 45));
  [3, 6].forEach(c => sheet.setColumnWidth(c, 15));
  sheet.getRange(1, 1, Math.max(...colRows), 8).setVerticalAlignment("middle");
  sheet.activate();
}