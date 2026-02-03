function drawDynamicCard(sheet, startRow, col, card) {
  const { rowData, items, customer, height } = card;

  const orderNo = (rowData[CONFIG.COLUMN.ORDER_NO - 1] || "").toString().replace(/'/g, "");
  const isRegular = rowData[CONFIG.COLUMN.REGULAR_FLG - 1] === "常連";
  const name = (isRegular ? "★ " : "") + (rowData[CONFIG.COLUMN.NAME - 1] || "不明") + " 様";

  const telRaw = (rowData[CONFIG.COLUMN.TEL - 1] || "").toString().replace(/'/g, "").trim();
  const telLine = telRaw ? ("TEL: " + telRaw) : ""; // 電話が無ければ空欄

  const totalStr =
    "計:" +
    (rowData[CONFIG.COLUMN.TOTAL_COUNT - 1] || 0) +
    "点 / " +
    Number(rowData[CONFIG.COLUMN.TOTAL_PRICE - 1] || 0).toLocaleString() +
    "円";

  const formNote = (rowData[CONFIG.COLUMN.NOTE - 1] || "").toString();
  const fullNoteText = formNote ? "【要】" + formNote : "";
  const fullSpecialNoteText = (customer && customer.specialNote) ? "【注】" + customer.specialNote : "";

  const status = rowData[CONFIG.COLUMN.STATUS - 1];
  const srcNo = String(rowData[CONFIG.COLUMN.SOURCE_NO - 1] || "").replace(/'/g, "").trim();

  let r = startRow;

  // 外枠（塗りつぶし無し、黒罫線）
  sheet.getRange(startRow, col, height, 1)
    .setBorder(true, true, true, true, null, null, "#000000", SpreadsheetApp.BorderStyle.SOLID);

  // 1) 予約番号
  sheet.getRange(r++, col)
    .setValue("No: " + orderNo)
    .setFontColor("#000000")
    .setFontWeight("bold")
    .setFontSize(10);

  // 2) 要確認（予約番号の下に1行）
  if (status === CONFIG.STATUS.NEEDS_CHECK) {
    const text = srcNo ? "要確認（元No:" + srcNo + "）" : "要確認";
    sheet.getRange(r++, col)
      .setValue(text)
      .setFontColor("#000000")
      .setFontWeight("bold")
      .setFontSize(10);
  }

  // 3) 名前
  sheet.getRange(r++, col)
    .setValue(name)
    .setFontColor("#000000")
    .setFontWeight("bold")
    .setFontSize(11);

  // 4) 電話（ないときは空欄）
  sheet.getRange(r++, col)
    .setValue(telLine)
    .setFontColor("#000000")
    .setFontSize(9);

  // 5) 商品
  (items || []).forEach(it => {
    sheet.getRange(r++, col)
      .setValue(it.short || "")
      .setFontColor("#000000")
      .setFontSize(10);
  });

  // 6) 計（商品より後）
  sheet.getRange(r++, col)
    .setValue(totalStr)
    .setFontColor("#000000")
    .setFontWeight("bold")
    .setFontSize(10);

  // 7) 前回（なければ行削除 = 書かない）
  if (customer && customer.historyLabel) {
    sheet.getRange(r++, col)
      .setValue(customer.historyLabel)
      .setFontColor("#000000")
      .setFontSize(8);
  }

  // 8) 【注】（黒文字）
  if (fullSpecialNoteText) {
    for (let i = 0; i < fullSpecialNoteText.length; i += 20) {
      const chunk = fullSpecialNoteText.substring(i, i + 20);
      sheet.getRange(r++, col)
        .setValue(chunk)
        .setFontColor("#000000")
        .setFontWeight("bold")
        .setFontSize(9);
    }
  }

  // 9) 【要】（黒文字）
  if (fullNoteText) {
    for (let i = 0; i < fullNoteText.length; i += 20) {
      const chunk = fullNoteText.substring(i, i + 20);
      sheet.getRange(r++, col)
        .setValue(chunk)
        .setFontColor("#000000")
        .setFontSize(8);
    }
  }

  // 余り行が出たときのゴミ消し（安全策）
  if (r < startRow + height) {
    sheet.getRange(r, col, (startRow + height) - r, 1).clearContent();
  }
}