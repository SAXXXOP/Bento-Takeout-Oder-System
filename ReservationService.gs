// ReservationService.gs
// ===============================
// 予約番号の生成と一時データ掃除だけを担当する
// 「予約変更かどうか」の判断は一切しない
// ===============================

const ReservationService = {

  /**
   * 予約番号を生成する
   * 形式: MMdd-連番（例: 0203-1）
   */
  create(formData) {
    const ss = SpreadsheetApp.getActive();
    const sheet = ss.getSheetByName("注文一覧");
    if (!sheet) {
      throw new Error("注文一覧シートが見つかりません");
    }

    const lastRow = sheet.getLastRow();
    const now = new Date();
    const prefix = Utilities.formatDate(now, "JST", "MMdd") + "-";
    let nextNum = 1;

    if (lastRow > 1) {
      const lastNo = sheet.getRange(lastRow, 2).getValue().toString();

      // 同日の予約なら連番を引き継ぐ
      if (lastNo.indexOf(prefix) === 0) {
        const currentNum = parseInt(lastNo.split("-")[1], 10);
        if (!isNaN(currentNum)) {
          nextNum = currentNum + 1;
        }
      }
    }

    return {
      no: prefix + nextNum
    };
  },

  /**
   * 一時データの掃除
   * Main.gs の finally から呼ばれる
   */
  clearTempData(userId) {
    if (!userId) return;

    const props = PropertiesService.getUserProperties();
    props.deleteProperty(`CHANGE_TARGET_${userId}`);
    props.deleteProperty(`CHANGE_LIST_${userId}`);
  }
};