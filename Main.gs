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

    // ★追加：フォーム送信→LINE通知までの待ち時間に「読み込み中」を表示
  // 1:1 の userId を chatId として利用（LineService側と同じ前提）
  if (formData.userId && String(formData.userId).trim()) {
    try {
      startLoadingAnimation(formData.userId, 20); // 5,10,15,20,...60 のいずれか（未対応値は20に丸め）:contentReference[oaicite:3]{index=3}
    } catch (e) {
      // ローディング失敗は致命ではないので握りつぶす
    }
  }


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

    // ★電話番号を必須（最終防波堤）
    const telIn = String(formData.phoneNumber || "").replace(/'/g, "").trim();
    const telDigitsIn = telIn.replace(/[^0-9]/g, ""); // 比較用

    if (changeRequested) {
      if (!telDigitsIn) {
        isChange = false;
        changeFailReason = "電話番号が未入力のため変更できません";
      }
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

      // ★追加：元予約No と 電話番号が一致しているか（不一致なら変更成立させない）
      if (isChange) {
      const telOld = getTelByOrderNo_(oldNo); // 下に追加するヘルパ
      const telDigitsOld = String(telOld || "").replace(/'/g, "").replace(/[^0-9]/g, "");
      if (telDigitsOld && telDigitsOld !== telDigitsIn) {
        isChange = false;
        changeFailReason = "電話番号が一致しません（元予約Noの変更不可）";
      }
    }
    }

    formData.oldReservationNo = oldNo || "";

    // ★追加：データ不整合チェック（要確認理由を集約）
    const needsCheckReasons = [];

    // pickupDateRaw が Date でない（内部用日付が壊れてる）
    if (!(formData.pickupDateRaw instanceof Date) || isNaN(formData.pickupDateRaw.getTime())) {
      needsCheckReasons.push("受け取り日が取得できません");
    }

    // ★追加：予約締切チェック（前日20時を過ぎた「受取日」は受付不可）
    // ※フォーム側の選択肢更新がズレても、ここで“送信時刻”基準で厳密に弾く
    if (formData.pickupDateRaw instanceof Date && !isNaN(formData.pickupDateRaw.getTime())) {
      const pickupDateOnlyNew = new Date(formData.pickupDateRaw);
      pickupDateOnlyNew.setHours(0, 0, 0, 0);

      if (!isWithinChangeDeadline(pickupDateOnlyNew, new Date())) {
        formData._lateSubmission = true;
        const dl = getChangeDeadline(pickupDateOnlyNew);
        const dlStr = Utilities.formatDate(dl, "Asia/Tokyo", "M/d HH:mm");
        needsCheckReasons.push(`予約期限（前日20時）を過ぎています（締切:${dlStr}）`);

        // 「変更」だった場合：新予約が締切後なら元予約を消すのは危険なので変更成立を止める
        if (isChange) {
          isChange = false;
          changeFailReason = "変更先が締切後のため変更できません（元予約は維持されます）";
        }
      }
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

    // 3. 予約番号生成
    const reservationInfo = ReservationService.create(formData);

    // 4. 常連判定（顧客名簿廃止：注文一覧から電話番号で簡易判定）
    // ※電話未入力の場合は判定できないので false
    formData.isRegular = isRegularByTel_(formData.phoneNumber);

    // ★追加：フォーム解析（数量の自由記入等）で積んだ要確認理由を合流
    if (Array.isArray(formData._needsCheckReasons) && formData._needsCheckReasons.length) {
      needsCheckReasons.push(...formData._needsCheckReasons);
    }

    // 電話番号が空（必須運用なら）
    if (!telDigitsIn) {
    // フォーム側で必須でも、最終防波堤として INVALID に落とす
    needsCheckReasons.push("電話番号が未入力です（必須）");
    formData._forceInvalid = true;
  }

    // ★ここで meta を確定（この1個だけを後段に渡す）
    const changeMeta = {
      isChange,
      changeRequested,
      oldNo,
      changeFailReason,
      // ★理由が空でも「★要確認」にできるフラグ
      needsCheck: !!formData._needsCheckFlag || needsCheckReasons.length > 0,
      needsCheckReason: needsCheckReasons.join(" / "),
      lateSubmission: !!formData._lateSubmission,
      forceInvalid: !!formData._forceInvalid
    };

    // 5. 注文保存
    OrderService.saveOrder(reservationInfo.no, formData, changeMeta);

    // 5.1 運用通知キューへ追加（予約/変更 → 1時間ごとにまとめて送信）
    try {
      if (typeof opsNotifyEnqueueFromForm_ === "function") {
        opsNotifyEnqueueFromForm_(reservationInfo.no, formData, changeMeta);
      }
    } catch (err) {
      // 通知失敗は致命ではない（注文処理は継続）
      try { if (typeof logToSheet === "function") logToSheet("WARN", "opsNotify enqueue failed", { err: String(err) }); } catch (e) {}
    }


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

// Main.gs（ヘルパ関数群に追加推奨）
// 元予約Noに紐づく電話番号を取得（なければ空文字）
function getTelByOrderNo_(orderNo) {
  const target = String(orderNo || "").replace(/'/g, "").trim();
  if (!target) return "";
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName(CONFIG.SHEET.ORDER_LIST);
  if (!sh) return "";

  const lastRow = sh.getLastRow();
  if (lastRow < 2) return "";

  // ORDER_NO列を走査（後ろから探す：最新を拾いやすい）
  const colNo = CONFIG.COLUMN.ORDER_NO;
  const colTel = CONFIG.COLUMN.TEL;
  const vals = sh.getRange(2, colNo, lastRow - 1, 1).getValues();

  for (let i = vals.length - 1; i >= 0; i--) {
    const no = String(vals[i][0] || "").replace(/^'/, "").replace(/'/g, "").trim();
    if (no !== target) continue;
    return sh.getRange(i + 2, colTel).getValue() || "";
  }
  return "";
}

// 直近の注文一覧から電話番号一致を数えて常連扱いにする（顧客名簿なし運用）
// - 小規模店舗前提で、直近 MAX_SCAN 件のみスキャンして負荷を抑える
// - INVALID は除外（それ以外はカウント対象）
const REGULAR_MIN_ORDERS_ = 3; // ここ以上で「常連」
const REGULAR_MAX_SCAN_ = 500; // 直近何件を見るか

function isRegularByTel_(tel) {
  const telNorm = String(tel || "").replace(/'/g, "").trim();
  if (!telNorm) return false;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEET.ORDER_LIST);
  if (!sheet) return false;

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false; // ヘッダのみ

  const startRow = Math.max(2, lastRow - REGULAR_MAX_SCAN_ + 1);
  const numRows = lastRow - startRow + 1;

  const telCol = CONFIG.COLUMN.TEL;
  const statusCol = CONFIG.COLUMN.STATUS;

  const tels = sheet.getRange(startRow, telCol, numRows, 1).getValues();
  const statuses = sheet.getRange(startRow, statusCol, numRows, 1).getValues();

  let cnt = 0;
  for (let i = 0; i < numRows; i++) {
    const s = String(statuses[i][0] || "");
    if (s === CONFIG.STATUS.INVALID) continue;

    const t = String(tels[i][0] || "").replace(/'/g, "").trim();
    if (t && t === telNorm) {
      cnt++;
      if (cnt >= REGULAR_MIN_ORDERS_) return true;
    }
  }
  return false;
}
