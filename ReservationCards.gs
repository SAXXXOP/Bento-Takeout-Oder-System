/**
 * 予約札作成メイン処理
 */
function createDailyReservationCards() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const reportSheet = ss.getSheetByName(CONFIG.SHEET.ORDER_LIST);
  const cardSheet = ss.getSheetByName(CONFIG.SHEET.RESERVATION_CARD);
  const menuSheet = ss.getSheetByName(CONFIG.SHEET.MENU_MASTER);
  
  if (!reportSheet || !cardSheet) return;

  // --- 1. メニューマスタから「略称(F列)」をマッピング ---
  const menuMap = {};
  if (menuSheet) {
    const mData = menuSheet.getDataRange().getValues();
    mData.slice(1).forEach(r => {
      const menuName = r[CONFIG.MENU_COLUMN.MENU_NAME - 1] ? r[CONFIG.MENU_COLUMN.MENU_NAME - 1].toString().trim() : "";
      const subMenu = r[CONFIG.MENU_COLUMN.SUB_MENU - 1] ? r[CONFIG.MENU_COLUMN.SUB_MENU - 1].toString().trim() : "";
      const shortName = r[CONFIG.MENU_COLUMN.SHORT_NAME - 1] ? r[CONFIG.MENU_COLUMN.SHORT_NAME - 1].toString().trim() : "";
      
      if (!menuName) return;

      // 【重要】ID 5, 10, 15 等の「小メニューが空」の項目は、
      // 注文詳細の商品名と一致させないためにマッピングの対象外にするか、
      // 既にデータがある場合は上書きしないようにします。
      const fullNameKey = subMenu ? `${menuName}(${subMenu})` : menuName;
      
      // 略称が設定されており、かつ（小メニューがある、またはまだ登録がない）場合にセット
      if (shortName && (subMenu !== "" || !menuMap[fullNameKey])) {
        menuMap[fullNameKey] = {
          short: shortName,
          group: r[CONFIG.MENU_COLUMN.GROUP - 1] || "999"
        };
      }
    });
  }

  // --- 2. 予約データの抽出と略称変換 ---
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
    if (isActive && dateVal && dateVal.toString().replace(/[^0-9]/g, "").includes(targetDateRaw)) {
      
      const rawDetails = row[CONFIG.COLUMN.DETAILS - 1] || "";
      let lines = rawDetails.toString().split('\n').filter(l => l.trim() !== "");
      
      let items = lines.map(line => {
        // 【重要】既存の「・」を正規表現で除去してから処理する
        const cleanLine = line.replace(/^[・└\s]+/, "").trim();
        
        const parts = cleanLine.split(/\s*x\s*/);
        const namePart = parts[0].trim();
        const qtyPart = parts[1] ? "x" + parts[1] : "";
        
        // 注文一覧が既に略称になっているため、そのまま使用
        // マスタとの再照合は、グループ順ソートのために行います
        const mInfo = menuMap[namePart] || { short: namePart, group: "999" };
        return { short: mInfo.short + " " + qtyPart, group: mInfo.group };
      });

      // グループ順にソート
      items.sort((a, b) => String(a.group).localeCompare(String(b.group)));
      cardsToPrint.push({ row: row, items: items });
    }
  });

  // --- 3. 描画処理 ---
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
  cardSheet.activate();
}

/**
 * 描画補助関数
 */
function drawFinalCard(sheet, startRow, col, row, items, cardHeight) {
  const orderNo = (row[CONFIG.COLUMN.ORDER_NO - 1] || "").toString().replace(/'/g, "");
  const name = (row[CONFIG.COLUMN.NAME - 1] || "不明") + " 様";
  const totalStr = "計:" + row[CONFIG.COLUMN.TOTAL_COUNT - 1] + "点 / " + Number(row[CONFIG.COLUMN.TOTAL_PRICE - 1]).toLocaleString() + "円";
  const note = row[CONFIG.COLUMN.NOTE - 1] || "";

  // 枠とヘッダー
  sheet.getRange(startRow, col, cardHeight - 1, 1).setBorder(true, true, true, true, null, null, "#444444", SpreadsheetApp.BorderStyle.SOLID);
  sheet.getRange(startRow, col).setValue("No: " + orderNo).setBackground("#eeeeee").setFontWeight("bold");
  sheet.getRange(startRow + 1, col).setValue(name).setFontSize(13).setFontWeight("bold");

  // 商品リスト（ここで「・」を1つだけ付与）
  items.slice(0, 15).forEach((item, i) => {
    sheet.getRange(startRow + 2 + i, col).setValue("・" + item.short).setFontSize(10);
  });

  // フッター
  const footerRow = startRow + cardHeight - 3;
  sheet.getRange(footerRow, col).setValue(totalStr).setFontWeight("bold").setBorder(true, null, null, null, null, null);
  if (note) {
    sheet.getRange(footerRow + 1, col).setValue("備考:" + note).setFontSize(8).setFontColor("#666666");
  }
}