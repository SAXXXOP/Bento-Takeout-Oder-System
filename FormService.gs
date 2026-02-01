const FormService = (() => {

  function parse(e) {
    const ss = SpreadsheetApp.openById("【スプレッドシートID】");
    const response = e?.response 
      ?? FormApp.openByUrl(ss.getFormUrl()).getResponses().pop();
    if (!response) throw new Error("フォーム回答なし");

    const menuMap = MenuRepository.build();
    const items = [];
    let context = {
      userId: "",
      userName: "",
      phone: "",
      pickupDate: "",
      pickupTime: "",
      note: "",
      isChange: false,
      items,
      totalItems: 0,
      totalPrice: 0,
      groupSummary: {}
    };

    response.getItemResponses().forEach(ir => {
      const title = ir.getItem().getTitle();
      const res = ir.getResponse();
      if (!res) return;

      if (title.includes("LINE_ID")) context.userId = res;
      else if (title.includes("氏名")) context.userName = res;
      else if (title.includes("電話")) context.phone = "'" + res;
      else if (title.includes("受け取り希望日")) context.pickupDate = res;
      else if (title.includes("受取希望時刻")) context.pickupTime = res;
      else if (title.includes("ご要望")) context.note = res;
      else if (title.includes("元予約No")) context.isChange = true;
      else {
        parseItem(ir, context, menuMap);
      }
    });

    return context;
  }

  function parseItem(ir, ctx, menuMap) {
    const item = ir.getItem();
    const res = ir.getResponse();

    if (item.getType() === FormApp.ItemType.GRID) {
      const rows = item.asGridItem().getRows();
      rows.forEach((label, i) => {
        const count = Number(res[i]);
        if (!count) return;
        addItem(ctx, label, count, menuMap.children[label]);
      });
    } else {
      const count = Number(res);
      if (!count) return;
      addItem(ctx, item.getTitle(), count, menuMap.parents[item.getTitle()]);
    }
  }

  function addItem(ctx, name, count, info) {
    ctx.items.push({ name, count });
    ctx.totalItems += count;
    if (info) {
      ctx.totalPrice += info.price * count;
      ctx.groupSummary[info.group] =
        (ctx.groupSummary[info.group] || 0) + count;
    }
  }

  return { parse };

})();
