const ReservationService = {
  create(formData) {
    const ss = SpreadsheetApp.getActive();
    const sheet = ss.getSheetByName("注文一覧");
    const lastRow = sheet.getLastRow();
    
    // 今日の日付から接頭辞作成 (例: 0201-)
    const now = new Date();
    const prefix = Utilities.formatDate(now, "JST", "MMdd") + "-";
    
    let nextNum = 1;

    if (lastRow > 1) {
      // B列(2列目)から最新の予約番号を取得
      const lastNo = sheet.getRange(lastRow, 2).getValue().toString();
      
      // 接頭辞が含まれているかチェックして番号を抽出
      if (lastNo.indexOf(prefix) !== -1) {
        const currentNum = parseInt(lastNo.split("-")[1]);
        if (!isNaN(currentNum)) {
          nextNum = currentNum + 1;
        }
      }
    }

    const reservationNo = prefix + nextNum;
    
    // 変更かどうかの判定（既存ロジック）
    const isChange = this.checkIsChange(formData.userId);

    return {
      no: reservationNo,
      isChange: isChange
    };
  },
  
  // 以前の注文があるか確認するロジック（適宜既存のものを使用）
  checkIsChange(userId) {
    // 既存の LineWebhook 等で使っている一時保存データから判定
    return false; 
  },
  
  getChangeSourceNo(userId) { return ""; },
  clearTempData(userId) {}
};