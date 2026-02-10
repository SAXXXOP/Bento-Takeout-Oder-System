/**
 * NeedsCheckWorkflow.gs
 * ★要確認の処理をサイドバーで完結させる
 */

// ===== NCW debug helpers（NeedsCheckWorkflow_.gs 冒頭に追加推奨）=====

function ncw_codes_(v) {
  const s = String(v ?? "");
  return Array.from(s).map(ch => ch.codePointAt(0));
}

// 「★」「空白」「ゼロ幅」などの揺れを吸収して比較する
function ncw_normStatus_(v) {
  return String(v ?? "")
    .replace(/[\s\u00A0\u200B\uFEFF]/g, "") // 空白/nbsp/ゼロ幅/FEFF
    .replace(/^★/, "");
}

// 現状の取得元・件数・ステータス実体をログに出す
function ncw_debugSnapshot_(tag) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const orderName = CONFIG.SHEET.ORDER_LIST;
    const viewName = (CONFIG.SHEET && CONFIG.SHEET.NEEDS_CHECK_VIEW) ? CONFIG.SHEET.NEEDS_CHECK_VIEW : "★要確認一覧";
    const needs = String(CONFIG.STATUS.NEEDS_CHECK ?? "");

    ncw_dbg_(`snapshot:${tag}`, {
      orderName,
      viewName,
      needs,
      needsNorm: ncw_normStatus_(needs),
      needsCodes: ncw_codes_(needs),
      statusCol: CONFIG.COLUMN.STATUS
    });

    const view = ss.getSheetByName(viewName);
    ncw_dbg_("viewSheet", view ? { ok: true, lastRow: view.getLastRow(), lastCol: view.getLastColumn() } : { ok: false });

    if (view && view.getLastRow() >= 2) {
      const take = Math.min(5, view.getLastRow() - 1);
      const v = view.getRange(2, 1, take, 12).getValues();
      ncw_dbg_("viewHeadRows", v.map(r => ({
        orderRow: r[1],
        status: r[6],
        statusNorm: ncw_normStatus_(r[6]),
        statusCodes: ncw_codes_(r[6]),
      })));
    }

    const sheet = ss.getSheetByName(orderName);
    ncw_dbg_("orderSheet", sheet ? { ok: true, lastRow: sheet.getLastRow(), lastCol: sheet.getLastColumn() } : { ok: false });

    if (sheet && sheet.getLastRow() >= 2 && CONFIG.COLUMN.STATUS) {
      const lastRow = sheet.getLastRow();
      const take = Math.min(80, lastRow - 1);
      const col = CONFIG.COLUMN.STATUS;
      const arr = sheet.getRange(2, col, take, 1).getValues().flat();

      const hits = [];
      for (let i = 0; i < arr.length; i++) {
        const raw = arr[i];
        const s = String(raw ?? "");
        if (s.includes("要確認") || ncw_normStatus_(s) === ncw_normStatus_(needs)) {
          hits.push({
            row: i + 2,
            raw: s,
            norm: ncw_normStatus_(s),
            codes: ncw_codes_(s),
          });
        }
      }
      ncw_dbg_("orderStatusHits(sample)", hits.slice(0, 10));
    }
  } catch (e) {
    console.warn("[NCW] snapshot failed:", e);
  }
}

// 手動でログだけ出したい時用（エディタから実行OK）
function ncw_debugRun() {
  ncw_debugSnapshot_("manual");
}

function ncw_dbg_(...args) {
  // 1) 実行ログ（Executions）に出す
  try { console.log("[NCW]", ...args); } catch (e) {}

  // 2) 任意で「ログ」シートにも出す（ONにしたい時だけ Script Properties を設定）
  //    NCW_LOG_TO_SHEET=1 かつ LOG_LEVEL=DEBUG のときに出る
  try {
    const p = PropertiesService.getScriptProperties().getProperty("NCW_LOG_TO_SHEET");
    const on = ["1","true","yes","y","on"].includes(String(p || "").trim().toLowerCase());
    if (!on) return;
    if (typeof logToSheet !== "function") return;

    const msg = args.length ? String(args[0]) : "";
    const extra = args.length >= 2 ? args[1] : null;
    logToSheet("DEBUG", `[NCW] ${msg}`, extra);
  } catch (e) {}
}

// 一覧を最新化して返す（ガード→ビュー更新→注文一覧から抽出）
function ncw_refreshAndList() {
  ncw_dbg_("refreshAndList start");
  ncw_debugSnapshot_("before");
  // ★要確認一覧（別シート）を同期する前に、運用ガードも走らせたい要望あり。
  // ただし毎回実行でルール増殖リスクがあるので、5分だけ抑制して実行。
  try {
    const cache = CacheService.getScriptCache();
    if (!cache.get("ncw_guard_recent") && typeof applyOrderStatusGuards === "function") {
      applyOrderStatusGuards({ silent: true });
      cache.put("ncw_guard_recent", "1", 300); // 5分
    }
  } catch (e) {
    console.warn("applyOrderStatusGuards skipped/failed:", e);
  }
  try {
    if (typeof refreshNeedsCheckView === "function") refreshNeedsCheckView();
  } catch (e) {
    console.warn("refreshNeedsCheckView failed:", e);
  }
  const items = ncw_list();
  ncw_dbg_("refreshAndList return", { isArray: Array.isArray(items), count: (items && items.length) });
  ncw_debugSnapshot_("after");
  // ★必ず {items:[...]} を返す（クライアント側の型ゆらぎ対策）
  return { items };
}

/**
 * ★要確認ワークフロー：API入口 v2（戻り値を必ず返す）
 * - 関数名を変えて、重複定義/上書きの影響を避ける
 */
function ncw_refreshAndList_v2() {
  return ncw_refreshAndList_v3_20260210();
}


/**
 * ★要確認ワークフロー：API入口 v3（2026-02-10）
 * - 「必ずreturnする」「呼ばれたことが分かる(toast/ログ)」を保証
 * - v2 が何らかの理由で undefined を返している疑いの切り分け用
 */
function ncw_refreshAndList_v3_20260210() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // NCW_TOAST=1 のときだけtoast（普段は邪魔なのでOFF）
  try {
    const p = PropertiesService.getScriptProperties().getProperty("NCW_TOAST");
    const on = ["1","true","yes","y","on"].includes(String(p || "").trim().toLowerCase());
    if (on) ss.toast("NCW v3 called", "NCW", 3);
  } catch (e) {}
  try { console.log("[NCW] v3 called"); } catch (e) {}

  // ①ガード（5分抑制）
  try {
    const cache = CacheService.getScriptCache();
    if (!cache.get("ncw_guard_recent") && typeof applyOrderStatusGuards === "function") {
      applyOrderStatusGuards({ silent: true });
      cache.put("ncw_guard_recent", "1", 300);
    }
  } catch (e) {
    try { console.warn("[NCW] v3 guard failed:", e); } catch (_) {}
  }

  // ②ビュー更新（失敗しても続行）
  try {
    if (typeof refreshNeedsCheckView === "function") refreshNeedsCheckView();
  } catch (e) {
    try { console.warn("[NCW] v3 refreshNeedsCheckView failed:", e); } catch (_) {}
  }

  // ③一覧取得
  let items = [];
  try {
    items = (typeof ncw_list === "function") ? (ncw_list() || []) : [];
  } catch (e) {
    try { console.warn("[NCW] v3 ncw_list failed:", e); } catch (_) {}
    items = [];
  }

  const safe = Array.isArray(items) ? items : [];

  // 念のため：Date が混ざっても死なないように文字列化
  safe.forEach(it => {
    if (!it || typeof it !== "object") return;
    Object.keys(it).forEach(k => {
      const v = it[k];
      if (v instanceof Date) it[k] = Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy/MM/dd HH:mm:ss");
    });
  });

  return {
    items: safe,
    meta: {
      probe: "v3_20260210",
      count: safe.length,
      at: new Date().toISOString(),
      scriptId: ScriptApp.getScriptId(),
      ssId: ss.getId()
    }
  };
}


/** 疎通確認用：これが null なら “呼び先が違う” が確定 */
function ncw_ping_v2() {
  return { ok: true, at: new Date().toISOString() };
}


// 互換：サイドバー/旧版が refreshAndList / updateNeedsReviewList を呼んでも動くようにする
function refreshAndList() {
  return ncw_refreshAndList_v3_20260210();
}
function updateNeedsReviewList() {
  return ncw_refreshAndList_v3_20260210();
}
function ncw_refreshAndList() {
  return ncw_refreshAndList_v3_20260210();
}

// 注文一覧から STATUS=★要確認 を抽出して返す
function ncw_list() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // ① まず「★要確認一覧」から取得（表示シートとサイドバーを一致させる）
  const viewName = (CONFIG.SHEET && CONFIG.SHEET.NEEDS_CHECK_VIEW) ? CONFIG.SHEET.NEEDS_CHECK_VIEW : "★要確認一覧";
  const view = ss.getSheetByName(viewName);
  if (view && view.getLastRow() >= 2) {
    const vLastRow = view.getLastRow();
    // A:リンク B:元シート行 C:予約No D:受取日 E:名前 F:電話 G:ステータス H:理由 I:元予約No J:注文内容 K:要望 L:タイムスタンプ
    const v = view.getRange(2, 1, vLastRow - 1, 12).getValues();
    const outFromView = [];
    for (let i = 0; i < v.length; i++) {
      const r = v[i];
      const rowNo = Number(r[1]); // 元シート行
      if (!rowNo || rowNo < 2) continue;

      const telRaw = r[5];
      const reasonRaw = r[7];
      const sourceNoRaw = r[8];

      outFromView.push({
        row: rowNo,                 // 注文一覧の行番号
        orderNo: ncw_stripQuote_(r[2] || ""),
        pickupDate: r[3] || "",
        name: r[4] || "",
        tel: ncw_stripQuote_(r[5] || ""),
        status: r[6] || "",
        reason: r[7] || "",
        sourceNo: ncw_stripQuote_(r[8] || ""),
        details: r[9] || "",
        note: r[10] || "",
        timestamp: r[11] || "",
        flags: {
          needsTel: !String(telRaw || "").trim(),
          hasSourceNo: !!String(sourceNoRaw || "").trim(),
          missingReason: !String(reasonRaw || "").trim(),
        }
      });
    }
    ncw_dbg_("ncw_list fromView", { viewRows: v.length, out: outFromView.length });
    if (outFromView.length) return outFromView;
  }

  // ② フォールバック：従来どおり「注文一覧」から抽出
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
    const statusRaw = r[CONFIG.COLUMN.STATUS - 1];
    if (ncw_normStatus_(statusRaw) !== ncw_normStatus_(CONFIG.STATUS.NEEDS_CHECK)) continue;
    const status = String(statusRaw || "").trim();

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
  ncw_dbg_("ncw_list: fromOrderList", { count: out.length });
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
