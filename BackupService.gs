/**
 * BackupService.gs（完成版）
 * 運用方針：日次60日＋月次12ヶ月
 *
 * ■事前準備（必須）
 * - Googleドライブに「バックアップ保存用フォルダ（親）」を作成
 * - Script Properties に保存：
 *   BACKUP_FOLDER_ID = <親フォルダID>
 *
 * ■推奨設定（Script Properties）
 * - BACKUP_DAILY_RETENTION_DAYS = 60        // 日次を何日残すか（未設定なら60）
 * - BACKUP_MONTHLY_RETENTION_MONTHS = 12   // 月次を何ヶ月残すか（未設定なら12）
 * - BACKUP_USE_MONTHLY_FOLDER = 1          // 1=日次を Backups_YYYYMM フォルダへ、0=親フォルダ直下
 * - BACKUP_DAILY_FOLDER_KEEP_MONTHS = 3    // 古い Backups_YYYYMM フォルダの掃除（月）。安全のため「空フォルダのみ」ゴミ箱へ
 * - BACKUP_MONTHLY_FOLDER_NAME = MonthlySnapshots // 月次スナップショット保存フォルダ名（親直下に作成）
 * - BACKUP_AT_HOUR = 3                     // トリガー実行時刻（installDailyBackupTriggerで使用）
 *
 */

function backupSpreadsheetDaily() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) return;

  try {
    // UIが使える（手動実行）なら通知。トリガー実行では取得できないのでnullのまま
    let ui = null;
    try { ui = SpreadsheetApp.getUi(); } catch (e) {}

    const folderId = String(ScriptProps.get(ScriptProps.KEYS.BACKUP_FOLDER_ID, "")).trim();
    if (!folderId) {
      throw new Error("BACKUP_FOLDER_ID が未設定です（Script Properties に親フォルダIDを入れてください）。");
    }

    // ▼運用方針：日次60日 + 月次12ヶ月
    const dailyRetentionDays = ScriptProps.getInt(
      ScriptProps.KEYS.BACKUP_DAILY_RETENTION_DAYS,
      60
    );
    const monthlyRetentionMonths = ScriptProps.getInt(ScriptProps.KEYS.BACKUP_MONTHLY_RETENTION_MONTHS, 12);

    const useMonthly = ScriptProps.getBool(ScriptProps.KEYS.BACKUP_USE_MONTHLY_FOLDER, true);
    const keepDailyFolderMonths = ScriptProps.getInt(ScriptProps.KEYS.BACKUP_DAILY_FOLDER_KEEP_MONTHS, 3);
    const monthlyFolderName = String(ScriptProps.get(ScriptProps.KEYS.BACKUP_MONTHLY_FOLDER_NAME, "MonthlySnapshots"));

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      throw new Error("アクティブなスプレッドシートが取得できません（コンテナバインドで実行してください）。");
    }

    const tz = Session.getScriptTimeZone();
    const ts = Utilities.formatDate(new Date(), tz, "yyyyMMdd_HHmmss");
    const dailyPrefix = `${ss.getName()}_backup_`;
    const dailyBackupName = `${dailyPrefix}${ts}`;

    const rootFolder = DriveApp.getFolderById(folderId);
    const srcFile = DriveApp.getFileById(ss.getId());
    const originalFormId = getFormIdFromUrl_(ss.getFormUrl()); // 元フォームID（誤移動防止用）


    // 当月フォルダ（なければ作成）：日次バックアップの置き場
    const targetFolder = useMonthly ? getOrCreateMonthlyFolder_(rootFolder) : rootFolder;

    // 1) 日次バックアップ作成（スプレッドシート丸ごとコピー）
    const copiedDaily = srcFile.makeCopy(dailyBackupName, targetFolder);
    moveAutoCopiedFormToFolder_(originalFormId, copiedDaily.getId(), targetFolder, `${dailyBackupName}_FORM`);

    // 2) 日次バックアップを「直近N日」だけ残す（Backups_YYYYMM を横断して掃除）
    purgeOldDailyBackupsUnderRoot_(rootFolder, dailyPrefix, dailyRetentionDays);

    // 3) 月次スナップショット：当月分が無ければ1個作る（MonthlySnapshots フォルダ）
    ensureMonthlySnapshot_(rootFolder, srcFile, ss.getName(), monthlyFolderName, originalFormId);

    // 4) 月次スナップショットを「直近Nヶ月」だけ残す
    purgeOldMonthlySnapshots_(rootFolder, ss.getName(), monthlyFolderName, monthlyRetentionMonths);

    // 5) 古い Backups_YYYYMM フォルダを整理（任意・安全のため空フォルダのみ）
    if (useMonthly && keepDailyFolderMonths > 0) {
      purgeOldMonthFolders_(rootFolder, keepDailyFolderMonths);
    }

     // 手動実行時だけ結果が見えるように
    if (ui) {
      ui.alert(
        `OK：日次バックアップを作成しました。\n保存先：${targetFolder.getName()}\nファイル名：${dailyBackupName}`
      );
    }

  } catch (e) {
    console.error("backupSpreadsheetDaily error:", String(e), e && e.stack);
    try { SpreadsheetApp.getUi().alert(`NG：日次バックアップに失敗しました。\n${String(e)}`); } catch (ee) {}
  } finally {
    lock.releaseLock();
  }
}

/**
 * 毎日バックアップのトリガーを設定（重複は削除）
 */
function installDailyBackupTrigger() {
  const atHour = ScriptProps.getInt(ScriptProps.KEYS.BACKUP_AT_HOUR, 3);

  deleteDailyBackupTriggers_();

  ScriptApp.newTrigger("backupSpreadsheetDaily")
    .timeBased()
    .everyDays(1)
    .atHour(Math.min(23, Math.max(0, atHour)))
    .create();

  SpreadsheetApp.getUi().alert(`OK：日次バックアップを設定しました（毎日 ${atHour}:00 頃）。`);
}

/**
 * バックアップ用トリガーを削除
 */
function deleteDailyBackupTrigger() {
  const n = deleteDailyBackupTriggers_();
  SpreadsheetApp.getUi().alert(`OK：バックアップトリガーを削除しました（${n}件）。`);
}

function deleteDailyBackupTriggers_() {
  const triggers = ScriptApp.getProjectTriggers();
  let deleted = 0;

  triggers.forEach(t => {
    if (t.getHandlerFunction && t.getHandlerFunction() === "backupSpreadsheetDaily") {
      ScriptApp.deleteTrigger(t);
      deleted++;
    }
  });

  return deleted;
}

/**
 * 日次バックアップ用：当月（yyyyMM）のフォルダ Backups_YYYYMM を取得/作成
 */
function getOrCreateMonthlyFolder_(rootFolder) {
  const tz = Session.getScriptTimeZone();
  const yyyymm = Utilities.formatDate(new Date(), tz, "yyyyMM");
  const folderName = `Backups_${yyyymm}`;

  const it = rootFolder.getFoldersByName(folderName);
  if (it.hasNext()) return it.next();

  return rootFolder.createFolder(folderName);
}

/**
 * 古い月フォルダ（Backups_YYYYMM）を整理
 * 安全のため「空フォルダのみ」ゴミ箱へ
 */
function purgeOldMonthFolders_(rootFolder, keepMonths) {
  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - (Math.max(1, keepMonths) - 1), 1);

  const it = rootFolder.getFolders();
  let trashed = 0;

  while (it.hasNext()) {
    const f = it.next();
    const name = f.getName();
    const m = name.match(/^Backups_(\d{6})$/);
    if (!m) continue;

    const yyyymm = m[1];
    const y = parseInt(yyyymm.slice(0, 4), 10);
    const mo = parseInt(yyyymm.slice(4, 6), 10) - 1;

    const firstDay = new Date(y, mo, 1);
    if (firstDay < cutoff) {
      const hasFiles = f.getFiles().hasNext();
      const hasFolders = f.getFolders().hasNext();
      if (!hasFiles && !hasFolders) {
        f.setTrashed(true);
        trashed++;
      }
    }
  }

  console.log(`purgeOldMonthFolders_: trashed=${trashed}`);
}

/**
 * 日次バックアップを「直近 retentionDays 日」だけ残す
 * root直下 & Backups_YYYYMM を横断して掃除（名前prefix一致で判定）
 */
function purgeOldDailyBackupsUnderRoot_(rootFolder, prefix, retentionDays) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - Math.max(1, retentionDays));

  let trashed = 0;

  // 1) root直下（BACKUP_USE_MONTHLY_FOLDER=0 の場合に備える）
  {
    const it = rootFolder.getFiles();
    while (it.hasNext()) {
      const f = it.next();
      const name = f.getName();
      if (!name.startsWith(prefix)) continue;

      const created = f.getDateCreated();
      if (created && created < cutoff) {
        f.setTrashed(true);
        trashed++;
      }
    }
  }

  // 2) Backups_YYYYMM フォルダ配下（BACKUP_USE_MONTHLY_FOLDER=1 の場合）
  {
    const folders = rootFolder.getFolders();
    while (folders.hasNext()) {
      const folder = folders.next();
      if (!/^Backups_\d{6}$/.test(folder.getName())) continue;

      const it = folder.getFiles();
      while (it.hasNext()) {
        const f = it.next();
        const name = f.getName();
        if (!name.startsWith(prefix)) continue;

        const created = f.getDateCreated();
        if (created && created < cutoff) {
          f.setTrashed(true);
          trashed++;
        }
      }
    }
  }

  console.log(`purgeOldDailyBackupsUnderRoot_: trashed=${trashed}`);
}

function getOrCreateNamedSubfolder_(rootFolder, name) {
  const it = rootFolder.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return rootFolder.createFolder(name);
}

/**
 * 月次スナップショット：当月（YYYYMM）の1個だけ作る（既にあれば作らない）
 * 保存先：root / <monthlyFolderName>（デフォルト MonthlySnapshots）
 * ファイル名：<ssName>_monthly_YYYYMM
 */
function ensureMonthlySnapshot_(rootFolder, srcFile, ssName, monthlyFolderName, originalFormId) {
  const tz = Session.getScriptTimeZone();
  const yyyymm = Utilities.formatDate(new Date(), tz, "yyyyMM");

  const folder = getOrCreateNamedSubfolder_(rootFolder, monthlyFolderName);
  const snapshotName = `${ssName}_monthly_${yyyymm}`;

  if (folder.getFilesByName(snapshotName).hasNext()) return;
  const copiedMonthly = srcFile.makeCopy(snapshotName, folder);
  moveAutoCopiedFormToFolder_(originalFormId, copiedMonthly.getId(), folder, `${snapshotName}_FORM`);
}

/**
 * 月次スナップショットを「直近 keepMonths ヶ月」だけ残す
 * 対象：root/<monthlyFolderName> 内の <ssName>_monthly_YYYYMM
 */
function purgeOldMonthlySnapshots_(rootFolder, ssName, monthlyFolderName, keepMonths) {
  const folder = getOrCreateNamedSubfolder_(rootFolder, monthlyFolderName);

  const now = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - (Math.max(1, keepMonths) - 1), 1);

  const prefix = `${ssName}_monthly_`;
  const it = folder.getFiles();
  let trashed = 0;

  while (it.hasNext()) {
    const f = it.next();
    const name = f.getName();
    if (!name.startsWith(prefix)) continue;

    const yyyymm = name.substring(prefix.length);
    if (!/^\d{6}$/.test(yyyymm)) continue;

    const y = parseInt(yyyymm.slice(0, 4), 10);
    const mo = parseInt(yyyymm.slice(4, 6), 10) - 1;
    const firstDay = new Date(y, mo, 1);

    if (firstDay < cutoff) {
      f.setTrashed(true);
      trashed++;
    }
  }

  console.log(`purgeOldMonthlySnapshots_: trashed=${trashed}`);
}

/**
 * 手動スナップショット（作業前などに1回保存）
 * - 保存先：BACKUP_FOLDER_ID 配下のフォルダ（デフォルト "ManualSnapshots"）
 * - ファイル名：<SS名>_manual_yyyyMMdd_HHmmss_<任意メモ>
 *
 * Script Properties（任意）：
 * - BACKUP_MANUAL_FOLDER_NAME = ManualSnapshots
 */
function createManualSnapshot() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30 * 1000)) return;

  try {
    const folderId = String(ScriptProps.get(ScriptProps.KEYS.BACKUP_FOLDER_ID, "")).trim();
    const manualFolderName = String(ScriptProps.get(ScriptProps.KEYS.BACKUP_MANUAL_FOLDER_NAME, "ManualSnapshots")).trim();

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error("アクティブなスプレッドシートが取得できません（コンテナバインドで実行してください）。");

    // 任意メモ（UIが使えるときだけ）
    let note = "";
    try {
      const ui = SpreadsheetApp.getUi();
      const res = ui.prompt("手動スナップショット", "メモ（任意：例）改修前 / 締め処理前", ui.ButtonSet.OK_CANCEL);
      if (res.getSelectedButton() === ui.Button.CANCEL) return;
      note = String(res.getResponseText() || "").trim();
    } catch (e) {
      // トリガー実行などでUI不可の場合は無視
      note = "";
    }

    const tz = Session.getScriptTimeZone();
    const ts = Utilities.formatDate(new Date(), tz, "yyyyMMdd_HHmmss");

    const safeNote = note ? "_" + sanitizeFileToken_(note).slice(0, 40) : "";
    const name = `${ss.getName()}_manual_${ts}${safeNote}`;

    const rootFolder = DriveApp.getFolderById(folderId);
    const manualFolder = getOrCreateNamedSubfolder_(rootFolder, manualFolderName);
    const srcFile = DriveApp.getFileById(ss.getId());
    const originalFormId = getFormIdFromUrl_(ss.getFormUrl()); // 元フォームID

    const copiedManual = srcFile.makeCopy(name, manualFolder);
    moveAutoCopiedFormToFolder_(originalFormId, copiedManual.getId(), manualFolder, `${name}_FORM`);

    try {
      SpreadsheetApp.getUi().alert(`OK：手動スナップショットを作成しました。\n保存先：${manualFolderName}\nファイル名：${name}`);
    } catch (e) {}

  } catch (e) {
    console.error("createManualSnapshot error:", String(e), e && e.stack);
    try {
      SpreadsheetApp.getUi().alert(`NG：手動スナップショット作成に失敗しました。\n${String(e)}`);
    } catch (ee) {}
  } finally {
    lock.releaseLock();
  }
}

/**
 * ファイル名に使えるようにトークンを安全化
 */
function sanitizeFileToken_(s) {
  return String(s)
    .replace(/[\\\/:\*\?"<>\|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * GoogleフォームURLからフォームIDを抽出
 * - /forms/d/e/<ID>/... 形式と /forms/d/<ID>/... 形式に対応
 */
function getFormIdFromUrl_(url) {
  const s = String(url || "");
  let m = s.match(/\/d\/e\/([a-zA-Z0-9_-]+)/);
  if (m && m[1]) return m[1];
  m = s.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m && m[1]) return m[1];
  return "";
}

/**
 * スプレッドシートコピー時に自動生成された「フォームのコピー」をバックアップ先フォルダへ移動
 * - copiedSpreadsheetId: makeCopyで作ったスプレッドシート（File）のID
 * - originalFormId と一致する場合は誤移動防止で何もしない
 */
function moveAutoCopiedFormToFolder_(originalFormId, copiedSpreadsheetId, targetFolder, renameTo) {
  try {
    if (!originalFormId) return;
    if (!copiedSpreadsheetId || !targetFolder) return;

    let formId = "";
    for (let i = 0; i < 3; i++) {
      try {
        const copiedSS = SpreadsheetApp.openById(copiedSpreadsheetId);
        formId = getFormIdFromUrl_(copiedSS.getFormUrl());
      } catch (e) {}
      if (formId) break;
      Utilities.sleep(500);
    }

    if (!formId) return;
    if (formId === originalFormId) return; // 元フォームを触らない

    const formFile = DriveApp.getFileById(formId);

    // フォルダ配下へ（必要ならマイドライブ直下から外す）
    targetFolder.addFile(formFile);
    try { DriveApp.getRootFolder().removeFile(formFile); } catch (e) {}

    if (renameTo) {
      try { formFile.setName(String(renameTo)); } catch (e) {}
    }
  } catch (e) {
    console.error("moveAutoCopiedFormToFolder_ error:", String(e), e && e.stack);
  }
}