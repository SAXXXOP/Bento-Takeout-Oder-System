/**
 * ================================
 * MenuRepository.gs
 * メニューマスタ（スプレッドシート読込）
 * ================================
 */
const MenuRepository = (() => {

  let cache = null;

  function load() {
    if (cache) return cache;

    const sheet = SpreadsheetApp
      .getActive()
      .getSheetByName("メニューマスタ");
    if (!sheet) throw new Error("メニューMST が見つかりません");

    const values = sheet.getDataRange().getValues();
    values.shift(); // ヘッダ除去

    cache = {};

    values.forEach(row => {
      const key   = row[5];              // 略称（内部キー）
      const price = Number(row[4]);      // 価格

      if (!key || !price) return;

      // ※ key が重複する場合は「後勝ち」
      // （グリッド／大盛り／トッピングを優先）
      cache[key] = {
        price,
        group: row[1],
        menuName: row[2],
        subMenu: row[3] || ""
      };
    });

    return cache;
  }

  return {

    /** 全件取得 */
    getAll() {
      return load();
    },

    /** キー指定取得 */
    getByKey(key) {
      return load()[key] || null;
    },

    /** 価格取得 */
    getPrice(key) {
      return load()[key]?.price || 0;
    },

    /** メニュー名取得 */
    getMenuName(key) {
      return load()[key]?.menuName || "";
    },

    /** グループ取得 */
    getGroup(key) {
      return load()[key]?.group || "";
    },

    /** 存在チェック */
    exists(key) {
      return key in load();
    },

    /** キャッシュクリア（マスタ変更時用） */
    clearCache() {
      cache = null;
    }
  };

})();
