/**const status = String
 * 当日まとめシート作成
 * 修正点：見出し用ID(10,15,21,46等)の重複排除 / ID順 / ビンパッキング
 */
function createProductionSheet(targetDateOrInput) {
  const DEBUG_UNMATCHED_LOG = false; // ★その他が出るときなど必要なときだけ true にして原因CHECK

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const src = ss.getSheetByName(CONFIG.SHEET.ORDER_LIST);
  const master = ss.getSheetByName(CONFIG.SHEET.MENU_MASTER);
  const customerSheet = ss.getSheetByName(CONFIG.SHEET.CUSTOMER_LIST);
  const sheet = ss.getSheetByName(CONFIG.SHEET.DAILY_SUMMARY);
  
  if (!src || !sheet || !master) return;

  // トリガー実行ではUIが使えないので安全に扱う
  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) {}

  let targetInput = "";
  if (targetDateOrInput instanceof Date) {
    targetInput = formatMDFromDate_(targetDateOrInput); // "M/d"
  } else if (targetDateOrInput !== undefined && targetDateOrInput !== null && String(targetDateOrInput).trim() !== "") {
    targetInput = String(targetDateOrInput).trim();
  } else {
    if (!ui) throw new Error("createProductionSheet: targetDateOrInput is required when running without UI.");
    const res = ui.prompt("当日まとめ作成", "日付（例: 2/14）", ui.ButtonSet.OK_CANCEL);
    if (res.getSelectedButton() !== ui.Button.OK) return;
    targetInput = String(res.getResponseText() || "").trim();
  }
  const targetMD = parseMonthDay_(targetInput);            // {m,d} or null
  const targetDigits = targetInput.replace(/[^0-9]/g, ""); // フォールバック用
  let matchedDateRaw = null;                               // ★A1表示用に保持


  // --- 1. メニューマスタのインデックス化 ---
  const masterData = master.getDataRange().getValues().slice(1);
  const itemToInfo = {};    
  const displayNameMap = {}; 
  const itemOrder = {}; 

  masterData.forEach((r, index) => {
    const group = r[CONFIG.MENU_COLUMN.GROUP - 1];
    const parent = r[CONFIG.MENU_COLUMN.MENU_NAME - 1]?.toString().trim() || "";
    const child = r[CONFIG.MENU_COLUMN.SUB_MENU - 1]?.toString().trim() || "";
    const short = r[CONFIG.MENU_COLUMN.SHORT_NAME - 1]?.toString().trim() || "";
    
    if (!group) return;

    const info = { group, parent, child, id: index };
    const isHeaderOnly = !child || child === parent; // 見出し行かどうかの判定

    if (child) itemToInfo[child] = info;
    if (short) itemToInfo[short] = info;
    
    // 親メニュー名での登録（見出し行、または小メニューなし注文のヒット用）
    if (parent && (!itemToInfo[parent] || isHeaderOnly)) {
      itemToInfo[parent] = info;
    }
    
    const key = child || parent;
    displayNameMap[key] = short || child || parent;
    if (itemOrder[key] === undefined) itemOrder[key] = index;
  });

  // --- 2. データの集計 ---
  const data = src.getDataRange().getValues();
  const customerMap = {};
  if (customerSheet) {
    customerSheet.getDataRange().getValues().slice(1).forEach(r => {
      const lineId = r[CONFIG.CUSTOMER_COLUMN.LINE_ID - 1];
      const cookNote = r[CONFIG.CUSTOMER_COLUMN.NOTE_COOK - 1];
      if(lineId && cookNote) customerMap[lineId] = cookNote.toString();
    });
  }

  let groupCounts = {};
  let detailTree = {};
  let totalAll = 0;
  let memos = [];

  // ★「その他」ログ用（DEBUGがtrueのときだけ使う）
  const unmatchedMap = {};

  data.slice(1).forEach((row, idx) => {
  const sheetRow = idx + 2; // 注文一覧シート上の行番号（ヘッダ1行を考慮）
  const status = String(row[CONFIG.COLUMN.STATUS - 1] || "");
  const isActive = (status === CONFIG.STATUS.ACTIVE); // ACTIVEは空文字
  if (!isActive) return;

    const rawCol = CONFIG.COLUMN.PICKUP_DATE_RAW; // P列(16)想定（無ければ undefined）

  let isTarget = false;

  const pickupDateRaw = rawCol ? row[rawCol - 1] : null;
  const hasValidDate = pickupDateRaw instanceof Date && !isNaN(pickupDateRaw.getTime());

  if (targetMD && hasValidDate) {
    const m = pickupDateRaw.getMonth() + 1;
    const d = pickupDateRaw.getDate();
    isTarget = (m === targetMD.m && d === targetMD.d);

    if (isTarget && !matchedDateRaw) matchedDateRaw = pickupDateRaw; // ★最初の一致を保持
  } else {
    // フォールバック：従来通り E列文字
    const pickupDigits = row[CONFIG.COLUMN.PICKUP_DATE - 1]
      ?.toString()
      .replace(/[^0-9]/g, "");
    if (pickupDigits && targetDigits && pickupDigits.includes(targetDigits)) {
      isTarget = true;
    }
  }

  if (!isTarget) return;


    const lineId = row[CONFIG.COLUMN.LINE_ID - 1];

    const orderNo = String(row[CONFIG.COLUMN.ORDER_NO - 1] || "").replace("'", "");
    const name = String(row[CONFIG.COLUMN.NAME - 1] || "");

    // 注文一覧F列（リクエスト）を拾う：CONFIGに無ければ 6(F列) を使用
    const REQUEST_COL = (CONFIG.COLUMN && CONFIG.COLUMN.REQUEST) ? CONFIG.COLUMN.REQUEST : 6;
    const request = String(row[REQUEST_COL - 1] || "").replace(/\r?\n/g, " ").trim();

    // 顧客名簿の調理注意
    const cookNote = customerMap[lineId] ? String(customerMap[lineId]).replace(/\r?\n/g, " ").trim() : "";

    const parts = [];
    if (cookNote) parts.push(`⚠ ${cookNote} ⚠`);
    if (request) parts.push(`◆${request}`);
    

    if (parts.length > 0) {
      memos.push(`No.${orderNo}   ${name}様 ${parts.join(" ")}`);
    }


    const itemsText = row[CONFIG.COLUMN.DETAILS - 1] || "";
    itemsText.toString().split("\n").forEach(line => {
      const m = line.match(/(.+?)\s*x\s*(\d+)/);
      if (!m) return;
      
      const rawName = m[1].replace(/^[・\s└]+/, "").trim();
      const cleanName = rawName.replace(/[¥￥]?\d+円?/, "").trim();
      const count = Number(m[2]);

      let info = itemToInfo[cleanName] || itemToInfo[rawName];
      if (!info) {
        const hitKey = Object.keys(itemToInfo).find(key => cleanName.includes(key));

        if (hitKey) {
          info = itemToInfo[hitKey];
        } else {
          // ★ここが「その他」行き確定
          if (DEBUG_UNMATCHED_LOG) {
          const key = cleanName || rawName || "(空)";
          if (!unmatchedMap[key]) unmatchedMap[key] = { count: 0, examples: [] };
          unmatchedMap[key].count++;

          if (unmatchedMap[key].examples.length < 3) {
            unmatchedMap[key].examples.push({
              sheetRow,
              orderNo,
              name,
              rawName,
              cleanName,
              originalLine: line
            });
          }
        }

          info = { group: "その他", parent: "その他", child: cleanName, id: 999 };
      }

    }




      const { group, parent, child } = info;
      
      // 重要：小メニューが空、または親と同じなら「親自身」として集計
      const isRedundant = !child || child === parent || displayNameMap[child] === displayNameMap[parent];
      const childKey = isRedundant ? parent : child;

      if (!detailTree[group]) detailTree[group] = {};
      if (!detailTree[group][parent]) detailTree[group][parent] = {};
      detailTree[group][parent][childKey] = (detailTree[group][parent][childKey] || 0) + count;
      groupCounts[group] = (groupCounts[group] || 0) + count;
      totalAll += count;
    });
  });

  // --- 2.5 「その他」ログ出力（Execution log） ---
  if (DEBUG_UNMATCHED_LOG) {
    const keys = Object.keys(unmatchedMap);
    if (keys.length > 0) {
      Logger.log("=== 未マスタ品（その他）一覧 ===");
      keys.sort((a, b) => unmatchedMap[b].count - unmatchedMap[a].count).forEach(k => {
        Logger.log(`・${k}  x${unmatchedMap[k].count}`);
        unmatchedMap[k].examples.forEach(ex => {
          Logger.log(`   例) 行${ex.sheetRow} No.${ex.orderNo} ${ex.name} / raw="${ex.rawName}" clean="${ex.cleanName}" / "${ex.originalLine}"`);
        });
      });
    } else {
      Logger.log("未マスタ品（その他）はありませんでした");
    }
  }



  // --- 3. シート初期化 ---
  sheet.clear().clearFormats();

  // 既存の結合が残っても壊れないように、A:Hは一旦全部 unmerge
  sheet.getRange(1, 1, sheet.getMaxRows(), 8).breakApart();

  const displayDate = matchedDateRaw
    ? formatMDWFromDate_(matchedDateRaw) // ★曜日付き
    : (targetMD ? formatMDWFromMD_(targetMD) : targetInput);

  const COL_START = [1, 4, 7];

  // --- 3.5 メモ塊（A1:H◯）を作成：日付・総数(数字のみ)・メモを全部ここへ ---
  const MEMO_MAX_CHARS_PER_LINE = 65; // A～H 全幅想定の詰め目安
  const packed = packIntoLines_(memos, MEMO_MAX_CHARS_PER_LINE); // メモは詰めて行数節約

  /**
 * 1行が長すぎる場合、maxCharsPerLine で分割して「行を増やす」。
 * 絵文字なども壊れにくいよう code point 単位で分割する。
 */
function expandLinesByCharLimit_(lines, maxCharsPerLine) {
  const out = [];
  const max = Math.max(1, Number(maxCharsPerLine) || 65);

  (lines || []).forEach((ln) => {
    const s = String(ln || "");
    if (!s) return;

    const isBullet = s.startsWith("・");
    const contPrefix = isBullet ? "   " : "  "; // 継続行は少しインデント
    const prefixLen = Array.from(contPrefix).length;

    let chars = Array.from(s);

    if (chars.length <= max) {
      out.push(s);
      return;
    }

    // 1行目
    out.push(chars.slice(0, max).join(""));
    chars = chars.slice(max);

    // 続き（prefix込みで max に収める）
    while (chars.length > 0) {
      const take = Math.max(1, max - prefixLen);
      out.push(contPrefix + chars.slice(0, take).join(""));
      chars = chars.slice(take);
    }
  });

  return out;
}


  const headerDate = `【 ${displayDate} 】`;
  const headerTotal = String(totalAll); // 数字のみ

  const label = "===== ⚠注意  ◆リクエスト =====";

  // 見た目の間隔は「全角スペース」推奨（半角スペースは環境で詰まって見えがち）
  const gap = "　"; // 全角スペース
  const headerLine = packed.length
    ? `${headerDate}${gap}${headerTotal}${gap}${label}`  // ★横並び
    : `${headerDate}${gap}${headerTotal}`;

  // 2行目以降はメモ本文だけ
  const memoText = packed.length
    ? [headerLine, ...packed].join("\n")
    : headerLine;


  // --- 3.5 見出しは1行目、メモは2行目以降（縦結合はしない） ---
  const headerRange = sheet.getRange(1, 1, 1, 8); // A1:H1
  headerRange.merge(); // ★1行だけ横結合はOK（縦結合しない）
  headerRange
    .setValue(headerLine)
    .setWrap(false)
    .setVerticalAlignment("middle")
    .setHorizontalAlignment("left")
    .setFontSize(11)
    .setFontWeight("normal");

  // packed（メモ行）を「長文は分割して行追加」したものにする
  const memoLines = expandLinesByCharLimit_(packed, MEMO_MAX_CHARS_PER_LINE);

  let lastMemoRow = 1; // ヘッダだけなら1
  if (memoLines.length > 0) {
    const memoStartRow = 2;
    lastMemoRow = memoStartRow + memoLines.length - 1;

    // 2行目〜に1行ずつ書く（各行A:Hを横結合）
    memoLines.forEach((line, i) => {
      const r = memoStartRow + i;
      const rowRange = sheet.getRange(r, 1, 1, 8); // A?:H?
      rowRange.merge();
      rowRange
        .setValue(line)
        .setWrap(true)
        .setVerticalAlignment("top")
        .setHorizontalAlignment("left")
        .setFontSize(11)
        .setFontWeight("normal");
    });
  }

  // 外枠（A1:H{lastMemoRow}）だけ太線で囲む
  sheet.getRange(1, 1, lastMemoRow, 8)
    .setBorder(true, true, true, true, false, false, "#000000", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);

  // 行高（必要なら好みで調整）
  sheet.setRowHeight(1, 22);
  if (memoLines.length > 0) sheet.setRowHeights(2, memoLines.length, 18);

  // --- 4. 調理品3列の開始行（上端揃え） ---
  const baseRow = lastMemoRow + 2; // 見出し＋メモの下に1行あける
  let colRows = [baseRow, baseRow, baseRow];

  // --- 5. 高さ計算（ビンパッキング用） ---
  const sortedGroups = Object.keys(detailTree).map(g => {
    let h = 1; 
    Object.keys(detailTree[g]).forEach(p => {
      h++; 
      const cKeys = Object.keys(detailTree[g][p]);
      const validChildren = cKeys.filter(c => c !== p && displayNameMap[c] !== displayNameMap[p]);
      h += validChildren.length;
    });
    return { name: g, height: h + 1 };
  }).sort((a, b) => b.height - a.height);

  // --- 6. 描画 ---
sortedGroups.forEach(item => {
  const g = item.name;
  let idx = colRows.indexOf(Math.min(...colRows));
  let tCol = COL_START[idx];
  let tRow = colRows[idx];

  const groupStartRow = tRow;

  sheet.getRange(tRow, tCol, 1, 2).setFontWeight("bold").setFontSize(12);
  sheet.getRange(tRow, tCol).setValue(g);
  sheet.getRange(tRow, tCol+1).setValue(groupCounts[g]).setHorizontalAlignment("center");
    
  tRow++;

  const dashedParentRows = []; // ★破線を付ける親行を貯める
  const sortedParents = Object.keys(detailTree[g]).sort((a, b) => (itemOrder[a] || 999) - (itemOrder[b] || 999));

  if (sortedParents.length === 1) {
  const groupEndRow = tRow - 1;
  applyGroupOuterBorder_(sheet, groupStartRow, groupEndRow, tCol, tCol + 1);
  applyGroupOuterBorder_(sheet, groupStartRow, groupStartRow, tCol, tCol + 1);

  colRows[idx] = tRow + 1;
  return;
}

  const dashedBelowParentRows = []; // 親→子（親行の下）に破線を入れる親行
  const dashedAboveParentRows = []; // 子→親（親行の上）に破線を入れる親行
  let lastPrintedWasChild = false;  // 直前に描いた行が「子」だったか


  sortedParents.forEach(p => {
    const children = detailTree[g][p];
    const pCount = Object.values(children).reduce((a, b) => a + b, 0);

    // ★直前が「子」だったなら、今回の親行の“上”に破線を入れたい
    if (lastPrintedWasChild) {
      dashedAboveParentRows.push(tRow); // この親行の上（=親行のtop border）を後で破線にする
    }

    const parentRow = tRow; // ★親行
    lastPrintedWasChild = false; // 親を書いた直後は「子ではない」

    // 親行を描画（既存のままでOK）
    sheet.getRange(tRow, tCol, 1, 2).setFontWeight("bold").setFontSize(12);
    sheet.getRange(tRow, tCol).setValue(" " + (displayNameMap[p] || p)).setFontLine("underline");
    sheet.getRange(tRow, tCol + 1).setValue(pCount).setHorizontalAlignment("center");
    tRow++;

    const sortedChildren = Object.entries(children)
      .sort((a, b) => (itemOrder[a[0]] || 999) - (itemOrder[b[0]] || 999));

    // ★「表示される子」があるか（今までのルール通りに判定）
    const hasVisibleChild = sortedChildren.some(([c]) => !(c === p || displayNameMap[c] === displayNameMap[p]));

    // ★親の下に子があるなら「親行の下」に破線（後でまとめて引く）
    if (hasVisibleChild) {
      dashedBelowParentRows.push(parentRow);
    }

    // 子は今までのルール通り
    sortedChildren.forEach(([c, count]) => {
      if (c === p || displayNameMap[c] === displayNameMap[p]) return;

      sheet.getRange(tRow, tCol).setValue("   " + (displayNameMap[c] || c)).setFontSize(12);
      sheet.getRange(tRow, tCol + 1).setValue(count).setFontSize(12).setFontWeight("bold").setHorizontalAlignment("center");
      tRow++;

      lastPrintedWasChild = true; // ★最後に描いたのは子
    });
  });



  const groupEndRow = tRow - 1;

  applyGroupOuterBorder_(sheet, groupStartRow, groupEndRow, tCol, tCol + 1);
  applyGroupOuterBorder_(sheet, groupStartRow, groupStartRow, tCol, tCol + 1);

  // ★外枠処理の後で破線（先にやると外枠処理で消される可能性あり）
  dashedBelowParentRows.forEach(r => {
    sheet.getRange(r, tCol, 1, 2)
      .setBorder(null, null, true, null, null, null, "#000000", SpreadsheetApp.BorderStyle.DASHED);
  });

  dashedAboveParentRows.forEach(r => {
    sheet.getRange(r, tCol, 1, 2)
      .setBorder(true, null, null, null, null, null, "#000000", SpreadsheetApp.BorderStyle.DASHED);
  });


  // ★親に子が「表示される」時だけ、親行の下に破線（外枠処理の後でやる）
  dashedParentRows.forEach(r => {
    sheet.getRange(r, tCol, 1, 2)
      .setBorder(null, null, true, null, null, null, "#000000", SpreadsheetApp.BorderStyle.DASHED);
  });

  colRows[idx] = tRow + 1;

});


  [1, 4, 7].forEach(c => sheet.setColumnWidth(c, 210));
  [2, 5, 8].forEach(c => sheet.setColumnWidth(c, 45));
  if (ui) sheet.activate();
}

/**
 * グループ範囲に四方罫線（外枠のみ）を引く
 */
function applyGroupOuterBorder_(sheet, rowStart, rowEnd, colStart, colEnd) {
  if (!sheet) return;
  if (rowEnd < rowStart) return;

  sheet.getRange(rowStart, colStart, rowEnd - rowStart + 1, colEnd - colStart + 1)
    // top, left, bottom, right, vertical, horizontal
    .setBorder(true, true, true, true, false, false, "#000000", SpreadsheetApp.BorderStyle.SOLID);
}

/**
 * 入力 "2/14", "2月14日", "0214", "214", "11/1" など → {m,d} にする
 */
function parseMonthDay_(input) {
  const s = String(input || "").trim();
  if (!s) return null;

  // 1) M/D
  const slash = s.match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
  if (slash) return { m: Number(slash[1]), d: Number(slash[2]) };

  // 2) M月D日（D日は省略可）
  const mdj = s.match(/^(\d{1,2})\s*月\s*(\d{1,2})\s*日?$/);
  if (mdj) return { m: Number(mdj[1]), d: Number(mdj[2]) };

  // 3) 数字だけ（MMDD or MDD）
  const digits = s.replace(/[^0-9]/g, "");
  if (digits.length === 4) return { m: Number(digits.slice(0, 2)), d: Number(digits.slice(2, 4)) };
  if (digits.length === 3) return { m: Number(digits.slice(0, 1)), d: Number(digits.slice(1, 3)) };

  return null;
}

/** Date → "M/d"（A1表示用） */
function formatMDFromDate_(dt) {
  return Utilities.formatDate(dt, Session.getScriptTimeZone(), "M/d");
}

function packIntoLines_(items, maxCharsPerLine) {
  const cleaned = (items || [])
    .map(s => String(s || "").replace(/\r?\n/g, " ").trim())
    .filter(Boolean);

  const lines = [];
  let line = "";

  cleaned.forEach(m => {
    const tokenFirst = `・${m}`;
    const tokenNext  = `  ／  ${m}`;

    if (!line) { line = tokenFirst; return; }

    if ((line + tokenNext).length <= maxCharsPerLine) {
      line += tokenNext;
    } else {
      lines.push(line);
      line = tokenFirst;
    }
  });

  if (line) lines.push(line);
  return lines;
}

function estimateRowsForText_(text, maxCharsPerLine) {
  const rawLines = String(text || "").split("\n");
  return rawLines.reduce((sum, ln) => {
    const n = Math.max(1, Math.ceil(ln.length / Math.max(1, maxCharsPerLine)));
    return sum + n;
  }, 0);
}

// 任意：メモ塊の中で「日付」「総数」だけ大きくする（見た目が良い）
function applyMemoRichText_(range, memoText, line1Len, line2Len) {
  const titleStyle = SpreadsheetApp.newTextStyle().setBold(true).setFontSize(14).build();
  const totalStyle = SpreadsheetApp.newTextStyle().setBold(true).setFontSize(22).build();
  const bodyStyle  = SpreadsheetApp.newTextStyle().setBold(true).setFontSize(10).build();

  const i1End = line1Len;          // 1行目終端
  const i2Start = i1End + 1;       // 2行目開始（\nの次）
  const i2End = i2Start + line2Len; // 2行目終端

  let rt = SpreadsheetApp.newRichTextValue().setText(memoText);

  rt = rt.setTextStyle(0, i1End, titleStyle);
  rt = rt.setTextStyle(i2Start, i2End, totalStyle);
  if (i2End + 1 <= memoText.length) {
    rt = rt.setTextStyle(i2End + 1, memoText.length, bodyStyle);
  }

  range.setRichTextValue(rt.build());
}

function formatMDWFromDate_(dt) {
  const md = Utilities.formatDate(dt, Session.getScriptTimeZone(), "M/d");
  const w = ["日","月","火","水","木","金","土"][dt.getDay()];
  return `${md} ${w}`;
}

function formatMDWFromMD_(md) {
  // targetMD しか無い場合は「今年」として曜日を計算
  const y = new Date().getFullYear();
  const d = new Date(y, md.m - 1, md.d);
  // 不正日付（2/30など）ガード
  if (d.getMonth() + 1 !== md.m || d.getDate() !== md.d) return `${md.m}/${md.d}`;
  return formatMDWFromDate_(d);
}