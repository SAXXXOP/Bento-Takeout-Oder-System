// Main.gs
function onFormSubmit(e) {
  const lock = LockService.getScriptLock();
  let locked = false;
  let formData = null;

  try {
    locked = lock.tryLock(20000);
    if (!locked) {
      console.warn("onFormSubmit: could not acquire lock");
      logToSheet("WARN", "onFormSubmit: could not acquire lock");
      return;
    }

  function isDebugMain_() {
    return PropertiesService.getScriptProperties().getProperty(CONFIG.PROPS.DEBUG_MAIN) === "1";
  }


    /* =========================
       1. フォーム解析
       ========================= */
    formData = FormService.parse(e);
    if (!formData) return;

    if (isDebugMain_()) logToSheet("INFO", "onFormSubmit parsed", {
     userId: formData.userId,
     pickupDate: formData.pickupDate,
     totalItems: formData.totalItems,
     totalPrice: formData.totalPrice
   });

    /* =========================
      2. 予約変更チェック（propsレス）
      - フォームの oldReservationNo のみで判定
      ========================= */
    let oldNo = String(formData.oldReservationNo || "")
      .replace(/'/g, "")
      .trim();

    const changeRequested = !!oldNo;
    let isChange = changeRequested;
    let changeFailReason = "";

    if (changeRequested) {
      const pickupDateOnly = getPickupDateOnlyByOrderNo(oldNo);

      if (!pickupDateOnly) {
        isChange = false;
        changeFailReason = "元予約Noが見つかりません";
        console.warn("change requested but old order not found or date missing:", oldNo);
      } else if (!isWithinChangeDeadline(pickupDateOnly, new Date())) {
        isChange = false;
        changeFailReason = "変更期限（前日20時）を過ぎています";
        console.warn("change requested after deadline:", { oldNo: oldNo, pickupDate: String(pickupDateOnly) });
      }
    }

    formData.oldReservationNo = oldNo || "";

    // ★追加：データ不整合チェック（要確認理由を集約）
    const needsCheckReasons = [];

    // pickupDateRaw が Date でない（内部用日付が壊れてる）
    if (!(formData.pickupDateRaw instanceof Date) || isNaN(formData.pickupDateRaw.getTime())) {
      needsCheckReasons.push("受け取り日が取得できません");
    }

    // 注文内容が空
    if (!formData.orderDetails || !String(formData.orderDetails).trim()) {
      needsCheckReasons.push("注文内容が空です");
    }

    // 合計が不正
    const items = Number(formData.totalItems);
    const price = Number(formData.totalPrice);
    if (!isFinite(items) || items <= 0) needsCheckReasons.push("総数が不正です");
    if (!isFinite(price) || price < 0) needsCheckReasons.push("合計金額が不正です");

    // LINE_ID が無い（通知できない）
    if (!formData.userId || !String(formData.userId).trim()) {
      needsCheckReasons.push("LINE_IDが取得できません");
    }

    // 電話番号が空（必須運用なら）
    if (!formData.phoneNumber || !String(formData.phoneNumber).trim()) {
      needsCheckReasons.push("電話番号が未入力です");
    }

    // ★ここで meta を確定（この1個だけを後段に渡す）
    const changeMeta = {
      isChange,
      changeRequested,
      oldNo,
      changeFailReason,
      // 追加：データ不整合系の要確認理由
      needsCheckReason: needsCheckReasons.join(" / ")
    };

    /* =========================
       3. 予約番号生成
       ========================= */
    const reservationInfo = ReservationService.create(formData);

    /* =========================
       4. 顧客情報更新
       ========================= */
    formData.isRegular = CustomerService.checkAndUpdateCustomer(formData);

   
      if (isDebugMain_()) logToSheet("INFO", "before saveOrder", { reservationNo: reservationInfo.no });


    /* =========================
       5. 注文保存
       ========================= */
    OrderService.saveOrder(reservationInfo.no, formData, changeMeta);


      if (isDebugMain_()) logToSheet("INFO", "after saveOrder", { reservationNo: reservationInfo.no });


    /* =========================
       6. 変更候補キャッシュ無効化（存在すれば）
       ========================= */
    try {
      if (formData.userId) {
        CacheService.getUserCache().remove(`CHANGEABLE_LIST_${formData.userId}`);
      }
    } catch (err) {
      // キャッシュ削除失敗は致命ではない
      console.warn("cache remove failed:", String(err));
    }

    /* =========================
       7. LINE送信（失敗しても注文保存は止めない）
       ========================= */
    // Main.gs / onFormSubmit(e) のLINE送信部分
    // 7. LINE送信
        try {
      const r = LineService.sendReservationMessage(
        reservationInfo.no,
        formData,
        changeMeta
      );

      if (!r || r.ok !== true) {
        console.warn("LINE push failed:", JSON.stringify(r));
      }
    } catch (err) {
      console.warn("LINE push threw:", String(err));
    }

    } catch (err) {
      console.warn("onFormSubmit error:", String(err));
      logToSheet("ERROR", "onFormSubmit error", {
        message: String(err),
        stack: err && err.stack,
        userId: formData && formData.userId,
        oldReservationNo: formData && formData.oldReservationNo
      });
      throw err; // 実行履歴を失敗にして原因を追える（不要なら後で外してOK）
  } finally {
    if (locked) {
      try {
        lock.releaseLock();
      } catch (err) {
        // ignore
      }
    }
  }
}

function getPickupDateOnlyByOrderNo(orderNo) {
  if (!orderNo) return null;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss && ss.getSheetByName(CONFIG.SHEET.ORDER_LIST);
  if (!sheet) return null;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  const targetNo = String(orderNo).replace(/'/g, "").trim();
  if (!targetNo) return null;

  const colOrderNo = CONFIG.COLUMN.ORDER_NO;

  try {
    const finder = sheet
      .getRange(2, colOrderNo, lastRow - 1, 1)
      .createTextFinder(targetNo)
      .matchEntireCell(true);

    const cell = finder.findNext();
    if (!cell) return null;

    const row = cell.getRow();

    const o = sheet.getRange(row, CONFIG.COLUMN.PICKUP_DATE_RAW).getValue();
    const e = sheet.getRange(row, CONFIG.COLUMN.PICKUP_DATE).getValue();

    let d = parsePickupDate(o);
    if (!d) d = parsePickupDate(e);

    return d || null;
  } catch (err) {
    console.warn("getPickupDateOnlyByOrderNo failed:", String(err));
    return null;
  }
}