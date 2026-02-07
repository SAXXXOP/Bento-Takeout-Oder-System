/**
 * サイドバーを表示
 */
function showCustomerEditor() {
  const html = HtmlService.createHtmlOutputFromFile('CustomerForm')
    .setTitle('顧客管理エディタ')
    .setWidth(300);
  SpreadsheetApp.getUi().showSidebar(html);
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('★予約管理')
    .addItem('顧客備考を編集（サイドバー）', 'showCustomerEditor')
    .addSeparator()
    .addItem('指定日の予約札を作成', 'createDailyReservationCards')
    .addItem('当日まとめシートを更新', 'createProductionSheet')
    .addSeparator()
    .addItem('ステータス移行（B案）', 'migrateOrderStatusToBPlan')
    .addItem('ステータス運用ガード適用', 'applyOrderStatusGuards')
    .addItem('理由未記入チェック', 'checkMissingReasons')
    .addItem('ステータス監査（値の件数）', 'auditStatusValues_')
    .addSeparator()
    .addItem('★要確認一覧を開く', 'openNeedsCheckView')
    .addItem('★要確認一覧を更新', 'refreshNeedsCheckView')

    
    // ★追加：ステータス処理（予約No指定）
    .addSeparator()
    .addItem('No指定：有効に戻す（空欄）', 'markByOrderNoAsActive')
    .addItem('No指定：無効にする（理由必須）', 'markByOrderNoAsInvalid')
    .addItem('No指定：★要確認にする（理由必須）', 'markByOrderNoAsNeedsCheck')
    .addItem('No指定：理由だけ編集', 'editReasonByOrderNo')
    
    // ★追加：バックアップ（手動スナップショット）
    .addSeparator()
    .addSubMenu(
      SpreadsheetApp.getUi().createMenu('バックアップ')
        .addItem('手動スナップショット作成', 'createManualSnapshot')
    )

    // ★追加：導入ツール（安全な本番初期化）
    .addSeparator()
    .addSubMenu(
      SpreadsheetApp.getUi().createMenu('導入ツール')
        .addItem('本番初期化（テストデータ削除）', 'initProductionCleanSheetOnly')
        .addItem('本番初期化（＋フォーム回答も削除）', 'initProductionCleanWithFormResponses')
        .addSeparator()
        .addItem('フォーム送信トリガー設定', 'installFormSubmitTrigger')
        .addItem('フォーム送信トリガー削除', 'deleteFormSubmitTrigger')
    )

    .addSeparator()
    .addItem('初期設定チェック（Script Properties）', 'checkScriptProperties')
    .addToUi();
}

function checkScriptProperties() {
  const ui = SpreadsheetApp.getUi();
  const r = ScriptProps.validate();
  if (r.ok) {
    ui.alert("OK：必須の Script Properties は設定済みです。");
  } else {
    ui.alert("NG：未設定の Script Properties があります。\n\n- " + r.missing.join("\n- "));
  }
}