function createDailyReservationCards() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const reportSheet = ss.getSheetByName(CONFIG.SHEET.ORDER_LIST);
  const cardSheet = ss.getSheetByName(CONFIG.SHEET.RESERVATION_CARD);
  const menuSheet = ss.getSheetByName(CONFIG.SHEET.MENU_MASTER);
  
  if (!reportSheet || !cardSheet) return;

  // --- 1. メニューマスタの読み込み (略称とグループ順) ---
  const menuMap = {};
  if (menuSheet) {
    const mData = menuSheet.getDataRange().getValues();
    mData.slice(1).forEach(r => {
      // 照合用キー: 「メニュー名小メニュー」 または 「メニュー名」
      const fullName = (r[CONFIG.MENU_COLUMN.MENU_NAME - 1] + (r[CONFIG.MENU_COLUMN.SUB_MENU - 1] || "")).trim();
      menuMap[fullName] = {
        short: r[CONFIG.MENU_COLUMN.SHORT_NAME - 1] || fullName,
        group: r[CONFIG.MENU_COLUMN.GROUP - 1] || "999" // グループ未指定は最後に
      };
    });
  }

  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('予約札作成', '日付を入力(例: 1/30)', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const targetDateRaw = response.getResponseText().replace(/[^0-9]/g, "");

  const lastRow = reportSheet.getLastRow();
  const allData = reportSheet.getRange(1, 1, lastRow, reportSheet.getLastColumn()).getValues();
  
  // 対象データの抽出と商品整理
  let cardsToPrint = [];
  allData.slice(1).forEach(row => {
    const isActive = row[CONFIG.COLUMN.STATUS - 1] !== CONFIG.STATUS.CHANGE_BEFORE;
    const dateMatch = row[CONFIG.COLUMN.PICKUP_DATE - 1].toString().replace(/[^0-9]/g, "").includes(targetDateRaw);
    
    if (isActive && dateMatch) {
      // 商品テキストをバラしてマスタと照合
      let lines = row[CONFIG.COLUMN.DETAILS - 1].toString().split('\n').filter(l => l.trim() !== "");
      
      let items = lines.map(line => {
        // "商品名(サブ) 価格 x 個数" という形式から商品名部分を抽出
        // ※ 形式に合わせて調整が必要な場合があります
        const match = line.match(/^(.+?)\s\d+円/); 
        const itemName = match ? match[1].trim() : line.split(" ")[0];
        const qtyPart = line.substring(line.lastIndexOf("x")); // "x 1" 部分
        
        const mInfo = menuMap[itemName] || { short: itemName, group: "999" };
        return { original: line, short: mInfo.short + " " + qtyPart, group: mInfo.group };
      });

      // グループ順に並べ替え
      items.sort((a, b) => String(a.group).localeCompare(String(b.group)));
      cardsToPrint.push({ row: row, items: items });
    }
  });

  // 描画設定
  cardSheet.clear().clearFormats();
  let currentRow = 1, currentCol = 1;
  const COL_COUNT = 3; 
  const CARD_HEIGHT = 23; // A4半分に収まる高さ

  cardsToPrint.forEach((card, index) => {
    drawFinalCard(cardSheet, currentRow, currentCol, card.row, card.items, CARD_HEIGHT);
    
    if (currentCol < COL_COUNT) {
      currentCol++;
    } else {
      currentCol = 1;
      currentRow += CARD_HEIGHT;
    }
  });

  // 全体の整形
  for(let c=1; c<=COL_COUNT; c++) cardSheet.setColumnWidth(c, 250);
  if (cardSheet.getLastRow() > 0) {
    cardSheet.setRowHeights(1, cardSheet.getLastRow(), 21); // 1行21px固定
  }
  cardSheet.activate();
}

function drawFinalCard(sheet, startRow, col, row, items, cardHeight) {
  const orderNo = row[CONFIG.COLUMN.ORDER_NO - 1].toString().replace(/'/g, "");
  const name = row[CONFIG.COLUMN.NAME - 1] + " 様";
  const totalStr = "計:" + row[CONFIG.COLUMN.TOTAL_COUNT - 1] + "点 / " + Number(row[CONFIG.COLUMN.TOTAL_PRICE - 1]).toLocaleString() + "円";

  // 1. 枠線 (22行分使用)
  const range = sheet.getRange(startRow, col, cardHeight - 1, 1);
  range.setBorder(true, true, true, true, null, null, "#444444", SpreadsheetApp.BorderStyle.SOLID);

  // 2. ヘッダー
  sheet.getRange(startRow, col).setValue("No: " + orderNo).setBackground("#eeeeee").setFontWeight("bold");
  sheet.getRange(startRow + 1, col).setValue(name).setFontSize(13).setFontWeight("bold");

  // 3. 商品リスト (4行目から最大15行)
  const maxLines = 15;
  items.slice(0, maxLines).forEach((item, i) => {
    sheet.getRange(startRow + 2 + i, col).setValue("・" + item.short).setFontSize(9);
  });

  // 4. フッター (下から2行目付近に固定)
  const footerRow = startRow + cardHeight - 3;
  sheet.getRange(footerRow, col).setValue(totalStr).setFontWeight("bold").setBorder(true, null, null, null, null, null);
  
  // 備考(リクエスト)がある場合、最下段に小さく表示
  if (row[CONFIG.COLUMN.NOTE - 1]) {
    sheet.getRange(footerRow + 1, col).setValue("特記:" + row[CONFIG.COLUMN.NOTE - 1]).setFontSize(8).setFontColor("#666666");
  }
}