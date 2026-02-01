/**
 * ================================
 * Main.gs
 * フォーム送信トリガー入口
 * ================================
 */
function onFormSubmit(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    console.error("ロック取得失敗");
    return;
  }

  try {
    // 1. フォーム回答取得
    const response = FormService.getLatestResponse(e);
    if (!response) return;

    // 2. メニューマスタ取得
    const menuMap = MenuRepository.buildMenuMap();

    // 3. フォーム内容解析
    const formData = FormService.parseResponse(response, menuMap);

    // 4. 予約番号発行
    const reservationInfo = ReservationService.issueReservationNo();

    // 5. 変更予約処理（必要な場合）
    ReservationService.handleChangeReservation(formData);

    // 6. 注文一覧へ書き込み
    OrderService.saveOrder(
      reservationInfo.no,
      formData,
      reservationInfo.isChange
    );

    // 7. 顧客名簿更新
    CustomerService.update(
      formData.userId,
      formData.userName,
      formData.phoneNumber,
      formData.totalPrice,
      formData.orderDetails,
      formData.totalItems
    );

    // 8. LINE通知
    LineService.sendReservationMessage(
      reservationInfo.no,
      formData,
      reservationInfo.isChange
    );

    // 9. 一時プロパティ削除
    ReservationService.clearTempData(formData.userId);

  } catch (err) {
    console.error("onFormSubmit エラー:", err);
  } finally {
    lock.releaseLock();
  }
}
