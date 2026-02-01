/**
 * ================================
 * FormService.gs
 * フォーム回答の取得・解析
 * ================================
 */
const FormService = {

  /**
   * 最新のフォーム回答を取得
   */
  getLatestResponse(e) {
    if (e && e.response) return e.response;

    const ss = SpreadsheetApp.getActive();
    const formUrl = ss.getFormUrl();
    if (!formUrl) return null;

    const responses = FormApp.openByUrl(formUrl).getResponses();
    return responses.length ? responses.pop() : null;
  },

  /**
   * フォーム回答を解析して業務用データに変換
   */
  parseResponse(response, menuMap) {
    const itemResponses = response.getItemResponses();

    let userId = "";
    let userName = "";
    let phoneNumber = "";
    let pickupDate = "";
    let pickupTime = "";
    let note = "";
    let orderDetails = "";
    let totalItems = 0;
    let totalPrice = 0;
    let groupSummary = {};
    let isRegular = "";
    let isChange = false;

    for (const ir of itemResponses) {
      const item = ir.getItem();
      const title = item.getTitle().trim();
      const res = ir.getResponse();
      if (!res || res === "" || (Array.isArray(res) && res.every(v => v === null))) continue;

      // --- デバッグログ（既存維持） ---
      console.log("チェック中の項目名: [" + title + "]");

      // --- 変更予約判定 ---
      if (title.includes("元予約No")) {
        console.log("★元予約Noを検出しました！ 値: " + res);
        isChange = true;
        continue;
      }

      // --- 基本情報 ---
      if (title.toUpperCase().includes("LINE_ID")) {
        userId = res;
        continue;
      }
      if (title.includes("氏名")) {
        userName = res;
        if (title.includes("簡易")) isRegular = "常連";
        continue;
      }
      if (title.includes("電話")) {
        phoneNumber = "'" + res;
        continue;
      }
      if (title.includes("受け取り希望日")) {
        pickupDate = res;
        continue;
      }
      if (title.includes("受取希望時刻")) {
        pickupTime = res;
        continue;
      }
      if (title.includes("ご要望")) {
        note += (note ? " / " : "") + res;
        continue;
      }

      // 除外項目
      if (
        title.includes("ご利用されるのは") ||
        title.includes("商品を選ぶ") ||
        title.includes("注文を送信")
      ) {
        continue;
      }

      // --- 商品集計 ---
      if (item.getType() === FormApp.ItemType.GRID) {
        const rows = item.asGridItem().getRows();
        let gridDetails = "";

        for (let i = 0; i < rows.length; i++) {
          const count = Number(res[i]);
          if (!count || isNaN(count)) continue;

          const childLabel = rows[i].trim();
          const info = menuMap.children[childLabel];

          gridDetails += `  ${childLabel} x ${count}\n`;
          totalItems += count;

          if (info) {
            totalPrice += info.price * count;
            groupSummary[info.group] = (groupSummary[info.group] || 0) + count;
          }
        }

        if (gridDetails) {
          orderDetails += `・${title}:\n${gridDetails}`;
        }

      } else {
        const count = Number(res);
        if (!isNaN(count) && count > 0) {
          const info = menuMap.parents[title];

          orderDetails += `・${title} x ${count}\n`;
          totalItems += count;

          if (info) {
            totalPrice += info.price * count;
            groupSummary[info.group] = (groupSummary[info.group] || 0) + count;
          }
        }
      }
    }

    return {
      userId,
      userName,
      phoneNumber,
      pickupDate,
      pickupTime,
      note,
      orderDetails: orderDetails.trim(),
      totalItems,
      totalPrice,
      groupSummary,
      isRegular,
      isChange
    };
  }
};