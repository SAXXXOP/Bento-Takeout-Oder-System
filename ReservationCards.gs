/**
 * 予約札作成（最短列優先 + 背の高い順ソート + 46行ページ境界管理版）
 * 備考欄の20文字折り返し（【要】込み・スペース無し）対応版
 */
function createDailyReservationCards(targetDateOrInput) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const reportSheet = ss.getSheetByName(CONFIG.SHEET.ORDER_LIST);
  const cardSheet = ss.getSheetByName(CONFIG.SHEET.RESERVATION_CARD);
  const menuSheet = ss.getSheetByName(CONFIG.SHEET.MENU_MASTER);
  
  if (!reportSheet || !cardSheet) return;

  const menuMap = getMenuMap(menuSheet);

  // トリガー実行ではUIが使えないので安全に扱う
  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) {}

  let targetInput = "";
  let targetMD = null;        // {m,d}
  let targetDigits = "";      // フォールバック用

  if (targetDateOrInput instanceof Date) {
    targetMD = { m: targetDateOrInput.getMonth() + 1, d: targetDateOrInput.getDate() };
    targetInput = `${targetMD.m}/${targetMD.d}`;
    targetDigits = `${targetMD.m}${targetMD.d}`;
  } else if (targetDateOrInput !== undefined && targetDateOrInput !== null && String(targetDateOrInput).trim() !== "") {
    targetInput = String(targetDateOrInput).trim();
    targetMD = (typeof parseMonthDay_ === "function") ? parseMonthDay_(targetInput) : null;
    targetDigits = targetInput.replace(/[^0-9]/g, "");
    if (!targetDigits && targetMD) targetDigits = `${targetMD.m}${targetMD.d}`;
  } else {
    if (!ui) throw new Error("createDailyReservationCards: targetDateOrInput is required when running without UI.");
    const response = ui.prompt('予約札作成', '日付を入力(例: 1/30)', ui.ButtonSet.OK_CANCEL);
    if (response.getSelectedButton() !== ui.Button.OK) return;
    targetInput = String(response.getResponseText() || "").trim();
    targetMD = (typeof parseMonthDay_ === "function") ? parseMonthDay_(targetInput) : null;
    targetDigits = targetInput.replace(/[^0-9]/g, "");
    if (!targetDigits && targetMD) targetDigits = `${targetMD.m}${targetMD.d}`;
  }

  const lastRow = reportSheet.getLastRow();
  if (lastRow < 2) return;
  // RAW日付列(PICKUP_DATE_RAW)まで取る（自動判定の精度アップ）
  const lastCol = CONFIG.COLUMN.PICKUP_DATE_RAW || CONFIG.COLUMN.SOURCE_NO;
  const allData = reportSheet.getRange(1, 1, lastRow, lastCol).getValues();
  
  let cardsToPrint = [];
  allData.slice(1).forEach(row => {
  const status = String(row[CONFIG.COLUMN.STATUS - 1] || "");
  const isActive = (status === CONFIG.STATUS.ACTIVE); // ACTIVEは空文字
  if (!isActive) return;
    const dateVal = row[CONFIG.COLUMN.PICKUP_DATE - 1];
    const pickupDateRaw = CONFIG.COLUMN.PICKUP_DATE_RAW ? row[CONFIG.COLUMN.PICKUP_DATE_RAW - 1] : null;

    let isTarget = false;
    if (targetMD && pickupDateRaw instanceof Date) {
      isTarget = (pickupDateRaw.getMonth() + 1 === targetMD.m && pickupDateRaw.getDate() === targetMD.d);
    } else if (dateVal && targetDigits) {
      isTarget = String(dateVal).replace(/[^0-9]/g, "").includes(targetDigits);
    }

    if (isActive && isTarget) {

      
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
      
      // 【修正】「【要】」を含めた全文字数で必要行数を計算
      const formNote = row[CONFIG.COLUMN.NOTE - 1] || "";
      const fullNoteText = formNote ? "【要】" + formNote : "";
      const formNoteLines = fullNoteText ? Math.ceil(fullNoteText.length / 20) : 0;

      const customerName = (CONFIG.COLUMN.NAME != null)
        ? String(row[CONFIG.COLUMN.NAME - 1] || "").trim()
        : "";
      const hasName = !!customerName;

      // ヘッダ行：#予約No / 受取 / (名前) / TEL
      let neededRows = (hasName ? 4 : 3) + items.length + 1;
      if (formNoteLines > 0) neededRows += formNoteLines;

      cardsToPrint.push({ rowData: row, items: items, height: neededRows });
    }
  });

  // ★0件でも予約札を空にする（前回の札が残らないように）
  cardSheet.clear().clearFormats();

  if (cardsToPrint.length === 0) {
    if (ui) ui.alert("該当データがありませんでした。（予約札は空にしました）");
    else console.log("createDailyReservationCards: 該当データなし（予約札は空にした）");

    // レイアウトだけ整えておく（通常処理と同等）
    for (let c = 1; c <= 3; c++) cardSheet.setColumnWidth(c, 230);
    cardSheet.setRowHeights(1, cardSheet.getMaxRows(), 21);
    if (ui) cardSheet.activate();
    return;
  }

  cardsToPrint.sort((a, b) => b.height - a.height);
  
  const MAX_PAGE_ROWS = 46; 
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
  cardSheet.setRowHeights(1, cardSheet.getMaxRows(), 21);
  if (ui) cardSheet.activate();
}

/**
 * 描画補助関数（【要】を20文字折り返しに対応）
 */
function drawDynamicCard(sheet, startRow, col, card) {
  const { rowData, items, height } = card;
  const orderNo = (rowData[CONFIG.COLUMN.ORDER_NO - 1] || "").toString().replace(/'/g, "");
  const isRegular = String(rowData[CONFIG.COLUMN.REGULAR_FLG - 1] || "") === "常連";
  const telRaw = (rowData[CONFIG.COLUMN.TEL - 1] || "").toString().replace(/'/g, "");
  const tel = "TEL: " + (telRaw || "なし");
  const customerName = (CONFIG.COLUMN.NAME != null)
    ? String(rowData[CONFIG.COLUMN.NAME - 1] || "").trim()
    : "";
  const hasName = !!customerName;
  const mark = isRegular ? "★ " : "";
  const nameLine = hasName ? (mark + addSama_(customerName)) : "";
  const telLine = hasName ? tel : (mark + tel); // 名前が無い時は電話行に★を寄せる
  const totalStr = "計:" + rowData[CONFIG.COLUMN.TOTAL_COUNT - 1] + "点 / " + Number(rowData[CONFIG.COLUMN.TOTAL_PRICE - 1]).toLocaleString() + "円";

  // ★受取日時（時刻列が無い場合もOK）
  const tz = Session.getScriptTimeZone();
  const pickupDateVal = rowData[CONFIG.COLUMN.PICKUP_DATE - 1];
  const hasPickupTimeCol = CONFIG.COLUMN.PICKUP_TIME != null; // 未定義対策
  const pickupTimeVal = hasPickupTimeCol ? rowData[CONFIG.COLUMN.PICKUP_TIME - 1] : "";

  const pickupDateStr =
    pickupDateVal instanceof Date
      ? Utilities.formatDate(pickupDateVal, tz, "M/d(E)")
      : (pickupDateVal ? pickupDateVal.toString() : "");

  const pickupTimeStr =
    pickupTimeVal instanceof Date
      ? Utilities.formatDate(pickupTimeVal, tz, "H:mm")
      : (pickupTimeVal ? pickupTimeVal.toString() : "");

  const pickupStr = "受取: " + (pickupDateStr || "-") + (pickupTimeStr ? " " + pickupTimeStr : "");

  // 備考と注記のテキスト準備
  const formNote = (rowData[CONFIG.COLUMN.NOTE - 1] || "").toString();
  const fullNoteText = formNote ? "[要]" + formNote : "";

  let r = startRow;
  sheet.getRange(startRow, col, height, 1).setBorder(true, true, true, true, null, null, "#444444", SpreadsheetApp.BorderStyle.SOLID);

  sheet.getRange(r++, col).setValue("# " + orderNo).setBackground("#eeeeee").setFontWeight("bold").setFontSize(10);
  sheet.getRange(r++, col).setValue(pickupStr).setFontSize(9).setFontWeight("bold"); // ★ここが追加行
  if (hasName) {
    sheet.getRange(r++, col).setValue(nameLine).setFontSize(11).setFontWeight("bold");
    sheet.getRange(r++, col).setValue(telLine).setFontSize(8);
  } else {
    // 名前が無い時：電話を目立たせて、名前行は出さない
    sheet.getRange(r++, col).setValue(telLine).setFontSize(11).setFontWeight("bold");
  }

  items.forEach((item) => {
    sheet.getRange(r++, col).setValue("・" + item.short).setFontSize(10);
  });

  sheet.getRange(r, col).setValue(totalStr).setFontWeight("bold").setFontSize(9).setBorder(true, null, null, null, null, null, "#444444", SpreadsheetApp.BorderStyle.DASHED);
  r++;

  // --- 【要】の20文字分割書き込み ---
  if (fullNoteText) {
    for (let i = 0; i < fullNoteText.length; i += 20) {
      let chunk = fullNoteText.substring(i, i + 20);
      sheet.getRange(r++, col).setValue(chunk).setFontSize(8).setFontColor("#333333");
    }
  }
}


// 追加推奨：drawDynamicCard の直下（同ファイル内で完結）
function addSama_(name) {
  const s = String(name || "").trim();
  if (!s) return "";
  if (s.endsWith("様")) return s;
  return s + "様";
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