function createDailyReservationCards() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const reportSheet = ss.getSheetByName("注文一覧");
  const cardSheet = ss.getSheetByName("予約札");
  const customerSheet = ss.getSheetByName("顧客名簿");
  if (!reportSheet || !cardSheet) return;

  // --- 1. 顧客名簿から調理用備考(H列)をマッピング ---
  const customerMap = {};
  if (customerSheet) {
    const cData = customerSheet.getDataRange().getValues();
    cData.slice(1).forEach(r => {
      const lineId = r[0];
      if (!lineId) return;
      customerMap[lineId] = {
        specialNote: r[7] || "", // H列: 調理用備考（アレルギー等）
        historyLabel: r[9] ? "前回: " + r[9].split(" ")[0] : "" // J列以降から日付を取得（適宜調整）
      };
    });
  }
  
  const ui = SpreadsheetApp.getUi();
  const response = ui.prompt('予約札作成', '日付を入力(例: 1/30)', ui.ButtonSet.OK_CANCEL);
  if (response.getSelectedButton() !== ui.Button.OK) return;
  const targetDateRaw = response.getResponseText().replace(/[^0-9]/g, "");
  
  const lastRow = reportSheet.getLastRow();
  if (lastRow < 2) return;
  const allData = reportSheet.getRange(2, 1, lastRow - 1, 12).getValues();
  
  cardSheet.clear().clearFormats();
  let currentRow = 1, currentCol = 1;
  const COL_COUNT = 3; 

  for (let i = 0; i < allData.length; i++) {
    const row = allData[i];
    if (row[4].toString().replace(/[^0-9]/g, "") === targetDateRaw) {
      
      const lineId = row[9]; // J列: LINE ID
      const cInfo = customerMap[lineId] || { specialNote: "", historyLabel: "" };

      let displayName = (row[11] === "常連") ? "★ " + row[3] + " 様" : row[3] + " 様";
      let tel = row[2].toString().replace("'", "");
      
      // --- 備考欄の作成 (名簿備考 + フォーム要望) ---
      const alertText = cInfo.specialNote ? "【注】" + cInfo.specialNote : "";
      const formRequest = row[5] ? "【要望】" + row[5] : ""; // F列: ご要望

      const cardData = [
        ["No: " + row[1]], 
        [displayName],
        ["TEL: " + (tel || "なし")],
        [row[6].toString()], // 注文詳細
        ["計:" + row[7] + "点 / " + row[8].toLocaleString() + "円"],
        [alertText],         // ★名簿からの注意（赤太字）
        [formRequest],       // ★フォームからの要望（通常表示）
        [cInfo.historyLabel],
        [""] 
      ];
      
      const range = cardSheet.getRange(currentRow, currentCol, cardData.length, 1);
      range.setValues(cardData).setWrap(true).setVerticalAlignment("top").setFontSize(10);
      
      // スタイル設定
      cardSheet.getRange(currentRow, currentCol).setFontSize(14).setFontWeight("bold"); // No
      cardSheet.getRange(currentRow + 1, currentCol).setFontSize(12).setFontWeight("bold"); // 名前
      cardSheet.getRange(currentRow + 4, currentCol).setFontWeight("bold"); // 合計
      
      // ★名簿の注意情報を赤太字にする
      const alertRange = cardSheet.getRange(currentRow + 5, currentCol);
      alertRange.setFontColor("#ff0000").setFontWeight("bold").setFontSize(11);
      
      // ★要望は通常の太さ、少し小さめに（混同を防ぐ）
      cardSheet.getRange(currentRow + 6, currentCol).setFontSize(9).setFontColor("#333333");

      // 履歴はさらに小さく
      cardSheet.getRange(currentRow + 7, currentCol).setFontSize(8).setFontColor("#666666");

      cardSheet.getRange(currentRow, currentCol, cardData.length - 1, 1)
               .setBorder(true, true, true, true, null, null, "#666666", SpreadsheetApp.BorderStyle.SOLID);

      if (currentCol < COL_COUNT) { 
        currentCol++; 
      } else { 
        currentCol = 1; 
        currentRow += cardData.length; 
      }
    }
  }

  for(let c=1; c<=COL_COUNT; c++) cardSheet.setColumnWidth(c, 240);
  cardSheet.autoResizeRows(1, cardSheet.getMaxRows());
  cardSheet.activate();
}