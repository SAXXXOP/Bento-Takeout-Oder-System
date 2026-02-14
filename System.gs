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

  // 氏名は必須にしない方針のため「氏名不一致」メニューは廃止

  // ===== 管理者メニュー：不定期メンテ / 導入時のみ =====
  // ※ネストを深くしすぎないため、各カテゴリの中は「【接頭辞】つきのフラット一覧」にする
  if (isAdmin) {
    const addGroup_ = (m, groupName, items, counterRef) => {
      const available = items.filter(([, h]) => menuHasHandler_(h));
      if (!available.length) return;
      if (counterRef.count > 0) m.addSeparator();
      available.forEach(([label, h]) => {
        m.addItem(`【${groupName}】${label}`, h);
        counterRef.count++;
      });
    };

    // --- 不定期メンテ（管理者） ---
    const maintMenu = ui.createMenu('不定期メンテ（管理者）');
    const maintCount = { count: 0 };
    addGroup_(maintMenu, 'ステータス', [
      ['理由未記入チェック', 'checkMissingReasons'],
      ['ステータス監査（値の件数）', 'auditStatusValues_'],
      ['ステータス移行（B案）', 'migrateOrderStatusToBPlan'],
      ['運用ガード再適用（入力制限/色）', 'applyOrderStatusGuards'],
    ], maintCount);
    addGroup_(maintMenu, 'バックアップ', [
      ['手動スナップショット作成', 'createManualSnapshot'],
      ['今すぐ日次バックアップ実行', 'backupSpreadsheetDaily'],
      ['日次バックアップ設定（トリガー作成）', 'installDailyBackupTrigger'],
      ['日次バックアップ停止（トリガー削除）', 'deleteDailyBackupTrigger'],
    ], maintCount);
    addGroup_(maintMenu, '日次準備（自動化）', [
      ['設定（時刻/オフセット/曜日）', 'configureDailyPrepSettingsPrompt'],
      ['トリガー再作成（復旧）', 'installDailyPrepTrigger'],
      ['トリガー削除（停止）', 'deleteDailyPrepTrigger'],
    ], maintCount);
    addGroup_(maintMenu, '運用通知（1時間まとめ）', [
      ['トリガー作成（1時間ごと）', 'installOpsNotifyHourlyTrigger'],
      ['トリガー削除', 'deleteOpsNotifyHourlyTrigger'],
      ['疎通（Ping）', 'sendOpsNotifyPing'],
      ['今すぐ送信（手動）', 'flushOpsNotifyQueueNow'],
    ], maintCount);
    addGroup_(maintMenu, '締切後送信通知（テスト）', [
      ['疎通（Ping）', 'sendLateSubmissionNotifyPing'],
      ['抽出（本文確認）', 'testLateSubmissionNotifyEmail'],
    ], maintCount);

    // --- 導入時のみ（管理者） ---
    const setupMenu = ui.createMenu('導入時のみ（管理者）');
    const setupCount = { count: 0 };
    addGroup_(setupMenu, '本番初期化（危険）', [
      ['テストデータ削除', 'initProductionCleanSheetOnly'],
      ['＋フォーム回答も削除', 'initProductionCleanWithFormResponses'],
    ], setupCount);
    addGroup_(setupMenu, 'トリガー（フォーム送信）', [
      ['設定', 'installFormSubmitTrigger'],
      ['削除', 'deleteFormSubmitTrigger'],
    ], setupCount);
   addGroup_(setupMenu, 'テンプレ配布（プロパティ）', [
      ['キー作成（未設定のみ）', 'ensureTemplateScriptProperties'],
      ['任意キーをまとめて整理（最小化）', 'cleanupAllOptionalScriptProperties'],
    ], setupCount);

    // 表示（存在するものだけ）
    if (maintCount.count > 0 || setupCount.count > 0) {
      menu.addSeparator();
      if (maintCount.count > 0) menu.addSubMenu(maintMenu);
      if (setupCount.count > 0) menu.addSubMenu(setupMenu);
    }
  }

  // ===== 初期設定/復旧（管理者向け） =====
  const setupRecovery = ui.createMenu('初期設定/復旧');
  let hasSetupItem = false;
  if (isAdmin) {
    setupRecovery.addItem('初期設定チェック（Script Properties）', 'checkScriptProperties');
    setupRecovery.addItem('現在のプロパティ一覧（マスク）', 'showCurrentProperties');
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
  try {
    const html = HtmlService
      .createHtmlOutputFromFile('NeedsCheckWorkflow')
      .setTitle('★要確認ワークフロー')
      .setWidth(420);
    SpreadsheetApp.getUi().showSidebar(html);
  } catch (e) {
    // UI の無い実行（トリガー等）では落とさない
    console.warn("showNeedsCheckWorkflowSidebar failed:", e);
  }
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