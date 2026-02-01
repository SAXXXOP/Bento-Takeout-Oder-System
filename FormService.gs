/**
 * ================================
 * FormService.gs
 * フォーム回答解析
 * ================================
 */
const FormService = {

  /**
   * トリガーイベントから formData を生成
   */
  parse(e) {
    const response = this.getLatestResponse(e);
    if (!response) throw new Error("フォーム回答が取得できません");

    const itemResponses = response.getItemResponses();

    const formData = {
      userId: "",
      userName: "",
      phoneNumber: "",
      pickupDate: "",
      pickupTime: "",
      note: "",
      orderItems: [],
      orderDetails: "",
      groupSummary: {},
      totalItems: 0,
      totalPrice: 0,
      isRegular: false
    };

    // --- フォーム項目解析 ---
    itemResponses.forEach(r => {
      const title = r.getItem().getTitle();
      const answer = r.getResponse();

      switch (title) {
        case "お名前":
          formData.userName = answer;
          break;

        case "電話番号":
          formData.phoneNumber = "'" + answer;
          break;

        case "受取日":
          formData.pickupDate = answer;
          break;

        case "受取時間":
          formData.pickupTime = answer;
          break;

        case "ご要望":
          formData.note = answer;
          break;

        case "注文内容":
          this.parseOrder(answer, formData);
          break;
      }
    });

    // --- 注文内容組み立て ---
    this.buildOrderSummary(formData);

    return formData;
  },

  /**
   * 最新フォーム回答取得
   */
  getLatestResponse(e) {
    if (e && e.response) return e.response;

    const form = FormApp.getActiveForm();
    const responses = form.getResponses();
    return responses.length ? responses[responses.length - 1] : null;
  },

  /**
   * 注文内容解析
   */
  parseOrder(answer, formData) {
    if (!Array.isArray(answer)) return;

    answer.forEach(key => {
      if (!MenuRepository.exists(key)) return;

      const menu = MenuRepository.getByKey(key);

      formData.orderItems.push({
        key,
        name: menu.menuName,
        group: menu.group,
        price: menu.price
      });

      // 点数
      formData.totalItems += 1;

      // 金額
      formData.totalPrice += menu.price;

      // グループ集計
      if (!formData.groupSummary[menu.group]) {
        formData.groupSummary[menu.group] = 0;
      }
      formData.groupSummary[menu.group] += 1;
    });
  },

  /**
   * 注文内容文字列生成
   */
  buildOrderSummary(formData) {
    const lines = [];

    formData.orderItems.forEach(item => {
      lines.push(`・${item.name}　${item.price}円`);
    });

    formData.orderDetails = lines.join("\n");
  }
};
