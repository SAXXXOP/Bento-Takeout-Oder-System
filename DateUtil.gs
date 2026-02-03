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
  },

  /**
   * ★追加：入力を mmdd(4桁) に正規化する
   * - Date → "0214"
   * - "2/14(土) / 8:30~9:30" → "0214"
   * - "214" → "0214"
   * - "0214" → "0214"
   */
  toMMDD4(input) {
    if (!input) return "";

    // Date 型
    if (Object.prototype.toString.call(input) === "[object Date]" && !isNaN(input)) {
      const m = input.getMonth() + 1;
      const d = input.getDate();
      return String(m).padStart(2, "0") + String(d).padStart(2, "0");
    }

    const s = String(input).trim();
    if (!s) return "";

    // 例: "2/14(土) / 8:30~9:30" などから月日だけ抜く
    const md = s.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
    if (md) return md[1].padStart(2, "0") + md[2].padStart(2, "0");

    // 数字だけ（"214" や "0214"）
    const digits = s.replace(/\D/g, "");
    if (digits.length === 4) return digits;
    if (digits.length === 3) return "0" + digits;

    return "";
  },

  /**
   * ★追加：注文一覧の1行から日付キー(mmdd4)を取る（O列優先→E列フォールバック）
   */
  rowMMDD4(oDate, eText) {
    return this.toMMDD4(oDate) || this.toMMDD4(eText);
  }
};