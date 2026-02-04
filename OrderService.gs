function normalizeChangeMeta_(metaOrBool, oldNo) {
  if (metaOrBool && typeof metaOrBool === "object") {
    return {
      isChange: !!metaOrBool.isChange,
      changeRequested: !!metaOrBool.changeRequested || !!oldNo,
      oldNo: String(metaOrBool.oldNo || oldNo || "").replace(/'/g, "").trim(),
      changeFailReason: String(metaOrBool.changeFailReason || "")
    };
  }
  return {
    isChange: !!metaOrBool,
    changeRequested: !!oldNo,
    oldNo: String(oldNo || "").replace(/'/g, "").trim(),
    changeFailReason: ""
  };
}

const OrderService = {
  saveOrder(reservationNo, formData, metaOrBool) {
    const sheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.SHEET.ORDER_LIST);
    if (!sheet) return;

    const oldNoRaw = String(formData.oldReservationNo || "").replace(/'/g, "").trim();
    const meta = normalizeChangeMeta_(metaOrBool, oldNoRaw);

    // 1) 旧予約は「変更が成立した時だけ」無効化
    if (meta.isChange && meta.oldNo) {
      try {
        this.updateOldReservation(sheet, meta.oldNo, reservationNo);
      } catch (err) {
        console.warn("updateOldReservation failed:", String(err));
      }
    }

    // 2) 新規行データ
    const rowData = [];
    rowData[CONFIG.COLUMN.TIMESTAMP - 1] = new Date();
    rowData[CONFIG.COLUMN.ORDER_NO - 1] = "'" + reservationNo;
    rowData[CONFIG.COLUMN.TEL - 1] = formData.phoneNumber;
    rowData[CONFIG.COLUMN.NAME - 1] = formData.userName;
    rowData[CONFIG.COLUMN.PICKUP_DATE - 1] = formData.pickupDate;
    rowData[CONFIG.COLUMN.PICKUP_DATE_RAW - 1] = formData.pickupDateRaw;
    rowData[CONFIG.COLUMN.NOTE - 1] = formData.note;
    rowData[CONFIG.COLUMN.DETAILS - 1] = formData.orderDetails;
    rowData[CONFIG.COLUMN.TOTAL_COUNT - 1] = formData.totalItems;
    rowData[CONFIG.COLUMN.TOTAL_PRICE - 1] = formData.totalPrice;
    rowData[CONFIG.COLUMN.LINE_ID - 1] = formData.userId;
    rowData[CONFIG.COLUMN.DAILY_SUMMARY - 1] = "";
    rowData[CONFIG.COLUMN.REGULAR_FLG - 1] = formData.isRegular ? "常連" : "";

    // ★B案：新規行は基本「有効＝空欄」
    rowData[CONFIG.COLUMN.STATUS - 1] =
      (meta.changeRequested && !meta.isChange) ? CONFIG.STATUS.NEEDS_CHECK : CONFIG.STATUS.ACTIVE;

    // ★理由列：要確認のときだけ入れる（運用しやすい）
    rowData[CONFIG.COLUMN.REASON - 1] =
      (meta.changeRequested && !meta.isChange)
        ? ("予約変更希望だが新規扱い：" + (meta.changeFailReason || "要確認"))
        : "";

    // ★変更元予約No（oldNoは「入ってたら」保持しておく）
    rowData[CONFIG.COLUMN.SOURCE_NO - 1] = meta.oldNo ? "'" + meta.oldNo : "";

    sheet.appendRow(rowData);
  },

  updateOldReservation(sheet, oldNo, newNo) {
    const targetNo = String(oldNo || "").replace(/'/g, "").trim();
    if (!targetNo) return;

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const range = sheet.getRange(1, CONFIG.COLUMN.ORDER_NO, lastRow, 1);
    const data = range.getValues();

    for (let i = 0; i < data.length; i++) {
      const currentNo = String(data[i][0] || "").replace(/'/g, "").trim();
      if (currentNo !== targetNo) continue;

      const rowNum = i + 1;

      // ★旧予約：無効化
      sheet.getRange(rowNum, CONFIG.COLUMN.STATUS).setValue(CONFIG.STATUS.INVALID);

      // ★理由：新Noが分かるなら入れる（後追い確認が楽）
      const reason = newNo
        ? `予約変更により無効（新予約No: ${newNo}）`
        : "予約変更により無効（再予約あり）";
      sheet.getRange(rowNum, CONFIG.COLUMN.REASON).setValue(reason);

      // 灰色化（最終列は内部日付列まで）
      sheet.getRange(rowNum, 1, 1, CONFIG.COLUMN.PICKUP_DATE_RAW).setBackground("#E0E0E0");
      return;
    }
  }
};