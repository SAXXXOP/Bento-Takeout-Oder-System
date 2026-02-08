/**
 * DeploymentTools.gs
 * 店舗導入用：本番初期化（テストデータ削除）ツール
 *
 * - 実行前に BACKUP フォルダへスナップショット作成（Driveコピー）
 * - 削除対象の一覧を表示し、シート名入力で二重確認
 * - （任意）フォーム本体の回答も削除
 */

// ===== 公開関数（メニューから呼ぶ想定） =====

/** 本番初期化（シート側のみ） */
function initProductionCleanSheetOnly() {
  initProductionClean_({ deleteFormResponses: false });
}

/** 本番初期化（シート＋フォーム本体の回答も削除） */
function initProductionCleanWithFormResponses() {
  initProductionClean_({ deleteFormResponses: true });
}

/**
 * フォーム送信トリガーを設定（重複は削除）
 * ※コピー直後はトリガーが無い/壊れることがあるので、導入時に押せるようにする
 */
function installFormSubmitTrigger() {
  const ui = SpreadsheetApp.getUi();

  // 既存の onFormSubmit トリガーを削除（関数名一致）
  const triggers = ScriptApp.getProjectTriggers();
  let deleted = 0;
  triggers.forEach(t => {
    try {
      if (t.getHandlerFunction && t.getHandlerFunction() === "onFormSubmit") {
        ScriptApp.deleteTrigger(t);
        deleted++;
      }
    } catch (e) {}
  });

  // スプレッドシートからのフォーム送信トリガー
  ScriptApp.newTrigger("onFormSubmit")
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onFormSubmit()
    .create();

  ui.alert(`OK：フォーム送信トリガーを設定しました（既存 ${deleted} 件を削除）。`);
}

/** フォーム送信トリガーを削除 */
function deleteFormSubmitTrigger() {
  const ui = SpreadsheetApp.getUi();
  const triggers = ScriptApp.getProjectTriggers();
  let deleted = 0;

  triggers.forEach(t => {
    try {
      if (t.getHandlerFunction && t.getHandlerFunction() === "onFormSubmit") {
        ScriptApp.deleteTrigger(t);
        deleted++;
      }
    } catch (e) {}
  });

  ui.alert(`OK：フォーム送信トリガーを削除しました（${deleted}件）。`);
}

// ===== 内部実装 =====

function initProductionClean_(opt) {
  const options = opt || {};
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lock = LockService.getScriptLock();

  if (!ss) return;

  let locked = false;
  try {
    locked = lock.tryLock(20000);
    if (!locked) {
      ui.alert("NG：ロック取得に失敗しました（他の処理が実行中の可能性）。少し待って再実行してください。");
      return;
    }

    // 対象シート収集
    const targets = [];

    // 主要：注文一覧（ヘッダーを残して中身を消す）
    dt_addTargetIfExists_(targets, ss, CONFIG.SHEET.ORDER_LIST, { keepHeaderRows: 1, clearType: "CLEAR_CONTENTS_BELOW" });

    // 出力系（再生成できるので中身を消す）
    dt_addTargetIfExists_(targets, ss, CONFIG.SHEET.NEEDS_CHECK_VIEW, { clearType: "CLEAR_ALL_CONTENTS" });
    dt_addTargetIfExists_(targets, ss, CONFIG.SHEET.DAILY_SUMMARY, { clearType: "CLEAR_ALL_CONTENTS" });
    dt_addTargetIfExists_(targets, ss, CONFIG.SHEET.RESERVATION_CARD, { clearType: "CLEAR_ALL_CONTENTS" });
    dt_addTargetIfExists_(targets, ss, CONFIG.SHEET.CUSTOMER_LIST, { keepHeaderRows: 1, clearType: "CLEAR_CONTENTS_BELOW" });
    dt_addTargetIfExists_(targets, ss, "ログ", { keepHeaderRows: 1, clearType: "CLEAR_CONTENTS_BELOW" });



    // フォーム回答シート（言語差を吸収）
    ss.getSheets().forEach(sh => {
      const n = sh.getName();
      if (/^フォームの回答/.test(n) || /^Form Responses/.test(n) || /^Responses/.test(n)) {
        targets.push({ sheet: sh, label: n, keepHeaderRows: 1, clearType: "CLEAR_CONTENTS_BELOW" });
      }
    });

    // 削除予定の表示用
    const plan = targets.map(t => {
      const sh = t.sheet;
      const lastRow = sh.getLastRow();
      const lastCol = sh.getLastColumn();
      let willClearRows = 0;

      if (t.clearType === "CLEAR_CONTENTS_BELOW") {
        const keep = Math.max(0, t.keepHeaderRows || 0);
        willClearRows = Math.max(0, lastRow - keep);
      } else {
        willClearRows = lastRow; // 目安
      }

      return { name: t.label, willClearRows, lastRow, lastCol, clearType: t.clearType };
    });

    const sheetName = ss.getName();
    const msg =
      "【本番初期化（テストデータ削除）】\n" +
      "対象のスプレッドシート：\n  " + sheetName + "\n\n" +
      "削除予定（見つかったものだけ実行します）：\n" +
      plan.map(p => `- ${p.name}：${p.willClearRows} 行目安`).join("\n") +
      "\n\nこの操作は元に戻せません。\n" +
      "実行前に BACKUP へスナップショットを作成します。\n\n" +
      "続行する場合は、下に「" + sheetName + "」と正確に入力してください。";

    const r = ui.prompt("本番初期化（確認）", msg, ui.ButtonSet.OK_CANCEL);
    if (r.getSelectedButton() !== ui.Button.OK) return;

    if (String(r.getResponseText() || "").trim() !== sheetName) {
      ui.alert("中止：入力が一致しませんでした。");
      return;
    }

    // BACKUP_FOLDER_ID 未設定は安全のため中断
    const backupFolderId = String(ScriptProps.get(ScriptProps.KEYS.BACKUP_FOLDER_ID, "")).trim();
    if (!backupFolderId) {
      ui.alert("NG：BACKUP_FOLDER_ID が未設定です。\n先に Script Properties を設定してから実行してください。");
      return;
    }

    // スナップショット作成
    const snapInfo = dt_createPreInitSnapshot_(ss, backupFolderId);
    ui.alert("OK：スナップショット作成完了\n\n" + snapInfo + "\n\n続いてテストデータ削除を実行します。");

    // 削除実行
    targets.forEach(t => {
      const sh = t.sheet;
      if (!sh) return;

      // フィルタ解除（念のため）
      try {
        const f = sh.getFilter();
        if (f) f.remove();
      } catch (e) {}

      if (t.clearType === "CLEAR_CONTENTS_BELOW") {
        dt_clearContentsBelowHeader_(sh, Math.max(0, t.keepHeaderRows || 0));
      } else {
        // 値だけ消す（書式は維持）
        sh.clearContents();
      }
    });

    // フォーム本体の回答も削除（オプション）
    if (options.deleteFormResponses) {
      const formUrl = ss.getFormUrl();
      if (!formUrl) {
        ui.alert("注意：フォームが紐付いていないようです（getFormUrl が空）。フォーム回答削除はスキップしました。");
      } else {
        const rr = ui.alert(
          "フォーム回答の削除（最終確認）",
          "フォーム本体の回答も全削除します（フォームの集計も消えます）。\n本当に削除しますか？",
          ui.ButtonSet.YES_NO
        );
        if (rr === ui.Button.YES) {
          FormApp.openByUrl(formUrl).deleteAllResponses();
        }
      }
    }

    ui.alert("OK：本番初期化が完了しました。");

  } catch (e) {
    try {
      SpreadsheetApp.getUi().alert("NG：本番初期化でエラー\n" + String(e));
    } catch (ee) {}
  } finally {
    if (locked) {
      try { lock.releaseLock(); } catch (e) {}
    }
  }
}

function dt_addTargetIfExists_(arr, ss, sheetName, opt) {
  const sh = ss.getSheetByName(sheetName);
  if (!sh) return;
  arr.push({
    sheet: sh,
    label: sheetName,
    keepHeaderRows: opt && opt.keepHeaderRows,
    clearType: (opt && opt.clearType) || "CLEAR_ALL_CONTENTS"
  });
}

function dt_clearContentsBelowHeader_(sheet, headerRows) {
  const keep = Math.max(0, headerRows || 0);
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow <= keep || lastCol <= 0) return;

  const numRows = lastRow - keep;
  sheet.getRange(keep + 1, 1, numRows, lastCol).clearContent();
}

function dt_createPreInitSnapshot_(ss, backupFolderId) {
  const tz = Session.getScriptTimeZone();
  const ts = Utilities.formatDate(new Date(), tz, "yyyyMMdd_HHmmss");

  const manualFolderName = String(
    ScriptProps.get(ScriptProps.KEYS.BACKUP_MANUAL_FOLDER_NAME, "ManualSnapshots")
  ).trim();

  const name = `${ss.getName()}_before_production_init_${ts}`;

  const rootFolder = DriveApp.getFolderById(backupFolderId);
  const manualFolder = dt_getOrCreateNamedSubfolder_(rootFolder, manualFolderName);

  const srcFile = DriveApp.getFileById(ss.getId());
  srcFile.makeCopy(name, manualFolder);

  return `保存先：${manualFolderName}\nファイル名：${name}`;
}

function dt_getOrCreateNamedSubfolder_(rootFolder, name) {
  const it = rootFolder.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return rootFolder.createFolder(name);
}
