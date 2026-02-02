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

    // FormService.gs 内の修正
    itemResponses.forEach(r => {
      const item = r.getItem();
      if (!item) return;
      const title = item.getTitle() ? item.getTitle().trim() : "";
      const answer = r.getResponse();

      // Configを参照して分岐
      if (title.includes(CONFIG.FORM.NAME_SHORT)) formData.simpleName = answer || "";
      else if (title === CONFIG.FORM.NAME_FULL) formData.rawName = answer || "";
      else if (title.includes(CONFIG.FORM.PHONE)) formData.phoneNumber = answer ? "'" + answer : "";
      else if (title === CONFIG.FORM.PICKUP_DATE) rawDate = answer || "";
      else if (title === CONFIG.FORM.PICKUP_TIME) rawTime = answer || "";
      else if (title.includes(CONFIG.FORM.LINE_ID)) formData.userId = answer || "";
      else if (title.includes(CONFIG.FORM.OLD_RESERVATION_NO)) formData.oldReservationNo = answer || "";
      else if (title.includes(CONFIG.FORM.NOTE)) formData.note = answer || "";
      else this.parseOrder(title, answer, formData);
    });

    // ユーザー名が空の場合のデフォルト値を設定
    formData.userName = formData.simpleName || formData.rawName || "";

    // 簡易名があれば優先、なければ氏名
    formData.userName = formData.simpleName || formData.rawName;
    // 常連判定と名簿更新
    formData.isRegular = CustomerService.checkAndUpdateCustomer(formData);
    (formData);
    // 日時整形
    formData.pickupDate = (rawDate || rawTime) ? `${rawDate} / ${rawTime}` : "";
    
    return formData;
  },

  parseOrder(title, answer, formData) {
    const menuData = MenuRepository.getMenu();
    // titleがnullの場合に備えて文字列化
    const safeTitle = title ? String(title).trim() : "";
    const targets = menuData.filter(m => m.parentName === safeTitle);
    
    if (targets.length === 0) return;

    const counts = Array.isArray(answer) ? answer : String(answer).split(',');

    counts.forEach((countStr, index) => {
      if (!countStr) return; // 空ならスキップ
      const count = parseInt(String(countStr).trim());
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