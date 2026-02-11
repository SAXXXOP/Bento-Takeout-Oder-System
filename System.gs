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

// ★追加：シート表示/非表示（管理用は普段隠す）を Script Properties から反映
  // トグルメニューは作らない（管理者がプロパティを直接切替）
  try {
    if (typeof SheetVisibility_applyFromProps === "function") {
      SheetVisibility_applyFromProps();
    }
  } catch (e) {
    // noop
  }

  const ui = SpreadsheetApp.getUi();

  // MenuVisibility が無い環境でも壊れないようにフォールバック
  const vis = (typeof MenuVisibility !== "undefined" && MenuVisibility)
    ? MenuVisibility
    : {
        showAdvanced: () => true,
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
    .addItem('日次準備（当日まとめ予約札：指定日まとめて）', 'runDailyPrepPrompt')
    .addSubMenu(
      ui.createMenu('★要確認')
        .addItem('ワークフロー（サイドバー）', 'showNeedsCheckWorkflowSidebar')
        .addItem('一覧を開く（更新して開く）', 'openNeedsCheckView')
    );

  // ★詳細：単体の再実行（Advanced のときだけ表示）
  if (vis.showAdvanced && vis.showAdvanced()) {
    menu.addSubMenu(
      ui.createMenu('再実行（単体）')
        .addItem('当日まとめシートを更新', 'createProductionSheet')
        .addItem('指定日の予約札を作成', 'createDailyReservationCards')
    );
  }

  menu
    .addSeparator()
    .addItem('顧客備考を編集（サイドバー）', 'showCustomerEditor');

  // ===== 要確認の処理（予約No指定） =====
  if (vis.showOrderNoTools()) {
    menu
      .addSeparator()
      .addSubMenu(
        ui.createMenu('予約No指定（直接処理）')
          .addItem('有効に戻す（空欄）', 'markByOrderNoAsActive')
          .addItem('無効にする（理由必須）', 'markByOrderNoAsInvalid')
          .addItem('★要確認にする（理由必須）', 'markByOrderNoAsNeedsCheck')
          .addItem('理由だけ編集', 'editReasonByOrderNo')
      );
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
      .addSubMenu(
        ui.createMenu('ステータス（監査/復旧）')
          .addItem('理由未記入チェック', 'checkMissingReasons')
          .addItem('ステータス監査（値の件数）', 'auditStatusValues_')
          .addItem('ステータス移行（B案）', 'migrateOrderStatusToBPlan')
          .addSeparator()
          .addItem('運用ガード再適用（入力制限/色）', 'applyOrderStatusGuards')
      );
  }

  // ===== 管理（バックアップ/導入/初期設定） =====
  if (vis.showBackup && vis.showBackup()) {
    menu
      .addSeparator()
      .addSubMenu(
        ui.createMenu('バックアップ')
          .addItem('手動スナップショット作成', 'createManualSnapshot')
           .addItem('今すぐ日次バックアップ実行', 'backupSpreadsheetDaily')
          .addSeparator()
          .addItem('日次バックアップ設定（トリガー作成）', 'installDailyBackupTrigger')
          .addItem('日次バックアップ停止（トリガー削除）', 'deleteDailyBackupTrigger')
      );
  }

  if (vis.showSetupTools()) {
    menu
      .addSeparator()
      .addSubMenu(
        ui.createMenu('導入ツール')
          .addSubMenu(
            ui.createMenu('本番初期化（危険）')
              .addItem('テストデータ削除', 'initProductionCleanSheetOnly')
              .addItem('＋フォーム回答も削除', 'initProductionCleanWithFormResponses')
          )
          .addSeparator()
          .addSubMenu(
            ui.createMenu('トリガー（フォーム送信）')
              .addItem('設定', 'installFormSubmitTrigger')
              .addItem('削除', 'deleteFormSubmitTrigger')
          )
          .addSeparator()
          .addSubMenu(
            ui.createMenu('日次準備（自動化）')
              .addItem('設定（時刻/オフセット/曜日）', 'configureDailyPrepSettingsPrompt')
              .addSeparator()
              .addItem('トリガー再作成（復旧）', 'installDailyPrepTrigger')
              .addItem('トリガー削除（停止）', 'deleteDailyPrepTrigger')
          )
          .addSeparator()
          .addSubMenu(
            ui.createMenu('締切後送信通知（テスト）')
              .addItem('疎通（Ping）', 'sendLateSubmissionNotifyPing')
              .addItem('抽出（本文確認）', 'testLateSubmissionNotifyEmail')
          )
          .addSeparator()
          .addSubMenu(
            ui.createMenu('テンプレ配布（プロパティ）')
              .addItem('キー作成（未設定のみ）', 'ensureTemplateScriptProperties')
              .addItem('全てダミーで上書き', 'overwriteTemplateScriptProperties')
          )
      );
  }

  // ===== 初期設定/復旧（管理者向け） =====
  const setupRecovery = ui.createMenu('初期設定/復旧');
  let hasSetupItem = false;
  if (vis.showPropCheck && vis.showPropCheck()) {
    setupRecovery.addItem('初期設定チェック（Script Properties）', 'checkScriptProperties');
    hasSetupItem = true;
  }

  // 管理用シートの表示/非表示（管理者向け）
  if (vis.showSetupTools && vis.showSetupTools()) {
    setupRecovery.addItem('管理シート 表示/非表示（トグル）', 'SheetVisibility_toggle_ADMIN');
    hasSetupItem = true;
  }

  if (hasSetupItem) setupRecovery.addSeparator();
  setupRecovery.addItem('🔄 メニューを再表示（設定再読込）', 'reloadReservationMenu_');

  menu
    .addSeparator()
    .addSubMenu(setupRecovery);

  menu.addToUi();
}

/**
 * ★要確認ワークフロー（サイドバー）
 */
function showNeedsCheckWorkflowSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('NeedsCheckWorkflow')
    .setTitle('★要確認ワークフロー')
    .setWidth(380);
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * 互換：旧名 updateNeedsReviewList() → 現行 refreshNeedsCheckView()
 */
function updateNeedsReviewList() {
  // ★要確認一覧を更新する前に、ステータス運用ガードを適用（入力制限/色付け）
  if (typeof applyOrderStatusGuards === "function") applyOrderStatusGuards({ silent: true });
  return refreshNeedsCheckView();
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

/**
 * メニューに紐づくハンドラ関数が「存在するか」を判定
 * （未実装/未導入のメニューを自動的に非表示にするため）
 */
function menuHasHandler_(fnName) {
  try {
    const g = (typeof globalThis !== "undefined") ? globalThis : this;
    return !!(g && typeof g[fnName] === "function");
  } catch (e) {
    return false;
  }
}