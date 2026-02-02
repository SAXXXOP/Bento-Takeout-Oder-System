function onFormSubmit(e) {
  const lock = LockService.getScriptLock();
  let formData = null; // ★ finally で使うため先に宣言

  try {
    if (!lock.tryLock(20000)) return;

    /* =========================
       1. フォーム解析
       ========================= */
    formData = FormService.parse(e);
    if (!formData) return;

    /* =========================
       2. 予約変更チェック
       ========================= */
    const props = PropertiesService.getUserProperties();
    const targetJson = props.getProperty(`CHANGE_TARGET_${formData.userId}`);
    let changeTarget = null;

    if (targetJson) {
      changeTarget = JSON.parse(targetJson);

      // 旧予約を「変更前」に更新
      markReservationAsChanged(changeTarget.no);

      // 一度使ったら必ず消す
      props.deleteProperty(`CHANGE_TARGET_${formData.userId}`);
    }

    /* =========================
       3. 予約番号生成
       ========================= */
    const reservationInfo = ReservationService.create(formData);

    // ★ 変更予約フラグを最終確定
    reservationInfo.isChange = !!changeTarget;

    /* =========================
       4. 顧客更新
       ========================= */
    formData.isRegular =
      CustomerService.checkAndUpdateCustomer(formData);

    /* =========================
       5. 注文保存
       ========================= */
    OrderService.saveOrder(
      reservationInfo.no,
      formData,
      reservationInfo.isChange
    );

    /* =========================
       6. LINE送信
       ========================= */
    LineService.sendReservationMessage(
      reservationInfo.no,
      formData,
      reservationInfo.isChange
    );

  } catch (err) {
    console.error(err);
    throw err;

  } finally {
    // 一時データの後始末
    if (formData && formData.userId) {
      ReservationService.clearTempData(formData.userId);
    }
    lock.releaseLock();
  }
}