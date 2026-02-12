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
      isAdmin: () => true,
        getRoleInfo: () => ({ isAdmin: true, mode: "fallback" }),
        showAdvanced: () => true,
      };

  // “管理者/閲覧者” 判定（MenuVisibility が無い場合は管理者扱い）
  const isAdmin = (vis && typeof vis.isAdmin === "function")
    ? !!vis.isAdmin()
    : (vis && typeof vis.showAdvanced === "function" ? !!vis.showAdvanced() : true);

  // ★変更：シート表示/非表示を「管理者/閲覧者」判定と同期
  try {
    if (typeof SheetVisibility_applyByRole_ === "function") {
      SheetVisibility_applyByRole_(isAdmin);
    }
  } catch (e) {
    // 失敗を握りつぶさずログに残す（原因確定用）
    try {
      logToSheet("ERROR", "SheetVisibility onOpen failed", {
        isAdmin,
        err: String(e),
        stack: e && e.stack ? String(e.stack) : ""
      });
    } catch (_) {}
  }


  const menu = ui.createMenu('★予約管理');

  // ===== 日々の運用（よく使う：朝→処理の順） =====
  menu
    .addItem('日次準備（当日まとめ予約札：指定日まとめて）', 'runDailyPrepPrompt')
    .addSubMenu(
      ui.createMenu('★要確認')
        .addItem('ワークフロー（サイドバー）', 'showNeedsCheckWorkflowSidebar')
        .addItem('一覧を開く（更新して開く）', 'openNeedsCheckView')
    );

  // ★単体の再実行：日次準備のリカバリ用（常に表示）
  const rerunMenu = ui.createMenu('再実行（単体）');
  let hasRerunItem = false;
  if (menuHasHandler_('createProductionSheet')) {
    rerunMenu.addItem('当日まとめシートを更新', 'createProductionSheet');
    hasRerunItem = true;
  }
  if (menuHasHandler_('createDailyReservationCards')) {
    rerunMenu.addItem('指定日の予約札を作成', 'createDailyReservationCards');
    hasRerunItem = true;
  }
  if (hasRerunItem) menu.addSubMenu(rerunMenu);

  menu
    .addSeparator()
    .addItem('顧客備考を編集（サイドバー）', 'showCustomerEditor');

  // ===== 要確認の処理（予約No指定） =====
  if (isAdmin) {
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
  if (isAdmin) {
    menu
      .addSeparator()
      .addSubMenu(
        ui.createMenu('氏名不一致')
          .addItem('ログを開く', 'openNameConflictLog')
          .addItem('次の1件を処理', 'resolveNextNameConflict')
      );
  }

  // ===== 補助（チェック/監査/移行） =====
  if (isAdmin) {
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
  if (isAdmin) {
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

  if (isAdmin) {
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
              .addSeparator()
              .addItem('バックアップ項目を整理（任意キー削除）', 'cleanupBackupScriptProperties')
          )
      );
  }

  // ===== 初期設定/復旧（管理者向け） =====
  const setupRecovery = ui.createMenu('初期設定/復旧');
  let hasSetupItem = false;
  if (isAdmin) {
    setupRecovery.addItem('初期設定チェック（Script Properties）', 'checkScriptProperties');
    hasSetupItem = true;
  }

  // 誰でも見れる（判定の見える化）
  setupRecovery.addItem('権限チェック（管理者/閲覧者）', 'showMenuRoleInfo');

  setupRecovery.addSeparator();
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
 * 権限チェック（管理者/閲覧者 判定の見える化）
 */
function showMenuRoleInfo() {
  const ui = SpreadsheetApp.getUi();
  try {
    const info = (typeof MenuVisibility !== "undefined" && MenuVisibility && typeof MenuVisibility.getRoleInfo === "function")
      ? MenuVisibility.getRoleInfo()
      : { isAdmin: true, mode: "no MenuVisibility" };

    const lines = [
      `判定：${info.isAdmin ? "管理者" : "閲覧者"}`,
      info.mode ? `mode: ${info.mode}` : null,
      info.userEmail ? `user: ${info.userEmail}` : null,
      info.activeEmail ? `active: ${info.activeEmail}` : null,
      info.effectiveEmail ? `effective: ${info.effectiveEmail}` : null,
      info.ownerEmail ? `owner: ${info.ownerEmail}` : null,
      (info.adminEmails && info.adminEmails.length) ? `ADMIN_EMAILS: ${info.adminEmails.join(", ")}` : "ADMIN_EMAILS: (empty)",
      (!info.userEmail) ? "※ user email が取れない環境では MENU_SHOW_ADVANCED がフォールバックになります" : null,
    ].filter(Boolean);

    ui.alert(lines.join("\n"));
  } catch (e) {
    ui.alert("権限チェックに失敗しました: " + (e && e.message ? e.message : e));
  }
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