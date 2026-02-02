/**
 * ================================
 * Main.gs
 * フォーム送信トリガー入口
 * ================================
 */
function onFormSubmit(e) {
  const lock = LockService.getScriptLock();
  let formData; // finallyで使用するために外で定義
  try {
    lock.waitLock(20000);

    formData = FormService.parse(e);

    const reservationInfo = ReservationService.create(formData);

    OrderService.saveOrder(
      reservationInfo.no,
      formData,
      reservationInfo.isChange
    );

    CustomerService.checkAndUpdateCustomer(formData);

    LineService.sendReservationMessage(
      reservationInfo.no,
      formData,
      reservationInfo.isChange
    );

  } catch (err) {
    console.error("onFormSubmit エラー:", err);
  } finally {
    if (formData && formData.userId) {
      // 処理が終わったら「変更中フラグ」を消す
      ReservationService.clearTempData(formData.userId);
    }
    lock.releaseLock();
  }
}