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

    let pickupDateObj = null;
    let rawDate = "", rawTime = "";

    // FormService.gs（新規追加：配列/文字列を安全に文字列化）
    function normalizeMultiAnswer_(answer) {
      if (answer === null || answer === undefined) return "";

      // チェックボックスは配列で返る
      if (Array.isArray(answer)) {
        return answer
          .map(v => sanitizeSingleLine_(v))
          .filter(v => v !== "")
          .join(" / "); // 区切りはお好みで
      }

      // その他（記述式など）
      return sanitizeSingleLine_(answer);
    }

    // 改行を除去して1行に潰す
    function sanitizeSingleLine_(value) {
      return String(value || "")
        .replace(/\r\n|\n|\r/g, " ") // 改行→スペース
        .replace(/[ \t\u00A0]+/g, " ") // 連続空白・タブ等を1つに
        .trim();
    }


    
    itemResponses.forEach(r => {
      const item = r.getItem();
      if (!item) return;
      const title = item.getTitle() ? item.getTitle().trim() : "";
      const answer = r.getResponse();

      if (title.includes(CONFIG.FORM.NAME_SHORT)) formData.simpleName = answer || "";
      else if (title === CONFIG.FORM.NAME_FULL) formData.rawName = answer || "";
      else if (title.includes(CONFIG.FORM.PHONE)) formData.phoneNumber = answer ? "'" + answer : "";
      else if (title === CONFIG.FORM.PICKUP_DATE) rawDate = answer || "";
      else if (title === CONFIG.FORM.PICKUP_TIME) rawTime = answer || "";
      else if (title.includes(CONFIG.FORM.LINE_ID)) formData.userId = answer || "";
      else if (title.includes(CONFIG.FORM.NOTE)) { formData.note = normalizeMultiAnswer_(answer);}
      else if (title.includes(CONFIG.FORM.NOTE)) formData.note = answer || "";
      else this.parseOrder(title, answer, formData);
    });

    // --- Date生成 ---
    if (rawDate) {
      const m = rawDate.match(/(\d{1,2})\/(\d{1,2})/);
      if (m) {
        const month = Number(m[1]);
        const day   = Number(m[2]);
        const now = new Date();
        let year = now.getFullYear();
        if (now.getMonth() === 11 && month === 1) year++;
        pickupDateObj = new Date(year, month - 1, day);
      }
    }

    // ★ 内部用 Date
    formData.pickupDateRaw = pickupDateObj;

    // 表示用（既存仕様）
    formData.pickupDate =
      (rawDate || rawTime) ? `${rawDate} / ${rawTime}` : "";

    // ユーザー名確定
    formData.userName = formData.simpleName || formData.rawName || "";

    return formData;
  },

  parseOrder(title, answer, formData) {
    const menuData = MenuRepository.getMenu();
    const safeTitle = title ? String(title).trim() : "";
    const targets = menuData.filter(m => m.parentName === safeTitle);
    
    if (targets.length === 0) return;

    const counts = Array.isArray(answer) ? answer : String(answer).split(',');

    // 【重要】マスタの何行目を参照するかを管理するポインタ
    let masterPointer = 0;

    counts.forEach((countStr, index) => {
      if (!countStr || countStr.trim() === "") return;
      
      const count = parseInt(String(countStr).trim());
      if (isNaN(count) || count <= 0) {
        // 個数が0や空の場合は、マスタのポインタだけ進めて次の回答へ
        // ※グリッド形式の場合、回答の並びとマスタの並びは1:1で対応しているはずなので
        masterPointer++;
        return;
      }

      // 参照先の項目を取得
      let menu = targets[masterPointer];

      // 【修正の核心】
      // もし参照した項目が「親項目（小メニュー空）」だった場合、
      // それはグリッドの選択肢（具材）ではないので、その行を飛ばして次を見る
      while (menu && (!menu.childName || menu.childName.trim() === "") && targets.length > masterPointer + 1) {
        masterPointer++;
        menu = targets[masterPointer];
      }

      if (!menu) return;

      const displayName = menu.shortName || (menu.childName ? `${menu.parentName}(${menu.childName})` : menu.parentName);
      
      formData.orderDetails += `・${displayName} x ${count}\n`;
      formData.totalItems += count;
      formData.totalPrice += (menu.price || 0) * count;
      
      const group = menu.group || "その他";
      formData.groupSummary[group] = (formData.groupSummary[group] || 0) + count;

      // この回答の処理が終わったので、次の回答のためにマスタのポインタを進める
      masterPointer++;
    });
  }
};