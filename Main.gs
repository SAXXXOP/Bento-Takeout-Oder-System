/**
 * フォーム送信時に実行されるメインルーチン
 */
// Main.gs (3行目〜)
function onFormSubmit(e) {
  const lock = LockService.getScriptLock();
  try {
    if (!lock.tryLock(30000)) return;

    const formData = FormService.parse(e);
    if (!formData) return;
    
    // ここで予約No生成（ReservationServiceの関数名に合わせる）
    const reservationInfo = ReservationService.create(formData);
    
    // 接頭辞を消す
    const isRegular = checkAndUpdateCustomer(formData);
    formData.isRegular = isRegular; 

    OrderService.saveOrder(reservationInfo.no, formData, reservationInfo.isChange);

    // LineServiceの公開名に合わせる
    LineService.sendReservationMessage(reservationInfo.no, formData, reservationInfo.isChange);
    
  } catch (err) {
    console.error("エラー発生:", err.toString());
  } finally {
    if (typeof formData !== 'undefined' && formData.userId) {
      // ReservationService.gs内の関数名に合わせる
      ReservationService.clearTempData(formData.userId); 
    }
    lock.releaseLock();
  }
}