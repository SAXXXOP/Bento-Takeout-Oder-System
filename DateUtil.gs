/**
 * ================================
 * DateUtil.gs
 * 日付・時間ユーティリティ
 * ================================
 */
const DateUtil = {

  /**
   * yyyy/MM/dd 形式に変換
   */
  formatDate(date) {
    return Utilities.formatDate(
      new Date(date),
      Session.getScriptTimeZone(),
      "yyyy/MM/dd"
    );
  },

  /**
   * HH:mm 形式に変換
   */
  formatTime(date) {
    return Utilities.formatDate(
      new Date(date),
      Session.getScriptTimeZone(),
      "HH:mm"
    );
  },

  /**
   * 今日かどうか
   */
  isToday(date) {
    const d = new Date(date);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  },

  /**
   * 明日かどうか
   */
  isTomorrow(date) {
    const d = new Date(date);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return d.toDateString() === tomorrow.toDateString();
  },

  /**
   * 日付＋時間をまとめて文字列化
   */
  formatDateTime(date) {
    return `${this.formatDate(date)} ${this.formatTime(date)}`;
  }
};
