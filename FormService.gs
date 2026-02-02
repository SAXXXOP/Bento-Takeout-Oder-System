const FormService = {
  parse(e) {
    let response;
    if (e && e.response) {
      response = e.response;
    } else {
      const formUrl = SpreadsheetApp.getActiveSpreadsheet().getFormUrl();
      response = FormApp.openByUrl(formUrl).getResponses().pop();
    }

    const itemResponses = response.getItemResponses();
    const formData = {
      userId: "", userName: "", rawName: "", simpleName: "",
      phoneNumber: "", pickupDate: "", note: "",
      orderDetails: "", totalItems: 0, totalPrice: 0,
      groupSummary: {}, isRegular: false
    };

    let rawDate = "", rawTime = "";

    itemResponses.forEach(r => {
      const item = r.getItem();
      if (!item) return;
      const title = item.getTitle() ? item.getTitle().trim() : ""; // 安全に取得
      const answer = r.getResponse();

      if (title.includes("氏名（簡易）")) formData.simpleName = answer || "";
      else if (title === "氏名") formData.rawName = answer || "";
      else if (title.includes("電話番号")) formData.phoneNumber = answer ? "'" + answer : "";
      else if (title === "受け取り希望日") rawDate = answer || "";
      else if (title === "受取り希望時刻") rawTime = answer || "";
      else if (title.includes("LINE_ID")) formData.userId = answer || "";
      else if (title.includes("旧予約番号")) formData.oldReservationNo = answer || ""; // 追加
      else if (title.includes("備考") || title.includes("リクエスト")) formData.note = answer || "";
      else this.parseOrder(title, answer, formData);
    });

    // ユーザー名が空の場合のデフォルト値を設定
    formData.userName = formData.simpleName || formData.rawName || "";

    // 簡易名があれば優先、なければ氏名
    formData.userName = formData.simpleName || formData.rawName;
    // 常連判定と名簿更新
    formData.isRegular = CustomerService.checkAndUpdateCustomer(formData);
    // 日時整形
    formData.pickupDate = (rawDate || rawTime) ? `${rawDate} / ${rawTime}` : "";
    
    return formData;
  },

  parseOrder(title, answer, formData) {
    const menuData = MenuRepository.getMenu();
    // マスタのC列(parentName)と質問文が一致するものを抽出
    const targets = menuData.filter(m => m.parentName === title);
    if (targets.length === 0) return;

    // グリッド回答(1, 0, 1など)を配列化
    const counts = Array.isArray(answer) ? answer : String(answer).split(',');

    counts.forEach((countStr, index) => {
      const count = parseInt(countStr.trim());
      if (isNaN(count) || count <= 0) return;

      const menu = targets[index];
      if (!menu) return;

      const displayName = menu.childName ? `${menu.parentName}(${menu.childName})` : menu.parentName;
      formData.orderDetails += `・${displayName} x ${count}\n`;
      formData.totalItems += count;
      formData.totalPrice += menu.price * count;
      
      const group = menu.group || "その他";
      formData.groupSummary[group] = (formData.groupSummary[group] || 0) + count;
    });
  }
};