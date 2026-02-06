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

/** 「まだ旧ステータスが残ってないか」を出す */
function auditStatusValues_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet(); // ★getActive()をやめる
  if (!ss) throw new Error("アクティブなスプレッドシートが取得できません（シートに紐づいたプロジェクトで実行してください）");

  const sheet = ss.getSheetByName(CONFIG.SHEET.ORDER_LIST);
  if (!sheet) throw new Error("注文一覧シートが見つかりません: " + CONFIG.SHEET.ORDER_LIST);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert("ステータス監査結果\n\nデータ行がありません。");
    return;
  }

  // ★flat()を使わず安定させる
  const vals2d = sheet.getRange(2, CONFIG.COLUMN.STATUS, lastRow - 1, 1).getValues();
  const vals = vals2d.map(r => String(r[0] || "").trim());

  const counts = {};
  vals.forEach(k => {
    counts[k] = (counts[k] || 0) + 1;
  });

  const lines = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `「${k || "(空欄)"}」: ${v}件`);

  SpreadsheetApp.getUi().alert("ステータス監査結果\n\n" + lines.join("\n"));
}

/**
 * ★要確認一覧の定期更新トリガーをインストール（重複は自動で掃除）
 * デフォルト：30分ごと
 */
function installNeedsCheckViewTrigger_() {
  // 既存の refreshNeedsCheckView トリガーがあれば削除（重複防止）
  deleteNeedsCheckViewTriggers_();

  // 30分ごと（必要なら 10分に変更：everyMinutes(10)）
  ScriptApp.newTrigger("refreshNeedsCheckViewTrigger")
    .timeBased()
    .everyMinutes(30)
    .create();

  SpreadsheetApp.getUi().alert("OK：★要確認一覧の定期更新（30分ごと）を設定しました。");
}

/** ★要確認一覧の定期更新トリガーを削除 */
function deleteNeedsCheckViewTriggers_() {
  const triggers = ScriptApp.getProjectTriggers();
  let deleted = 0;

  triggers.forEach(t => {
    if (t.getHandlerFunction && t.getHandlerFunction() === "refreshNeedsCheckViewTrigger") {
      ScriptApp.deleteTrigger(t);
      deleted++;
    }
  });

  if (deleted > 0) {
    console.log(`Deleted refreshNeedsCheckView triggers: ${deleted}`);
  }
}

/** トリガー一覧をログに出す（確認用） */
function listProjectTriggers_() {
  const triggers = ScriptApp.getProjectTriggers();
  const lines = triggers.map(t => {
    const fn = t.getHandlerFunction ? t.getHandlerFunction() : "";
    const type = t.getEventType ? t.getEventType() : "";
    return `${fn} / type=${type}`;
  });
  console.log(lines.join("\n"));
  SpreadsheetApp.getUi().alert("トリガー一覧はログに出しました（表示 → ログ）。");
}

// ▼手動実行したいものだけ、末尾 _ なしのラッパーを用意する
function installNeedsCheckViewTrigger() {
  return installNeedsCheckViewTrigger_();
}

function deleteNeedsCheckViewTriggers() {
  return deleteNeedsCheckViewTriggers_();
}

function listProjectTriggers() {
  return listProjectTriggers_();
}

// トリガー専用（UI操作なし）
function refreshNeedsCheckViewTrigger() {
  refreshNeedsCheckView();
}

/**
 * No指定：有効に戻す（STATUS=空欄、REASONも空欄）
 */
function markByOrderNoAsActive() {
  const sheet = getOrderListSheetAny_();
  const orderNos = promptOrderNos_("有効に戻す（No指定）", "対象の予約Noを入力（例：020501, 020502）");
  if (!orderNos) return;

  const rows = findRowsByOrderNos_(sheet, orderNos);
  if (!rows.length) return;

  setStatusReasonForRowList_(sheet, rows, CONFIG.STATUS.ACTIVE, "");
  refreshNeedsCheckViewSafe_();
  SpreadsheetApp.getUi().alert(`完了：${rows.length}行を「有効（空欄）」にしました。`);
}

/**
 * No指定：無効にする（理由必須）
 */
function markByOrderNoAsInvalid() {
  const sheet = getOrderListSheetAny_();
  const orderNos = promptOrderNos_("無効にする（No指定）", "対象の予約Noを入力（例：020501, 020502）");
  if (!orderNos) return;

  const reason = promptReasonFromTemplates_("INVALID");
  if (reason === null) return;

  const rows = findRowsByOrderNos_(sheet, orderNos);
  if (!rows.length) return;

  setStatusReasonForRowList_(sheet, rows, CONFIG.STATUS.INVALID, reason);
  refreshNeedsCheckViewSafe_();
  SpreadsheetApp.getUi().alert(`完了：${rows.length}行を「無効」にしました。`);
}

/**
 * No指定：★要確認にする（理由必須）
 */
function markByOrderNoAsNeedsCheck() {
  const sheet = getOrderListSheetAny_();
  const orderNos = promptOrderNos_("★要確認にする（No指定）", "対象の予約Noを入力（例：020501, 020502）");
  if (!orderNos) return;

  const reason = promptReasonFromTemplates_("NEEDS_CHECK");
  if (reason === null) return;

  const rows = findRowsByOrderNos_(sheet, orderNos);
  if (!rows.length) return;

  setStatusReasonForRowList_(sheet, rows, CONFIG.STATUS.NEEDS_CHECK, reason);
  refreshNeedsCheckViewSafe_();
  SpreadsheetApp.getUi().alert(`完了：${rows.length}行を「★要確認」にしました。`);
}

/**
 * No指定：理由だけ編集（STATUSは維持）
 */
function editReasonByOrderNo() {
  const sheet = getOrderListSheetAny_();
  const orderNos = promptOrderNos_("理由を編集（No指定）", "対象の予約Noを入力（例：020501, 020502）");
  if (!orderNos) return;

  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt("理由を編集", "理由を入力（空欄も可）", ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return;

  const reason = String(res.getResponseText() || "").trim();

  const rows = findRowsByOrderNos_(sheet, orderNos);
  if (!rows.length) return;

  setReasonForRowList_(sheet, rows, reason);
  refreshNeedsCheckViewSafe_();
  SpreadsheetApp.getUi().alert(`完了：${rows.length}行の理由を更新しました。`);
}

/* =========================
   内部ヘルパー（追加）
   ========================= */

// 注文一覧を常に対象（No指定は誤爆しにくい）
function getOrderListSheetAny_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET.ORDER_LIST);
  if (!sheet) throw new Error("注文一覧シートが見つかりません: " + CONFIG.SHEET.ORDER_LIST);
  return sheet;
}

// カンマ/空白/改行区切りOK。' は除去。
function promptOrderNos_(title, message) {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt(title, message, ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return null;

  const raw = String(res.getResponseText() || "").trim();
  if (!raw) {
    ui.alert("予約Noが空です。");
    return null;
  }

  const list = raw
    .split(/[\s,]+/)
    .map(s => s.replace(/'/g, "").trim())
    .filter(Boolean);

  if (!list.length) {
    ui.alert("予約Noが読み取れませんでした。");
    return null;
  }

  return Array.from(new Set(list));
}

// 同じNoが複数行に存在しても全部拾う（念のため）
function findRowsByOrderNos_(sheet, orderNos) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    SpreadsheetApp.getUi().alert("注文一覧にデータがありません。");
    return [];
  }

  const colNo = CONFIG.COLUMN.ORDER_NO;
  const values = sheet.getRange(2, colNo, lastRow - 1, 1).getValues();

  const map = new Map(); // no -> [row...]
  for (let i = 0; i < values.length; i++) {
    const no = String(values[i][0] || "").replace(/'/g, "").trim();
    if (!no) continue;
    const rowNum = i + 2;
    if (!map.has(no)) map.set(no, []);
    map.get(no).push(rowNum);
  }

  const rows = [];
  const missing = [];

  orderNos.forEach(no => {
    const hit = map.get(no);
    if (hit && hit.length) rows.push(...hit);
    else missing.push(no);
  });

  if (missing.length) {
    SpreadsheetApp.getUi().alert(
      `見つからない予約Noがありました（処理は見つかった分だけ行います）\n\n` +
      missing.slice(0, 30).join(", ") + (missing.length > 30 ? "\n…他" : "")
    );
  }

  return Array.from(new Set(rows)).sort((a, b) => a - b);
}

function promptRequiredReason_(title, message) {
  const ui = SpreadsheetApp.getUi();
  const res = ui.prompt(title, message, ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return null;

  const reason = String(res.getResponseText() || "").trim();
  if (!reason) {
    ui.alert("理由が空です。理由を入力してください。");
    return null;
  }
  return reason;
}

function setStatusReasonForRowList_(sheet, rows, status, reason) {
  rows.forEach(r => {
    sheet.getRange(r, CONFIG.COLUMN.STATUS).setValue(status);
    sheet.getRange(r, CONFIG.COLUMN.REASON).setValue(reason || "");
  });
}

function setReasonForRowList_(sheet, rows, reason) {
  rows.forEach(r => {
    sheet.getRange(r, CONFIG.COLUMN.REASON).setValue(reason || "");
  });
}

// 手動操作の後だけビュー更新（失敗しても本処理は止めない）
function refreshNeedsCheckViewSafe_() {
  try {
    if (typeof refreshNeedsCheckView === "function") refreshNeedsCheckView();
  } catch (e) {
    console.warn("refreshNeedsCheckView failed:", String(e));
  }
}

/* =========================
   理由テンプレ（追加）
   ========================= */

// ここを増やすだけでテンプレが増えます
const REASON_TEMPLATES_ = {
  INVALID: [
    "キャンセル（電話）",
    "キャンセル（LINE）",
    "重複予約",
    "予約変更（新予約あり）",
    "受取日時変更のため作り直し",
    "店側都合（売り切れ等）",
    "その他（自由入力）"
  ],
  NEEDS_CHECK: [
    "変更期限切れ（前日20時以降）",
    "元予約No不明／見つからない",
    "電話番号未入力",
    "受取日が不正／判定できない",
    "注文内容が空／不正",
    "LINE通知不可（LINE_ID不明）",
    "その他（自由入力）"
  ]
};

/**
 * テンプレから理由を選ぶ（必須）
 * type: "INVALID" | "NEEDS_CHECK"
 * 戻り値：理由文字列 / キャンセル時 null
 */
function promptReasonFromTemplates_(type) {
  const ui = SpreadsheetApp.getUi();

  const list = REASON_TEMPLATES_[type];
  if (!list || !list.length) {
    // 保険：テンプレが無い場合は自由入力にフォールバック
    return promptRequiredReason_("理由を入力", "理由を入力してください");
  }

  const title =
    (type === "INVALID") ? "無効にする：理由テンプレ選択" :
    (type === "NEEDS_CHECK") ? "★要確認：理由テンプレ選択" :
    "理由テンプレ選択";

  const message =
    "番号を入力してください（例：1）\n\n" +
    list.map((t, i) => `${i + 1}. ${t}`).join("\n") +
    "\n\n※最後の「その他（自由入力）」を選ぶと自由入力できます";

  const res = ui.prompt(title, message, ui.ButtonSet.OK_CANCEL);
  if (res.getSelectedButton() !== ui.Button.OK) return null;

  const n = parseInt(String(res.getResponseText() || "").trim(), 10);
  if (!isFinite(n) || n < 1 || n > list.length) {
    ui.alert("番号が不正です。もう一度やり直してください。");
    return null;
  }

  const selected = list[n - 1];

  // 「その他（自由入力）」を選んだ場合
  if (selected.includes("自由入力")) {
    const free = promptRequiredReason_("理由を入力", "理由を入力してください（必須）");
    if (free === null) return null;
    return free;
  }

  // 追記（任意）
  const add = ui.prompt(
    "理由の追記（任意）",
    `選択：${selected}\n追記があれば入力してください（例：お客様連絡済／メモなど）\n空欄ならそのまま確定します。`,
    ui.ButtonSet.OK_CANCEL
  );

  // ★追記のキャンセルは「追記なし」で確定（処理を止めない）
  if (add.getSelectedButton() !== ui.Button.OK) return selected;

  const extra = String(add.getResponseText() || "").trim();
  return extra ? `${selected} / ${extra}` : selected;
}
