function createDailyReservationCards() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const reportSheet = ss.getSheetByName(CONFIG.SHEET.ORDER_LIST);
  const cardSheet = ss.getSheetByName(CONFIG.SHEET.RESERVATION_CARD);
  const menuSheet = ss.getSheetByName(CONFIG.SHEET.MENU_MASTER);
  
  if (!reportSheet || !cardSheet) return;

  // --- 1. メニューマスタの読み込み (略称とグループ順の辞書作成) ---
  const menuMap = {};
  if (menuSheet) {
    const mData = menuSheet.getDataRange().getValues();
    mData.slice(1).forEach(r => {
      const menuName = r[CONFIG.MENU_COLUMN.MENU_NAME - 1] ? r[CONFIG.MENU_COLUMN.MENU_NAME - 1].toString().trim() : "";
      const subMenu = r[CONFIG.MENU_COLUMN.SUB_MENU - 1] ? r[CONFIG.MENU_COLUMN.SUB_MENU - 1].toString().trim() : "";
      
      if (!menuName) return; // メニュー名がない行は飛ばす

      // マスタ上の合体名（例：「からあげ弁当ﾌﾟﾚｰﾝ」や「のりのり弁当」）
      const fullName = menuName + subMenu;
      
      menuMap[fullName] = {
        short: r[CONFIG.MENU_COLUMN.SHORT_NAME - 1] || fullName,
        group: r[CONFIG.MENU_COLUMN.GROUP - 1] || "999"
      };
    });
  }

  // --- 2. 日付入力とデータ抽出 ---
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('予約札作成', '日付を入力(例: 1/30)', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const targetDateRaw = response.getResponseText().replace(/[^0-9]/g, "");

  const lastRow = reportSheet.getLastRow();
  if (lastRow < 2) return;
  const allData = reportSheet.getRange(1, 1, lastRow, reportSheet.getLastColumn()).getValues();
  
  let cardsToPrint = [];
  allData.slice(1).forEach(row => {
    const isActive = row[CONFIG.COLUMN.STATUS - 1] !== CONFIG.STATUS.CHANGE_BEFORE;
    const dateVal = row[CONFIG.COLUMN.PICKUP_DATE - 1];
    if (!dateVal) return;
    
    const dateMatch = dateVal.toString().replace(/[^0-9]/g, "").includes(targetDateRaw);
    
    if (isActive && dateMatch) {
      const rawDetails = row[CONFIG.COLUMN.DETAILS - 1];
      let lines = rawDetails ? rawDetails.toString().split('\n').filter(l => l && l.trim() !== "") : [];
      
      let items = lines.map(line => {
        // "商品名(サブ含) 000円 x 1" の形式から商品名部分だけを抽出
        // 価格（数字+円）より前の部分を正規表現で取得
        const nameMatch = line.match(/^(.+?)\s*\d+円/);
        const fullNameInOrder = nameMatch ? nameMatch[1].replace(/\s+/g, "") : line.split(" ")[0]; // 空白を除去してマスタと照合
        
        // 個数部分を取得
        const qtyMatch = line.match(/x\s*(\d+)/);
        const qtyPart = qtyMatch ? "x" + qtyMatch[1] : "";
        
        const mInfo = menuMap[fullNameInOrder] || { short: fullNameInOrder, group: "999" };
        return { short: mInfo.short + " " + qtyPart, group: mInfo.group };
      });

      // グループ順にソート（弁当 -> カレー -> ドリア...）
      items.sort((a, b) => String(a.group).localeCompare(String(b.group)));
      cardsToPrint.push({ row: row, items: items });
    }
  });

  // --- 3. 描画処理 (3x2レイアウト) ---
  cardSheet.clear().clearFormats();
  let currentRow = 1, currentCol = 1;
  const COL_COUNT = 3; 
  const CARD_HEIGHT = 23; 

  cardsToPrint.forEach((card) => {
    drawFinalCard(cardSheet, currentRow, currentCol, card.row, card.items, CARD_HEIGHT);
    if (currentCol < COL_COUNT) {
      currentCol++;
    } else {
      currentCol = 1;
      currentRow += CARD_HEIGHT;
    }
  });

  if (cardSheet.getLastRow() > 0) {
    cardSheet.setRowHeights(1, cardSheet.getLastRow(), 21);
    cardSheet.setColumnWidths(1, 3, 250); // 列幅を調整
  }
  cardSheet.activate();
}

function drawFinalCard(sheet, startRow, col, row, items, cardHeight) {
  const orderNo = (row[CONFIG.COLUMN.ORDER_NO - 1] || "").toString().replace(/'/g, "");
  const name = (row[CONFIG.COLUMN.NAME - 1] || "不明") + " 様";
  const totalCount = row[CONFIG.COLUMN.TOTAL_COUNT - 1] || 0;
  const totalPrice = row[CONFIG.COLUMN.TOTAL_PRICE - 1] || 0;
  const totalStr = "計:" + totalCount + "点 / " + Number(totalPrice).toLocaleString() + "円";
  const note = row[CONFIG.COLUMN.NOTE - 1] || "";

  // 枠線
  const range = sheet.getRange(startRow, col, cardHeight - 1, 1);
  range.setBorder(true, true, true, true, null, null, "#444444", SpreadsheetApp.BorderStyle.SOLID);

  // ヘッダー（Noと名前）
  sheet.getRange(startRow, col).setValue("No: " + orderNo).setBackground("#eeeeee").setFontWeight("bold");
  sheet.getRange(startRow + 1, col).setValue(name).setFontSize(13).setFontWeight("bold");

  // 商品リスト（略称で表示）
  items.slice(0, 15).forEach((item, i) => {
    sheet.getRange(startRow + 2 + i, col).setValue("・" + item.short).setFontSize(10);
  });

  // フッター（合計金額）
  const footerRow = startRow + cardHeight - 3;
  sheet.getRange(footerRow, col).setValue(totalStr).setFontWeight("bold").setBorder(true, null, null, null, null, null);
  
  // 備考があれば最下段に
  if (note) {
    sheet.getRange(footerRow + 1, col).setValue("備考:" + note).setFontSize(8).setFontColor("#666666");
  }
}