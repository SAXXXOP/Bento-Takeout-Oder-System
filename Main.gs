function onFormSubmit(e) {
  const lock = LockService.getScriptLock();
  try {
    // 20秒待機
    if (!lock.tryLock(20000)) {
      console.error("ロックを取得できませんでした");
      return;
    }

    // 1. フォームデータの解析 (FormService.gs)
    const formData = FormService.parse(e);
    if (!formData) return;
    
    // 2. 予約Noの生成と変更判定 (ReservationService.gs)
    const reservationInfo = ReservationService.create(formData);
    
    // 3. 顧客名簿の更新 (CustomerService.gs が定義されているか確認！)
    // もしエラーが続くなら、ここを CustomerService ではなく 
    // 実際のファイル内で定義されている変数名に変えてください。
    formData.isRegular = CustomerService.checkAndUpdateCustomer(formData);

    // 4. 注文一覧への書き込み (OrderService.gs)
    OrderService.saveOrder(reservationInfo.no, formData, reservationInfo.isChange);

    // 5. LINE通知の送信 (LineService.gs)
    LineService.sendReservationMessage(reservationInfo.no, formData, reservationInfo.isChange);
    
  } catch (err) {
    console.error("エラー発生:", err.stack); // stackを表示すると原因が分かりやすくなります
  } finally {
    // 6. 予約変更時の一時データを削除
    if (typeof formData !== 'undefined' && formData.userId) {
      ReservationService.clearTempData(formData.userId); 
    }
    lock.releaseLock();
  }
}