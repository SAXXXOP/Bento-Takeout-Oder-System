/**
 * NeedsCheckWorkflow.gs
 * ★要確認の処理をサイドバーで完結させる
 */

// 一覧を最新化して返す（ガード→ビュー更新→注文一覧から抽出）
function ncw_refreshAndList() {
  // ★要確認一覧（別シート）を同期するのはOK。ただし運用ガードは“毎回”走らせると
  // 条件付き書式ルールが増殖しやすいので、ここでは実行しない（メニュー側で実行）。
  try {
    if (typeof refreshNeedsCheckView === "function") refreshNeedsCheckView();
  } catch (e) {
    console.warn("refreshNeedsCheckView failed:", e);
  }
  return ncw_list();
}

// 注文一覧から STATUS=★要確認 を抽出して返す
function ncw_list() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET.ORDER_LIST);
  if (!sheet) throw new Error("注文一覧が見つかりません: " + CONFIG.SHEET.ORDER_LIST);

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const maxCol = Math.max(
    CONFIG.COLUMN.PICKUP_DATE_RAW || 0,
    CONFIG.COLUMN.SOURCE_NO || 0,
    CONFIG.COLUMN.REASON || 0,
    CONFIG.COLUMN.STATUS || 0,
    CONFIG.COLUMN.DETAILS || 0,
    CONFIG.COLUMN.NOTE || 0,
    CONFIG.COLUMN.TEL || 0,
    CONFIG.COLUMN.NAME || 0,
    CONFIG.COLUMN.ORDER_NO || 0,
    CONFIG.COLUMN.PICKUP_DATE || 0,
    CONFIG.COLUMN.TIMESTAMP || 0
  );

  const values = sheet.getRange(2, 1, lastRow - 1, maxCol).getValues();
  const out = [];

  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    const status = String(r[CONFIG.COLUMN.STATUS - 1] || "").trim();
    const needsKey = String(CONFIG.STATUS.NEEDS_CHECK || "").replace(/^★/, "");
    if (status.replace(/^★/, "") !== needsKey) continue; // "★要確認" と "要確認" を許容

    const pickupRaw = (CONFIG.COLUMN.PICKUP_DATE_RAW ? r[CONFIG.COLUMN.PICKUP_DATE_RAW - 1] : null);
    const telRaw = r[CONFIG.COLUMN.TEL - 1];

    out.push({
      row: i + 2,
      orderNo: ncw_stripQuote_(r[CONFIG.COLUMN.ORDER_NO - 1]),
      pickupDate: r[CONFIG.COLUMN.PICKUP_DATE - 1] || "",
      name: r[CONFIG.COLUMN.NAME - 1] || "",
      tel: ncw_stripQuote_(telRaw),
      status,
      reason: r[CONFIG.COLUMN.REASON - 1] || "",
      sourceNo: ncw_stripQuote_(r[CONFIG.COLUMN.SOURCE_NO - 1]),
      details: r[CONFIG.COLUMN.DETAILS - 1] || "",
      note: r[CONFIG.COLUMN.NOTE - 1] || "",
      timestamp: r[CONFIG.COLUMN.TIMESTAMP - 1] || "",
      _sort: (pickupRaw instanceof Date) ? pickupRaw.getTime() : 9999999999999,
      flags: {
        needsTel: !String(telRaw || "").trim(),
        hasSourceNo: !!String(r[CONFIG.COLUMN.SOURCE_NO - 1] || "").trim(),
        missingReason: !String(r[CONFIG.COLUMN.REASON - 1] || "").trim(),
      }
    });
  }

  out.sort((a, b) => (a._sort - b._sort) || a.orderNo.localeCompare(b.orderNo));
  out.forEach(x => delete x._sort);
  return out;
}

function ncw_openOrderRow(row) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET.ORDER_LIST);
  if (!sheet) throw new Error("注文一覧が見つかりません");
  sheet.activate();
  sheet.setActiveRange(sheet.getRange(row, 1));
}

function ncw_updateOrder(row, patch) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEET.ORDER_LIST);
    if (!sheet) throw new Error("注文一覧が見つかりません");

    if (patch.tel != null) sheet.getRange(row, CONFIG.COLUMN.TEL).setValue(patch.tel);
    if (patch.name != null) sheet.getRange(row, CONFIG.COLUMN.NAME).setValue(patch.name);
    if (patch.note != null) sheet.getRange(row, CONFIG.COLUMN.NOTE).setValue(patch.note);
    if (patch.details != null) sheet.getRange(row, CONFIG.COLUMN.DETAILS).setValue(patch.details);

    if (patch.status != null) {
      sheet.getRange(row, CONFIG.COLUMN.STATUS).setValue(patch.status);
      // 有効（空欄）に戻すなら理由も空にするのが運用上ラク
      if (patch.status === CONFIG.STATUS.ACTIVE && patch.reason == null) {
        sheet.getRange(row, CONFIG.COLUMN.REASON).setValue("");
      }
    }
    if (patch.reason != null) {
      sheet.getRange(row, CONFIG.COLUMN.REASON).setValue(patch.reason);
    }

    // ビュー更新（失敗しても本処理は止めない）
    if (typeof refreshNeedsCheckViewSafe_ === "function") refreshNeedsCheckViewSafe_();
    return { ok: true };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

function ncw_markActive(row) {
  return ncw_updateOrder(row, { status: CONFIG.STATUS.ACTIVE, reason: "" });
}

function ncw_markNeedsCheck(row, reason) {
  return ncw_updateOrder(row, { status: CONFIG.STATUS.NEEDS_CHECK, reason: reason || "" });
}

function ncw_markInvalid(row, reason) {
  return ncw_updateOrder(row, { status: CONFIG.STATUS.INVALID, reason: reason || "" });
}

// 変更フロー：元予約Noを無効化 → この行を有効化
function ncw_applyChangeFlow(currentRow, sourceNo) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET.ORDER_LIST);
  if (!sheet) throw new Error("注文一覧が見つかりません");

  const oldNo = String(sourceNo || "").trim();
  if (!oldNo) throw new Error("元予約Noが空です");

  let rows = [];
  if (typeof findRowsByOrderNos_ === "function") {
    rows = findRowsByOrderNos_(sheet, [oldNo]);
  } else {
    // フォールバック（念のため）
    const lastRow = sheet.getLastRow();
    const colNo = CONFIG.COLUMN.ORDER_NO;
    const vals = sheet.getRange(2, colNo, lastRow - 1, 1).getValues();
    for (let i = 0; i < vals.length; i++) {
      const no = ncw_stripQuote_(vals[i][0]);
      if (no === oldNo) rows.push(i + 2);
    }
  }

  if (!rows.length) return { ok: false, message: "元予約Noが見つかりません: " + oldNo };

  const reason = "予約変更（新予約あり）";
  if (typeof setStatusReasonForRowList_ === "function") {
    setStatusReasonForRowList_(sheet, rows, CONFIG.STATUS.INVALID, reason);
  } else {
    rows.forEach(r => {
      sheet.getRange(r, CONFIG.COLUMN.STATUS).setValue(CONFIG.STATUS.INVALID);
      sheet.getRange(r, CONFIG.COLUMN.REASON).setValue(reason);
    });
  }

  ncw_markActive(currentRow);
  return { ok: true, affected: rows.length };
}

// 理由テンプレ（既存があれば流用）
function ncw_getReasonTemplates(type) {
  if (typeof REASON_TEMPLATES_ === "undefined" || !REASON_TEMPLATES_) return [];
  return REASON_TEMPLATES_[type] || [];
}

function ncw_stripQuote_(v) {
  return String(v || "").replace(/'/g, "").trim();
}
