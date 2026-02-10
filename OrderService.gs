function normalizeChangeMeta_(metaOrBool, oldNo) {
  if (metaOrBool && typeof metaOrBool === "object") {
    return {
      isChange: !!metaOrBool.isChange,
      changeRequested: !!metaOrBool.changeRequested || !!oldNo,
      oldNo: String(metaOrBool.oldNo || oldNo || "").replace(/'/g, "").trim(),
      changeFailReason: String(metaOrBool.changeFailReason || ""),
      needsCheckReason: String(metaOrBool.needsCheckReason || ""),
      lateSubmission: !!metaOrBool.lateSubmission
    };
  }
  return {
    isChange: !!metaOrBool,
    changeRequested: !!oldNo,
    oldNo: String(oldNo || "").replace(/'/g, "").trim(),
    changeFailReason: "",
    needsCheckReason: "",
    lateSubmission: false
  };
}

function isDebugOrderSave_() {
  return ScriptProps.getBool(ScriptProps.KEYS.DEBUG_ORDER_SAVE, false);
}

function assertColumns_(colObj, keys) {
  const bad = keys.filter(k => !Number.isFinite(Number(colObj && colObj[k])));
  if (bad.length) {
    logToSheet("ERROR", "CONFIG.COLUMN missing/invalid", {
      bad,
      snapshot: keys.reduce((o, k) => (o[k] = colObj && colObj[k], o), {})
    });
    throw new Error("CONFIG.COLUMN is invalid: " + bad.join(", "));
  }
}


const OrderService = {
  saveOrder(reservationNo, formData, metaOrBool) {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      logToSheet("ERROR", "アクティブなスプレッドシートが取得できません（コンテナバインドで実行されていますか？）");
      throw new Error("ActiveSpreadsheet is null");
    }

    const sheet = ss.getSheetByName(CONFIG.SHEET.ORDER_LIST);
    if (!sheet) {
      // どのファイルを見ていて、どんなシートがあるか出す（原因特定用）
      logToSheet("ERROR", "注文一覧が見つかりません", {
        expected: CONFIG.SHEET.ORDER_LIST,
        ssName: ss.getName(),
        ssId: ss.getId(),
        sheets: ss.getSheets().map(s => s.getName()).join(", ")
      });
      throw new Error("注文一覧が見つかりません: " + CONFIG.SHEET.ORDER_LIST);
    }

    const oldNoRaw = String(formData.oldReservationNo || "").replace(/'/g, "").trim();
    const meta = normalizeChangeMeta_(metaOrBool, oldNoRaw);

    // 1) 旧予約は「変更が成立した時だけ」無効化
    if (meta.isChange && meta.oldNo) {
      try {
        this.updateOldReservation(sheet, meta.oldNo, reservationNo);
      } catch (err) {
        console.warn("updateOldReservation failed:", String(err));
      }
    }

    // ★書き込む列を“全部”ここに集約（空行事故を防ぐ）
    const COLS_USED = [
      "TIMESTAMP","ORDER_NO","TEL","NAME",
      "PICKUP_DATE","PICKUP_DATE_RAW",
      "NOTE","DETAILS","TOTAL_COUNT","TOTAL_PRICE",
      "LINE_ID","DAILY_SUMMARY","REGULAR_FLG",
      "STATUS","REASON","SOURCE_NO"
    ];
    assertColumns_(CONFIG.COLUMN, COLS_USED);


    // 2) 新規行データ
    const maxCol = Math.max(1, ...COLS_USED.map(k => Number(CONFIG.COLUMN[k])));
    const rowData = Array(maxCol).fill(""); // ← sparse配列事故を防ぐ
    rowData[CONFIG.COLUMN.TIMESTAMP - 1] = new Date();
    rowData[CONFIG.COLUMN.ORDER_NO - 1] = "'" + reservationNo;
    const tel0 = formData.phoneNumber ? String(formData.phoneNumber).replace(/'/g, "").trim() : "";
    rowData[CONFIG.COLUMN.TEL - 1] = tel0 ? ("'" + SECURITY_.sanitizeForSheet(tel0)) : "";
    rowData[CONFIG.COLUMN.NAME - 1] = SECURITY_.sanitizeForSheet(formData.userName);
    rowData[CONFIG.COLUMN.PICKUP_DATE - 1] = formData.pickupDate;
    rowData[CONFIG.COLUMN.PICKUP_DATE_RAW - 1] = formData.pickupDateRaw;
    rowData[CONFIG.COLUMN.NOTE - 1] = SECURITY_.sanitizeForSheet(String(formData.note || ""));
    rowData[CONFIG.COLUMN.DETAILS - 1] = SECURITY_.sanitizeForSheet(formData.orderDetails);
    rowData[CONFIG.COLUMN.TOTAL_COUNT - 1] = formData.totalItems;
    rowData[CONFIG.COLUMN.TOTAL_PRICE - 1] = formData.totalPrice;
    rowData[CONFIG.COLUMN.LINE_ID - 1] = SECURITY_.sanitizeForSheet(formData.userId);
    rowData[CONFIG.COLUMN.DAILY_SUMMARY - 1] = "";
    rowData[CONFIG.COLUMN.REGULAR_FLG - 1] = formData.isRegular ? "常連" : "";

    const needsCheck =
      (meta.changeRequested && !meta.isChange) ||
      (!!meta.needsCheckReason && String(meta.needsCheckReason).trim());

    // ★締切後送信は INVALID（厳密締切の“最終防波堤”）
    const isLate = !!meta.lateSubmission;
    const status = isLate
      ? CONFIG.STATUS.INVALID
      : (needsCheck ? CONFIG.STATUS.NEEDS_CHECK : CONFIG.STATUS.ACTIVE);

    rowData[CONFIG.COLUMN.STATUS - 1] = status;

    const reasons = [];
    if (isLate) reasons.push("締切後の送信：予約期限（前日20時）を過ぎています");
    if (meta.changeRequested && !meta.isChange) {
      reasons.push("予約変更希望だが新規扱い：" + (meta.changeFailReason || "要確認"));
    }
    if (meta.needsCheckReason) reasons.push(meta.needsCheckReason);
    rowData[CONFIG.COLUMN.REASON - 1] = reasons.filter(Boolean).join(" / ");


    // ★変更元予約No（oldNoは「入ってたら」保持しておく）
    rowData[CONFIG.COLUMN.SOURCE_NO - 1] = meta.oldNo ? "'" + meta.oldNo : "";

    const before = sheet.getLastRow();
    sheet.appendRow(rowData);
    const after = sheet.getLastRow();
    if (after <= before) {
      // 異常：増えていない（空行扱い/何かにより追加されてない）
      logToSheet("WARN", "saveOrder: lastRow not increased", {
        reservationNo, before, after, rowDataLen: rowData.length
      });
    }
    // ★調査モードのみ：位置特定やフィルタ状態まで見る（重い）
    if (isDebugOrderSave_()) {
      SpreadsheetApp.flush();
      const filter = sheet.getFilter();
      const filterRange = filter ? filter.getRange().getA1Notation() : "";
      const foundRow = findOrderRowByNo_(sheet, reservationNo);
      let hiddenByFilter = null;
      let hiddenByUser = null;
      try {
        if (foundRow) {
          hiddenByFilter = sheet.isRowHiddenByFilter(foundRow);
          hiddenByUser = sheet.isRowHiddenByUser(foundRow);
        }
      } catch (e) {}
      logToSheet("INFO", "saveOrder appended(debug)", {
        reservationNo, before, after, filterRange, foundRow,
        hiddenByFilter, hiddenByUser, rowDataLen: rowData.length
      });

      if (!foundRow) {
        logToSheet("ERROR", "saveOrder: reservationNo not found after appendRow", {
          reservationNo, filterRange
        });
      }
    }



  },

  updateOldReservation(sheet, oldNo, newNo) {
    const targetNo = String(oldNo || "").replace(/'/g, "").trim();
    if (!targetNo) return;

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return;

    const range = sheet.getRange(1, CONFIG.COLUMN.ORDER_NO, lastRow, 1);
    const data = range.getValues();

    for (let i = 0; i < data.length; i++) {
      const currentNo = String(data[i][0] || "").replace(/'/g, "").trim();
      if (currentNo !== targetNo) continue;

      const rowNum = i + 1;

      // ★旧予約：無効化
      sheet.getRange(rowNum, CONFIG.COLUMN.STATUS).setValue(CONFIG.STATUS.INVALID);

      // ★理由：新Noが分かるなら入れる（後追い確認が楽）
      const reason = newNo
        ? `予約変更により無効（新予約No: ${newNo}）`
        : "予約変更により無効（再予約あり）";
      sheet.getRange(rowNum, CONFIG.COLUMN.REASON).setValue(reason);

      // 灰色化（最終列は内部日付列まで）
      sheet.getRange(rowNum, 1, 1, CONFIG.COLUMN.PICKUP_DATE_RAW).setBackground("#E0E0E0");
      return;
    }
  }
};

function findOrderRowByNo_(sheet, reservationNo) {
  const target = String(reservationNo || "").replace(/'/g, "").trim();
  if (!target) return null;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const col = CONFIG.COLUMN.ORDER_NO;
  const values = sheet.getRange(2, col, lastRow - 1, 1).getValues();

  // ★後ろから探す（同じNoがあっても“最後に入ったやつ”を拾いやすい）
  for (let i = values.length - 1; i >= 0; i--) {
    const v = String(values[i][0] || "").replace(/^'/, "").replace(/'/g, "").trim();
    if (v === target) return i + 2;
  }
  return null;
}
