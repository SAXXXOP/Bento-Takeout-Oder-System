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
  // プロパティ変更（特にメニュー表示フラグ）を即反映させるため、メニュー生成前にキャッシュをクリア
  try {
    if (typeof ScriptProps !== "undefined" && ScriptProps.clearCache) ScriptProps.clearCache();
  } catch (e) {
    // noop
  }
  const ui = SpreadsheetApp.getUi();

  // MenuVisibility が無い環境でも壊れないようにフォールバック
  const vis = (typeof MenuVisibility !== "undefined" && MenuVisibility)
    ? MenuVisibility
    : {
        showOrderNoTools: () => true,
        showNameConflict: () => true,
        showStatusTools: () => true,
        showBackup: () => true,
        showSetupTools: () => true,
        showPropCheck: () => true,
      };

  const menu = ui.createMenu('★予約管理');

  // ===== 日々の運用（よく使う：朝→処理の順） =====
  menu
    .addItem('★要確認一覧を更新', 'updateNeedsReviewListWithGuards')
    .addItem('当日まとめシートを更新', 'createProductionSheet')
    .addItem('指定日の予約札を作成', 'createDailyReservationCards')
    .addItem('日次準備（当日まとめ予約札：指定日まとめて）', 'runDailyPrepPrompt')
    .addSeparator()
    .addItem('★要確認一覧を開く', 'openNeedsCheckView')
    .addItem('顧客備考を編集（サイドバー）', 'showCustomerEditor');

  // ===== 要確認の処理（予約No指定） =====
  if (vis.showOrderNoTools()) {
    menu
      .addSeparator()
      .addItem('No指定：有効に戻す（空欄）', 'markByOrderNoAsActive')
      .addItem('No指定：無効にする（理由必須）', 'markByOrderNoAsInvalid')
      .addItem('No指定：★要確認にする（理由必須）', 'markByOrderNoAsNeedsCheck')
      .addItem('No指定：理由だけ編集', 'editReasonByOrderNo');
  }

  // ===== 補助（氏名不一致） =====
  if (vis.showNameConflict()) {
    menu
      .addSeparator()
      .addSubMenu(
        ui.createMenu('氏名不一致')
          .addItem('ログを開く', 'openNameConflictLog')
          .addItem('次の1件を処理', 'resolveNextNameConflict')
      );
  }

  // ===== 補助（チェック/監査/移行） =====
  if (vis.showStatusTools()) {
    menu
      .addSeparator()
      .addItem('理由未記入チェック', 'checkMissingReasons')
      .addItem('ステータス運用ガード適用', 'applyOrderStatusGuards')
      .addItem('ステータス監査（値の件数）', 'auditStatusValues_')
      .addItem('ステータス移行（B案）', 'migrateOrderStatusToBPlan');
  }

  // ===== 管理（バックアップ/導入/初期設定） =====
  if (vis.showBackup()) {
    menu
      .addSeparator()
      .addSubMenu(
        ui.createMenu('バックアップ')
          .addItem('手動スナップショット作成', 'createManualSnapshot')
      );
  }

  if (vis.showSetupTools()) {
    menu
      .addSeparator()
      .addSubMenu(
        ui.createMenu('導入ツール')
          .addItem('本番初期化（テストデータ削除）', 'initProductionCleanSheetOnly')
          .addItem('本番初期化（＋フォーム回答も削除）', 'initProductionCleanWithFormResponses')
          .addSeparator()
          .addItem('フォーム送信トリガー設定', 'installFormSubmitTrigger')
          .addItem('フォーム送信トリガー削除', 'deleteFormSubmitTrigger')
          .addSeparator()
          .addItem('日次準備設定（時刻/オフセット/曜日）', 'configureDailyPrepSettingsPrompt')
          .addItem('日次準備トリガー設定（当日まとめ予約札）', 'installDailyPrepTrigger')
          .addItem('日次準備トリガー削除（当日まとめ予約札）', 'deleteDailyPrepTrigger')
          .addSeparator()
          .addItem('締切後送信メール通知 テスト（疎通）', 'sendLateSubmissionNotifyPing')
          .addItem('締切後送信メール通知 テスト（抽出）', 'testLateSubmissionNotifyEmail')
          .addSeparator()
          .addItem('テンプレ用プロパティ作成（未設定のみ）', 'ensureTemplateScriptProperties')
          .addItem('テンプレ用プロパティ上書き（全部ダミー）', 'overwriteTemplateScriptProperties')
      );
  }

  if (vis.showPropCheck()) {
    menu
      .addSeparator()
      .addItem('初期設定チェック（Script Properties）', 'checkScriptProperties');
  }

  // ===== 表示更新（復旧用） =====
  menu
    .addSeparator()
    .addItem('🔄 メニューを再表示（設定再読込）', 'reloadReservationMenu_');

  menu.addToUi();
}

/**
 * ★要確認一覧を更新（ステータス運用ガード適用→一覧更新の順）
 */
function updateNeedsReviewListWithGuards() {
  // 1) 先にガード適用（★要確認/無効にすべきものを最新化）
  applyOrderStatusGuards();

  // 2) その結果を踏まえて、★要確認一覧を作り直す
  updateNeedsReviewList();
}


/**
 * メニューを再表示（Script Properties の変更を反映）
 */
function reloadReservationMenu_() {
  try {
    if (typeof ScriptProps !== "undefined" && ScriptProps.clearCache) ScriptProps.clearCache();
  } catch (e) {
    // noop
  }
  onOpen();
}
