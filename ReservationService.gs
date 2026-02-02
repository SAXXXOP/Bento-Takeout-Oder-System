// ReservationService.gs

const ReservationService = {
  create(formData) {
    const ss = SpreadsheetApp.getActive();
    const sheet = ss.getSheetByName("注文一覧");
    const lastRow = sheet.getLastRow();
    
    const now = new Date();
    const prefix = Utilities.formatDate(now, "JST", "MMdd") + "-";
    let nextNum = 1;

    if (lastRow > 1) {
      const lastNo = sheet.getRange(lastRow, 2).getValue().toString();
      if (lastNo.indexOf(prefix) !== -1) {
        const currentNum = parseInt(lastNo.split("-")[1]);
        if (!isNaN(currentNum)) {
          nextNum = currentNum + 1;
        }
      }
    }

    const reservationNo = prefix + nextNum;
    
    // ▼ ここで checkIsChange を呼び出す
    const isChange = this.checkIsChange(formData.userId);

    return {
      no: reservationNo,
      isChange: isChange
    };
  },
  
  /**
   * 予約変更かどうかを判定する
   * LineWebhook.gs で保存した一時データがあるかを確認
   */
  checkIsChange(userId) {
    const props = PropertiesService.getUserProperties();
    // LineWebhook.gs の change_confirm アクション時にセットした値をチェック
    const target = props.getProperty(`CHANGE_TARGET_${userId}`);
    return target !== null; 
  },
  
  // 後の掃除用
  clearTempData(userId) {
    const props = PropertiesService.getUserProperties();
    props.deleteProperty(`CHANGE_TARGET_${userId}`);
    props.deleteProperty(`CHANGE_LIST_${userId}`);
  }
};