/**
 * 顧客管理に関連するサービス
 */
const CustomerService = {

  /**
   * フォーム送信時の名簿更新（CONFIG対応版）
   * 既存顧客なら更新してtrueを返し、新規なら追加してfalseを返す
   */
  checkAndUpdateCustomer: function(formData) {
    // ★方針：顧客名簿は廃止（個人情報管理コスト/リスクを下げる）
    // ここでは何もしない（既存コード互換のため false を返す）
    return false;
  },

  /**
   * サイドバー検索（氏名・電話番号での検索）
   */
  searchCustomers: function(query) {
    // 顧客名簿廃止：検索対象なし
    return [];
  },

  /**
   * 選択された行の顧客情報を取得
   */
  getCustomerByRow: function(row) {
      return {
      row: row,
      name: "(顧客名簿は廃止しました)",
      noteKitchen: "",
      noteOffice: ""
    };
  },

  /**
   * 備考の保存
   */
  saveCustomerNote: function(row, note, type) {
  // 顧客名簿廃止：保存先がない
  return "顧客名簿は廃止しました（備考の保存は行いません）";
  }

};

// =========================
// Sidebar(HtmlService) から呼ぶためのグローバル関数ラッパー
// ※google.script.run は “トップレベル関数” しか呼べないため
// =========================
function searchCustomers(query) {
  return CustomerService.searchCustomers(String(query || "").trim());
}

function getCustomerByRow(row) {
  return CustomerService.getCustomerByRow(Number(row));
}

function saveCustomerNote(row, note, type) {
  return CustomerService.saveCustomerNote(Number(row), String(note || ""), String(type || ""));
}

