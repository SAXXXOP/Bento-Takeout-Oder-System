/**
 * フォーム送信時に実行されるメインルーチン
 */
function onFormSubmit(e) {
  // --- 【重要】二重送信防止のロック ---
  const lock = LockService.getScriptLock();
  try {
    // 最大30秒待機
    if (!lock.tryLock(30000)) {
      console.error("ロックを取得できませんでした");
      return;
    }


    // 1. フォームデータの解析
    const formData = FormService.parse(e);
    console.log("取得したLINE ID: " + formData.userId); // ★これを入れる
    if (!formData) return;
    
    // 2. 予約Noの生成
    const reservationInfo = FormService.generateReservationNo(formData);
    
    // 3. 顧客名簿の更新と常連フラグの判定
    // CustomerService.gs で復元した関数を呼び出し
    const isRegular = checkAndUpdateCustomer(formData);
    formData.isRegular = isRegular; 

    // 4. 注文一覧への書き込み
    OrderService.saveOrder(reservationInfo.no, formData, reservationInfo.isChange);

    // 5. LINE通知の送信（関数名はプロジェクトに合わせて調整してください）
    // sendNotification または sendReservationMessage
    LineService.sendNotification(reservationInfo.no, formData, reservationInfo.isChange);
    
  } catch (err) {
    console.error("エラー発生:", err.toString());
  } finally {
    // --- 【重要】事後処理 ---
    // 1. 処理が終わったら「変更中フラグ」を必ず消す（これがないと次回も変更扱いになる）
    if (typeof formData !== 'undefined' && formData.userId) {
      FormService.clearTempData(formData.userId); 
    }
    // 2. ロックを解除
    lock.releaseLock();
  }
}