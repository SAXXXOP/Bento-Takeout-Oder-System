/**
 * ================================
 * ReservationService.gs
 * 予約管理
 * ================================
 */
var ReservationService = {

  /**
   * 新規／変更を含めて予約作成
   */
  create(formData) {
    const props = PropertiesService.getScriptProperties();

    const isChange =
      props.getProperty(`CHANGE_${formData.userId}`) !== null;

    let changeSourceNo = "";

    if (isChange) {
      changeSourceNo = props.getProperty(`CHANGE_${formData.userId}`);
    }

    const reservationNo = this.issueReservationNo();

    return {
      no: reservationNo,
      isChange,
      changeSourceNo
    };
  },

  /**
   * 予約番号発行
   */
  issueReservationNo() {
    const sheet = SpreadsheetApp.getActive()
      .getSheetByName("予約管理");

    const lastNo = sheet.getRange("A1").getValue() || 0;
    const nextNo = Number(lastNo) + 1;

    sheet.getRange("A1").setValue(nextNo);

    return nextNo;
  },

  /**
   * 変更元予約No取得（OrderService用）
   */
  getChangeSourceNo(userId) {
    return PropertiesService
      .getScriptProperties()
      .getProperty(`CHANGE_${userId}`) || "";
  },

  /**
   * 一時データ削除
   */
  clearTempData(userId) {
    PropertiesService
      .getScriptProperties()
      .deleteProperty(`CHANGE_${userId}`);
  }
};
