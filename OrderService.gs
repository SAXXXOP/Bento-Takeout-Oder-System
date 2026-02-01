const OrderService = (() => {

  function save(r) {
    const ss = SpreadsheetApp.getActive();
    const sheet = ss.getSheetByName("注文一覧");

    sheet.appendRow([
      new Date(),
      "'" + r.reservationNo,
      r.phone,
      r.userName,
      `${r.pickupDate} / ${r.pickupTime}`,
      r.note,
      formatItems(r.items),
      r.totalItems,
      r.totalPrice,
      r.userId,
      formatGroup(r.groupSummary),
      "",
      r.isChange ? "変更後" : "通常",
      ""
    ]);
  }

  function formatItems(items) {
    return items.map(i => `・${i.name} x ${i.count}`).join("\n");
  }

  function formatGroup(gs) {
    return Object.entries(gs).map(([k, v]) => `${k}:${v}`).join("\n");
  }

  return { save };

})();
