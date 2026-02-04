/**
 * AdminTools.gs
 * B案（有効=空欄 / 無効 / ★要確認）への移行と運用ガード
 */

/**
 * 既存データのステータスを B案へ移行（バックアップ作成付き）
 * - 通常/変更後/空欄 → 空欄（有効）
 * - 変更前/変更済/キャンセル → 無効
 * - 要確認 → ★要確認
 *
 * 理由が空なら、ある程度自動補完します（手入力があれば尊重）
 */
function migrateOrderStatusToBPlan() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET.ORDER_LIST);
  if (!sheet) return;

  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt(
    "ステータス移行（B案）",
    "実行すると、注文一覧の STATUS/REASON を一括変換します。\n先にバックアップシートを作成します。\n実行する場合は MIGRATE と入力してください。",
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return;
  if ((res.getResponseText() || "").trim().toUpperCase() !== "MIGRATE") return;

  // 1) バックアップ作成（同一スプレッド内にシートコピー）
  const ts = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd_HHmmss");
  const backupName = `${CONFIG.SHEET.ORDER_LIST}_backup_${ts}`;
  sheet.copyTo(ss).setName(backupName);

  // 2) データ取得
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const lastCol = CONFIG.COLUMN.PICKUP_DATE_RAW; // P まで
  const data = sheet.getRange(1, 1, lastRow, lastCol).getValues();

  const colStatus = CONFIG.COLUMN.STATUS - 1;
  const colReason = CONFIG.COLUMN.REASON - 1;

  let changed = 0;
  let changedReasons = 0;

  for (let r = 1; r < data.length; r++) {
    const status0 = String(data[r][colStatus] || "").trim();
    const reason0 = String(data[r][colReason] || "").trim();

    // すでにB案（空欄/無効/★要確認）なら基本スキップ
    if (status0 === CONFIG.STATUS.ACTIVE || status0 === CONFIG.STATUS.INVALID || status0 === CONFIG.STATUS.NEEDS_CHECK) {
      // 「無効/★要確認」なのに理由が空なら補完だけする
      if ((status0 === CONFIG.STATUS.INVALID || status0 === CONFIG.STATUS.NEEDS_CHECK) && !reason0) {
        data[r][colReason] = (status0 === CONFIG.STATUS.INVALID) ? "無効（理由未記入）" : "要確認（理由未記入）";
        changedReasons++;
      }
      continue;
    }

    // 旧ステータス → B案
    let nextStatus = status0;
    let nextReason = reason0;

    if (!status0 || status0 === "通常" || status0 === "変更後") {
      nextStatus = CONFIG.STATUS.ACTIVE; // 空欄
    } else if (status0 === "要確認") {
      nextStatus = CONFIG.STATUS.NEEDS_CHECK; // ★要確認
      if (!nextReason) nextReason = "旧:要確認";
    } else if (status0 === "変更前") {
      nextStatus = CONFIG.STATUS.INVALID; // 無効
      if (!nextReason) nextReason = "旧:変更前（予約変更で無効）";
    } else if (status0 === "変更済") {
      nextStatus = CONFIG.STATUS.INVALID;
      if (!nextReason) nextReason = "旧:変更済";
    } else if (status0 === "キャンセル") {
      nextStatus = CONFIG.STATUS.INVALID;
      if (!nextReason) nextReason = "旧:キャンセル";
    } else {
      // 予期しない値：止めずに ★要確認 に寄せる（人間が判断できるように）
      nextStatus = CONFIG.STATUS.NEEDS_CHECK;
      if (!nextReason) nextReason = `不明ステータス: ${status0}`;
    }

    if (nextStatus !== status0) {
      data[r][colStatus] = nextStatus;
      changed++;
    }
    if (nextReason !== reason0) {
      data[r][colReason] = nextReason;
      changedReasons++;
    }
  }

  // 3) 反映（STATUS〜P まで戻すのは重いので、STATUS/REASON 列だけ返す）
  const outStatus = data.map(row => [row[colStatus]]);
  const outReason = data.map(row => [row[colReason]]);

  sheet.getRange(1, CONFIG.COLUMN.STATUS, lastRow, 1).setValues(outStatus);
  sheet.getRange(1, CONFIG.COLUMN.REASON, lastRow, 1).setValues(outReason);

  ui.alert(`完了：ステータス変更=${changed}件 / 理由補完=${changedReasons}件\nバックアップ：${backupName}`);
}

/**
 * 運用ガード適用（入力制限＋条件付き書式）
 * - STATUS は「空欄=有効 / 無効 / ★要確認」以外は警告
 * - 無効/★要確認 で理由が空なら目立たせる
 */
function applyOrderStatusGuards() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET.ORDER_LIST);
  if (!sheet) return;

  const lastRow = Math.max(2, sheet.getLastRow());
  const statusCol = CONFIG.COLUMN.STATUS;
  const reasonCol = CONFIG.COLUMN.REASON;

  // 1) データ検証（空欄は許容したいので allowInvalid=true で “警告運用”）
  const dv = SpreadsheetApp.newDataValidation()
    .requireValueInList([CONFIG.STATUS.INVALID, CONFIG.STATUS.NEEDS_CHECK], true) // ドロップダウン
    .setAllowInvalid(true) // 空欄(=有効)を許容
    .build();

  sheet.getRange(2, statusCol, lastRow - 1, 1).setDataValidation(dv);

  // 2) 条件付き書式（列範囲）
  const targetRange = sheet.getRange(2, 1, lastRow - 1, CONFIG.COLUMN.PICKUP_DATE_RAW); // A〜P

  const rules = sheet.getConditionalFormatRules().filter(r => {
    // 既存ルールを全部消さず、今回の範囲に完全一致するものだけ置き換え…は難しいので、
    // ここでは「追加」だけします。気になる場合は一度手動でルール整理してください。
    return true;
  });

  // 行全体：無効 → 灰色
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(`=$${colLetter_(statusCol)}2="${CONFIG.STATUS.INVALID}"`)
      .setBackground("#E0E0E0")
      .setRanges([targetRange])
      .build()
  );

  // 行全体：★要確認 → 薄い黄色
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(`=$${colLetter_(statusCol)}2="${CONFIG.STATUS.NEEDS_CHECK}"`)
      .setBackground("#FFF2CC")
      .setRanges([targetRange])
      .build()
  );

  // 理由セル：無効 or ★要確認 なのに理由空 → 薄い赤（理由列だけ）
  const reasonRange = sheet.getRange(2, reasonCol, lastRow - 1, 1);
  rules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(
        `=AND(OR($${colLetter_(statusCol)}2="${CONFIG.STATUS.INVALID}",$${colLetter_(statusCol)}2="${CONFIG.STATUS.NEEDS_CHECK}"),$${colLetter_(reasonCol)}2="")`
      )
      .setBackground("#F4CCCC")
      .setRanges([reasonRange])
      .build()
  );

  sheet.setConditionalFormatRules(rules);

  SpreadsheetApp.getUi().alert("運用ガードを適用しました（入力制限＋色付け＋理由未記入の強調）。");
}

/** 理由未記入の行を一覧でチェック（運用監査用） */
function checkMissingReasons() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET.ORDER_LIST);
  if (!sheet) return;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const lastCol = CONFIG.COLUMN.PICKUP_DATE_RAW;
  const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();

  const colStatus = CONFIG.COLUMN.STATUS - 1;
  const colReason = CONFIG.COLUMN.REASON - 1;
  const colNo = CONFIG.COLUMN.ORDER_NO - 1;
  const colName = CONFIG.COLUMN.NAME - 1;
  const colDate = CONFIG.COLUMN.PICKUP_DATE - 1;

  const misses = [];
  data.forEach((row, i) => {
    const status = String(row[colStatus] || "").trim();
    const reason = String(row[colReason] || "").trim();
    if ((status === CONFIG.STATUS.INVALID || status === CONFIG.STATUS.NEEDS_CHECK) && !reason) {
      misses.push(`行${i + 2}: No.${String(row[colNo] || "").replace(/'/g, "")} ${row[colName] || ""} (${row[colDate] || ""}) / ${status}`);
    }
  });

  SpreadsheetApp.getUi().alert(
    misses.length
      ? `理由未記入が ${misses.length} 件あります。\n\n` + misses.slice(0, 30).join("\n") + (misses.length > 30 ? "\n…他" : "")
      : "理由未記入はありません。"
  );
}

/** 列番号→A,B,C… */
function colLetter_(colNo1) {
  let n = colNo1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}