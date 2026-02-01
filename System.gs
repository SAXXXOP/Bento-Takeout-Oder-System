function onOpen() {
  SpreadsheetApp.getUi().createMenu('★予約管理')
    .addItem('顧客備考を編集（サイドバー）', 'showCustomerEditor') // これを追加
    .addSeparator()
    .addItem('指定日の予約札を作成(4列)', 'createDailyReservationCards')
    .addItem('指定日の当日まとめを作成', 'createProductionSheet')
    .addToUi();
}

function showCustomerEditor() {
  const html = HtmlService.createTemplateFromFile('CustomerForm')
    .evaluate()
    .setTitle('顧客備考の編集')
    .setWidth(300);
  SpreadsheetApp.getUi().showSidebar(html);
}