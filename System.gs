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
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('★予約管理')
    // ===== 日々の運用（よく使う：朝→処理の順） =====
    .addItem('★要確認一覧を更新', 'refreshNeedsCheckView')
    .addItem('当日まとめシートを更新', 'createProductionSheet')
    .addItem('指定日の予約札を作成', 'createDailyReservationCards')
    .addSeparator()
    .addItem('★要確認一覧を開く', 'openNeedsCheckView')
    .addItem('顧客備考を編集（サイドバー）', 'showCustomerEditor')

    // ===== 要確認の処理（予約No指定） =====
    .addSeparator()
    .addItem('No指定：有効に戻す（空欄）', 'markByOrderNoAsActive')
    .addItem('No指定：無効にする（理由必須）', 'markByOrderNoAsInvalid')
    .addItem('No指定：★要確認にする（理由必須）', 'markByOrderNoAsNeedsCheck')
    .addItem('No指定：理由だけ編集', 'editReasonByOrderNo')

    // ===== 補助（氏名不一致） =====
    .addSeparator()
    .addSubMenu(
      ui.createMenu('氏名不一致')
        .addItem('ログを開く', 'openNameConflictLog')
        .addItem('次の1件を処理', 'resolveNextNameConflict')
    )

    // ===== 補助（チェック/監査/移行） =====
    .addSeparator()
    .addItem('理由未記入チェック', 'checkMissingReasons')
    .addItem('ステータス運用ガード適用', 'applyOrderStatusGuards')
    .addItem('ステータス監査（値の件数）', 'auditStatusValues_')
    .addItem('ステータス移行（B案）', 'migrateOrderStatusToBPlan')

    // ===== 管理（バックアップ/導入/初期設定） =====
    .addSeparator()
    .addSubMenu(
      ui.createMenu('バックアップ')
        .addItem('手動スナップショット作成', 'createManualSnapshot')
    )
    .addSeparator()
    .addSubMenu(
      ui.createMenu('導入ツール')
        .addItem('本番初期化（テストデータ削除）', 'initProductionCleanSheetOnly')
        .addItem('本番初期化（＋フォーム回答も削除）', 'initProductionCleanWithFormResponses')
        .addSeparator()
        .addItem('フォーム送信トリガー設定', 'installFormSubmitTrigger')
        .addItem('フォーム送信トリガー削除', 'deleteFormSubmitTrigger')
        .addSeparator()
        .addItem('テンプレ用プロパティ作成（未設定のみ）', 'ensureTemplateScriptProperties')
        .addItem('テンプレ用プロパティ上書き（全部ダミー）', 'overwriteTemplateScriptProperties')
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