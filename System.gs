/**
 * スプレッドシートが開かれた時に実行される
 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('★予約管理')
    .addItem('顧客備考を編集（サイドバー）', 'showCustomerEditor')
    .addSeparator()
    .addItem('指定日の予約札を作成', 'createDailyReservationCards')
    .addItem('当日まとめシートを更新', 'createProductionSheet')
    .addToUi();
}

/**
 * サイドバーを表示
 */
function showCustomerEditor() {
  const html = HtmlService.createHtmlOutputFromFile('CustomerForm')
    .setTitle('顧客管理エディタ')
    .setWidth(300);
  SpreadsheetApp.getUi().showSidebar(html);
}