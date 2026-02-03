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
   - フォームの oldReservationNo を最優先
   - 予備で CHANGE_TARGET も拾う
   ========================= */

    // ① フォームから来た「元予約No」があれば、それだけで変更扱い
    let oldNo = (formData.oldReservationNo || "").toString().replace(/'/g, "").trim();
    let isChange = !!oldNo;

    // ② 保険：もしフォームに無くても、LINE側の CHANGE_TARGET が残ってたら拾う
    if (!isChange) {
      const targetKey = `CHANGE_TARGET_${userId}`;
      const targetJson = props.getProperty(targetKey);

      if (targetJson) {
        const changeTarget = JSON.parse(targetJson);
        oldNo = (changeTarget.no || "").toString().replace(/'/g, "").trim();
        isChange = !!oldNo;
        props.deleteProperty(targetKey);
      }
    }

    // ③ 変更なら「旧予約」を変更前にする（2重でもOK）
    if (isChange && oldNo) {
      formData.oldReservationNo = oldNo;
      markReservationAsChanged(oldNo);
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
    lock.releaseLock();
}
}