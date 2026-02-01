const FormService = {
  parse(e) {
    let response;
    if (e && e.response) {
      response = e.response;
    } else {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const formUrl = ss.getFormUrl();
      response = FormApp.openByUrl(formUrl).getResponses().pop();
    }

    const itemResponses = response.getItemResponses();
    const formData = {
      userId: "",
      userName: "", // 最終的に決定する名前
      rawName: "",  // 氏名
      simpleName: "", // 氏名（簡易）
      phoneNumber: "",
      pickupDate: "",
      note: "",
      orderDetails: "",
      totalItems: 0,
      totalPrice: 0,
      groupSummary: {},
      isRegular: false // 常連判定フラグ
    };

    let rawDate = "";
    let rawTime = "";

    itemResponses.forEach(r => {
      const title = r.getItem().getTitle().trim();
      const answer = r.getResponse();

      if (title.includes("氏名（簡易）")) {
        formData.simpleName = answer;
      } else if (title === "氏名") {
        formData.rawName = answer;
      } else if (title.includes("電話番号")) {
        formData.phoneNumber = answer ? "'" + answer : "";
      } else if (title === "受け取り希望日") {
        rawDate = answer;
      } else if (title === "受取り希望時刻") {
        rawTime = answer;
      } else if (title.includes("LINE_ID")) {
        formData.userId = answer;
      } else if (title.includes("備考") || title.includes("リクエスト")) {
        formData.note = answer;
      } else {
        this.parseOrder(title, answer, formData);
      }
    });

    // --- 氏名の決定ロジック ---
    // 簡易名があれば優先、なければ氏名を使う
    formData.userName = formData.simpleName || formData.rawName;
    
    // --- 常連判定の実行 ---
    formData.isRegular = CustomerService.checkAndUpdateCustomer(formData);

    formData.pickupDate = (rawDate || rawTime) ? `${rawDate} / ${rawTime}` : "";
    return formData;
  },

  parseOrder(title, answer, formData) {
    const menuData = MenuRepository.getMenu();
    const targets = menuData.filter(m => m.parentName === title);
    if (targets.length === 0) return;
    const counts = Array.isArray(answer) ? answer : String(answer).split(',');
    counts.forEach((countStr, index) => {
      const count = parseInt(countStr.trim());
      if (isNaN(count) || count <= 0) return;
      const menu = targets[index];
      if (!menu) return;
      const displayName = menu.childName ? `${menu.parentName}(${menu.childName})` : menu.parentName;
      formData.orderDetails += `・${displayName} ${menu.price}円 x ${count}\n`;
      formData.totalItems += count;
      formData.totalPrice += menu.price * count;
      const group = menu.group || "その他";
      formData.groupSummary[group] = (formData.groupSummary[group] || 0) + count;
    });
  }
};