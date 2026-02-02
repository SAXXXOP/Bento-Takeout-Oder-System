function onFormSubmit(e) {
  const lock = LockService.getScriptLock();
  let formData = null;

  try {
    if (!lock.tryLock(20000)) return;

    /* =========================
       1. フォーム解析
       ========================= */
    formData = FormService.parse(e);
    if (!formData) return;

    const userId = formData.userId;
    const props = PropertiesService.getUserProperties();

    /* =========================
       2. 予約変更チェック（★司令塔）
       ========================= */
    const targetKey = `CHANGE_TARGET_${userId}`;
    const targetJson = props.getProperty(targetKey);

    let isChange = false;
    let changeTarget = null;

    if (targetJson) {
      // ▼ 変更予約と確定
      changeTarget = JSON.parse(targetJson);
      isChange = true;

      // 旧予約を「変更前」に更新
      markReservationAsChanged(changeTarget.no);

      // 新規行に「元予約No」を明示的に渡す
      formData.oldReservationNo = changeTarget.no;

      // 一時データは必ず削除
      props.deleteProperty(targetKey);
    }

    /* =========================
       3. 予約番号生成
       ========================= */
    const reservationInfo = ReservationService.create(formData);
    // ※ ReservationService は番号を作るだけ

    /* =========================
       4. 顧客情報更新
       ========================= */
    formData.isRegular =
      CustomerService.checkAndUpdateCustomer(formData);

    /* =========================
       5. 注文保存
       ========================= */
    OrderService.saveOrder(
      reservationInfo.no,
      formData,
      isChange
    );

    /* =========================
       6. LINE送信
       ========================= */
    LineService.sendReservationMessage(
      reservationInfo.no,
      formData,
      isChange
    );

  } catch (err) {
    console.error("onFormSubmit エラー", err);
    throw err;

  } finally {
    // 念のため残骸掃除
    if (formData && formData.userId) {
      ReservationService.clearTempData(formData.userId);
    }
    lock.releaseLock();
  }
}