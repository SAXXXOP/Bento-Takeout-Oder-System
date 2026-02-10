/**
 * ★要確認一覧（別シート）を更新して開く
 */
function openNeedsCheckView() {
  refreshNeedsCheckView();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = (CONFIG.SHEET && CONFIG.SHEET.NEEDS_CHECK_VIEW) ? CONFIG.SHEET.NEEDS_CHECK_VIEW : "★要確認一覧";
  ss.getSheetByName(name).activate();
}

/**
 * 注文一覧から STATUS=★要確認 の行を抽出して「★要確認一覧」に貼り直す
 */
function refreshNeedsCheckView() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const src = ss.getSheetByName(CONFIG.SHEET.ORDER_LIST);
  if (!src) throw new Error("注文一覧が見つかりません: " + CONFIG.SHEET.ORDER_LIST);

  const viewName = (CONFIG.SHEET && CONFIG.SHEET.NEEDS_CHECK_VIEW) ? CONFIG.SHEET.NEEDS_CHECK_VIEW : "★要確認一覧";
  const view = getOrCreateSheet_(ss, viewName);

  const lastRow = src.getLastRow();
  const maxCol = Math.max(CONFIG.COLUMN.PICKUP_DATE_RAW, src.getLastColumn()); // 内部日付列まで読む想定 :contentReference[oaicite:3]{index=3}
  const gid = src.getSheetId();

  // ヘッダー
  const header = [
    "リンク", "元シート行", "予約No", "受取日", "名前", "電話",
    "ステータス", "理由", "元予約No", "注文内容", "要望", "タイムスタンプ"
  ];

  view.clear({ contentsOnly: true });
  view.getRange(1, 1, 1, header.length).setValues([header]);
  view.setFrozenRows(1);

  // データなし
  if (lastRow < 2) {
    resetFilter_(view);
    view.autoResizeColumns(1, header.length);
    return;
  }

  const values = src.getRange(2, 1, lastRow - 1, maxCol).getValues();

  // 抽出（pickupDateRaw で並べ替え）
  const rows = [];
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    const status = String(r[CONFIG.COLUMN.STATUS - 1] || "").trim();
    // "★要確認" と "要確認" の揺れを許容（ついでに空白も吸収）
    const needsKey = String(CONFIG.STATUS.NEEDS_CHECK || "").replace(/^★/, "").trim();
    if (status.replace(/^★/, "").trim() !== needsKey) continue;

    const sheetRowNo = i + 2;
    const pickupRaw = r[CONFIG.COLUMN.PICKUP_DATE_RAW - 1]; // Date型のはず
    const linkFormula = `=HYPERLINK("#gid=${gid}&range=A${sheetRowNo}","開く")`;

    rows.push({
      pickupRaw,
      out: [
        linkFormula,
        sheetRowNo,
        stripQuote_(r[CONFIG.COLUMN.ORDER_NO - 1]),
        r[CONFIG.COLUMN.PICKUP_DATE - 1] || "",
        r[CONFIG.COLUMN.NAME - 1] || "",
        stripQuote_(r[CONFIG.COLUMN.TEL - 1]),
        status,
        r[CONFIG.COLUMN.REASON - 1] || "",
        stripQuote_(r[CONFIG.COLUMN.SOURCE_NO - 1]),
        r[CONFIG.COLUMN.DETAILS - 1] || "",
        r[CONFIG.COLUMN.NOTE - 1] || "",
        r[CONFIG.COLUMN.TIMESTAMP - 1] || ""
      ]
    });
  }

  rows.sort((a, b) => {
    const da = a.pickupRaw instanceof Date ? a.pickupRaw.getTime() : 0;
    const db = b.pickupRaw instanceof Date ? b.pickupRaw.getTime() : 0;
    if (da !== db) return da - db;
    // 同日の場合、行番号順
    return a.out[1] - b.out[1];
  });

  const outValues = rows.map(x => x.out);

  if (outValues.length) {
    view.getRange(2, 1, outValues.length, header.length).setValues(outValues);
  }

  // フィルタ（見やすさ）
  resetFilter_(view);
  view.getRange(1, 1, Math.max(1, outValues.length + 1), header.length).createFilter();
  view.autoResizeColumns(1, header.length);
}

function getOrCreateSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function resetFilter_(sheet) {
  const f = sheet.getFilter();
  if (f) f.remove();
}

function stripQuote_(v) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/^'/, "");
}
