/**
 * 予約札作成（最短列優先 + 背の高い順ソート + 45行ページ境界管理版）
 * 備考欄の20文字折り返し（【要】込み・スペース無し）対応版
 */
function createDailyReservationCards() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const reportSheet = ss.getSheetByName(CONFIG.SHEET.ORDER_LIST);
  const cardSheet = ss.getSheetByName(CONFIG.SHEET.RESERVATION_CARD);
  const menuSheet = ss.getSheetByName(CONFIG.SHEET.MENU_MASTER);
  const customerSheet = ss.getSheetByName(CONFIG.SHEET.CUSTOMER_LIST);
  
  if (!reportSheet || !cardSheet) return;

  const customerMap = getCustomerMap(customerSheet);
  const menuMap = getMenuMap(menuSheet);

  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('予約札作成', '日付を入力(例: 1/30)', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const targetDateRaw = response.getResponseText().replace(/[^0-9]/g, "");

  const lastRow = reportSheet.getLastRow();
  if (lastRow < 2) return;
  const allData = reportSheet.getRange(1, 1, lastRow, CONFIG.COLUMN.SOURCE_NO).getValues();
  
  let cardsToPrint = [];
  allData.slice(1).forEach(row => {
    const isActive = row[CONFIG.COLUMN.STATUS - 1] !== CONFIG.STATUS.CHANGE_BEFORE;
    const dateVal = row[CONFIG.COLUMN.PICKUP_DATE - 1];
    if (isActive && dateVal && dateVal.toString().replace(/[^0-9]/g, "").includes(targetDateRaw)) {
      
      const rawDetails = row[CONFIG.COLUMN.DETAILS - 1] || "";
      let lines = rawDetails.toString().split('\n').filter(l => l.trim() !== "");
      
      let items = lines.map(line => {
        const cleanLine = line.replace(/^[・└\s]+/, "").trim();
        const parts = cleanLine.split(/\s*x\s*/);
        const namePart = parts[0].trim();
        const qtyPart = parts[1] ? "x" + parts[1] : "";
        const mInfo = menuMap[namePart] || { short: namePart, group: "999" };
        return { short: mInfo.short + " " + qtyPart, group: mInfo.group };
      });

      items.sort((a, b) => String(a.group).localeCompare(String(b.group)));
      const lineId = row[CONFIG.COLUMN.LINE_ID - 1];
      const cInfo = customerMap[lineId] || { specialNote: "", historyLabel: "" };

      // 【修正】「【要】」を含めた全文字数で必要行数を計算
      const formNote = row[CONFIG.COLUMN.NOTE - 1] || "";
      const fullNoteText = formNote ? "【要】" + formNote : "";
      const formNoteLines = fullNoteText ? Math.ceil(fullNoteText.length / 20) : 0;

      let neededRows = 3 + items.length + 1;
      if (cInfo.specialNote) neededRows += 1;
      if (formNoteLines > 0) neededRows += formNoteLines;
      if (cInfo.historyLabel) neededRows += 1;

      cardsToPrint.push({ rowData: row, items: items, customer: cInfo, height: neededRows, fullNoteText: fullNoteText });
    }
  });

  if (cardsToPrint.length === 0) {
    ui.alert("該当データがありませんでした。");
    return;
  }

  cardsToPrint.sort((a, b) => b.height - a.height);
  cardSheet.clear().clearFormats();
  
  const MAX_PAGE_ROWS = 45; 
  let columnHeights = [1, 1, 1];
  let columnPageOffsets = [0, 0, 0];

  cardsToPrint.forEach((card) => {
    let targetColIndex = -1;
    let minHeightInPage = 999;

    for (let i = 0; i < 3; i++) {
      if (columnHeights[i] + card.height <= MAX_PAGE_ROWS) {
        if (columnHeights[i] < minHeightInPage) {
          minHeightInPage = columnHeights[i];
          targetColIndex = i;
        }
      }
    }

    if (targetColIndex === -1) {
      let currentMaxOffset = Math.max(...columnPageOffsets);
      for (let i = 0; i < 3; i++) {
        columnPageOffsets[i] = currentMaxOffset + MAX_PAGE_ROWS;
        columnHeights[i] = 1; 
      }
      targetColIndex = 0;
    }

    let startRow = columnPageOffsets[targetColIndex] + columnHeights[targetColIndex];
    drawDynamicCard(cardSheet, startRow, targetColIndex + 1, card);
    columnHeights[targetColIndex] += (card.height + 1);
  });
  
  for(let c=1; c<=3; c++) cardSheet.setColumnWidth(c, 230);
  cardSheet.setRowHeights(1, cardSheet.getMaxRows(), 17);
  cardSheet.activate();
}

/**
 * 描画補助関数（【注】と【要】の両方を20文字折り返しに対応）
 */
function drawDynamicCard(sheet, startRow, col, card) {
  const { rowData, items, customer, height } = card;
  const orderNo = (rowData[CONFIG.COLUMN.ORDER_NO - 1] || "").toString().replace(/'/g, "");
  const isRegular = rowData[CONFIG.COLUMN.REGULAR_FLG - 1] === "常連";
  const name = (isRegular ? "★ " : "") + (rowData[CONFIG.COLUMN.NAME - 1] || "不明") + " 様";
  const tel = "TEL: " + (rowData[CONFIG.COLUMN.TEL - 1] || "なし").toString().replace(/'/g, "");
  const totalStr = "計:" + rowData[CONFIG.COLUMN.TOTAL_COUNT - 1] + "点 / " + Number(rowData[CONFIG.COLUMN.TOTAL_PRICE - 1]).toLocaleString() + "円";
  
  // 備考と注記のテキスト準備
  const formNote = (rowData[CONFIG.COLUMN.NOTE - 1] || "").toString();
  const fullNoteText = formNote ? "【要】" + formNote : "";
  const fullSpecialNoteText = customer.specialNote ? "【注】" + customer.specialNote : "";

  let r = startRow;
  sheet.getRange(startRow, col, height, 1).setBorder(true, true, true, true, null, null, "#444444", SpreadsheetApp.BorderStyle.SOLID);
  const status = rowData[CONFIG.COLUMN.STATUS - 1];
  const srcNo = String(rowData[CONFIG.COLUMN.SOURCE_NO - 1] || "").replace(/'/g, "");

  let noLine = "No: " + orderNo;
  if (status === CONFIG.STATUS.NEEDS_CHECK) {
    noLine += srcNo ? "  要確認(元No:" + srcNo + ")" : "  要確認";
  }

  sheet.getRange(r++, col)
    .setValue(noLine)
    .setBackground("#eeeeee")
    .setFontWeight("bold")
    .setFontSize(10);
  sheet.getRange(r++, col).setValue(name).setFontSize(11).setFontWeight("bold");
  sheet.getRange(r++, col).setValue(tel).setFontSize(8);

  items.forEach((item) => {
    sheet.getRange(r++, col).setValue("・" + item.short).setFontSize(10);
  });

  sheet.getRange(r, col).setValue(totalStr).setFontWeight("bold").setFontSize(9).setBorder(true, null, null, null, null, null);
  r++;

  // --- 【注】の20文字分割書き込み ---
  if (fullSpecialNoteText) {
    for (let i = 0; i < fullSpecialNoteText.length; i += 20) {
      let chunk = fullSpecialNoteText.substring(i, i + 20);
      sheet.getRange(r++, col).setValue(chunk).setFontSize(9).setFontColor("#ff0000").setFontWeight("bold");
    }
  }

  // --- 【要】の20文字分割書き込み ---
  if (fullNoteText) {
    for (let i = 0; i < fullNoteText.length; i += 20) {
      let chunk = fullNoteText.substring(i, i + 20);
      sheet.getRange(r++, col).setValue(chunk).setFontSize(8).setFontColor("#333333");
    }
  }

  if (customer.historyLabel) {
    sheet.getRange(r++, col).setValue(customer.historyLabel).setFontSize(8).setFontColor("#666666");
  }
}

/**
 * 補助関数：getCustomerMap
 */
function getCustomerMap(customerSheet) {
  const customerMap = {};
  if (!customerSheet) return customerMap;
  const cData = customerSheet.getDataRange().getValues();
  cData.slice(1).forEach(r => {
    const lineId = r[CONFIG.CUSTOMER_COLUMN.LINE_ID - 1];
    if (!lineId) return;
    customerMap[lineId] = {
      specialNote: r[CONFIG.CUSTOMER_COLUMN.NOTE_COOK - 1] || "", 
      historyLabel: r[CONFIG.CUSTOMER_COLUMN.HISTORY_1 - 1] ? "前回: " + String(r[CONFIG.CUSTOMER_COLUMN.HISTORY_1 - 1]).split(" ")[0] : "" 
    };
  });
  return customerMap;
}

/**
 * 補助関数：getMenuMap
 */
function getMenuMap(menuSheet) {
  const menuMap = {};
  if (!menuSheet) return menuMap;
  const mData = menuSheet.getDataRange().getValues();
  mData.slice(1).forEach(r => {
    const menuName = r[CONFIG.MENU_COLUMN.MENU_NAME - 1] ? r[CONFIG.MENU_COLUMN.MENU_NAME - 1].toString().trim() : "";
    const subMenu = r[CONFIG.MENU_COLUMN.SUB_MENU - 1] ? r[CONFIG.MENU_COLUMN.SUB_MENU - 1].toString().trim() : "";
    const shortName = r[CONFIG.MENU_COLUMN.SHORT_NAME - 1] ? r[CONFIG.MENU_COLUMN.SHORT_NAME - 1].toString().trim() : "";
    if (!menuName) return;
    const fullNameKey = subMenu ? `${menuName}(${subMenu})` : menuName;
    if (shortName && (subMenu !== "" || !menuMap[fullNameKey])) {
      menuMap[fullNameKey] = { short: shortName, group: r[CONFIG.MENU_COLUMN.GROUP - 1] || "999" };
    }
  });
  return menuMap;
}