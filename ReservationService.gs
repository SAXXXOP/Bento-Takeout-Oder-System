/**
 * ================================
 * ReservationService.gs
 * 予約番号・変更予約管理
 * ================================
 */
const ReservationService = {

  /**
   * 予約番号を発行
   */
  issueReservationNo() {
    const props = PropertiesService.getScriptProperties();
    const todayStr = Utilities.formatDate(new Date(), "JST", "MMdd");

    const lastDate = props.getProperty("LAST_DATE");
    const lastNum  = Number(props.getProperty("LAST_NUM") || 0);

    const dailyCount = (lastDate === todayStr) ? lastNum + 1 : 1;

    props.setProperty("LAST_DATE", todayStr);
    props.setProperty("LAST_NUM", dailyCount.toString());

    const no = `${todayStr}-${("0" + dailyCount).slice(-2)}`;

    return {
      no,
      isChange: false
    };
  },

  /**
   * 変更予約があれば、元予約を無効化
   */
  handleChangeReservation(formData) {
    if (!formData.userId) return;

    const userProps = PropertiesService.getUserProperties();
    const json = userProps.getProperty(`CHANGE_TARGET_${formData.userId}`);
    if (!json) return;

    const changeTarget = JSON.parse(json);
    const ss = SpreadsheetApp.getActive();
    const sheet = ss.getSheetByName("注文一覧");
    if (!sheet) return;

    const data = sheet.getDataRange().getValues();

    for (let i = 1; i < data.length; i++) {
      if (data[i][1].toString().replace("'", "") === changeTarget.no) {
        const row = i + 1;

        // M列：変更済
        sheet.getRange(row, 13).setValue("変更済");

        // 行全体をグレーアウト
        sheet.getRange(row, 1, 1, 14).setBackground("#cccccc");
        break;
      }
    }
  },

  /**
   * 変更元予約Noを取得
   */
  getChangeSourceNo(userId) {
    if (!userId) return "";
    const props = PropertiesService.getUserProperties();
    const json = props.getProperty(`CHANGE_TARGET_${userId}`);
    if (!json) return "";
    return JSON.parse(json).no || "";
  },

  /**
   * 一時データ削除
   */
  clearTempData(userId) {
    if (!userId) return;
    const props = PropertiesService.getUserProperties();
    props.deleteProperty(`CHANGE_TARGET_${userId}`);
    props.deleteProperty(`CHANGE_LIST_${userId}`);
  }
};
