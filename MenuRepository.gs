const MenuRepository = (() => {

  function build() {
    const sheet = SpreadsheetApp
      .getActive()
      .getSheetByName("メニューマスタ");

    const values = sheet.getDataRange().getValues().slice(1);
    const map = { parents: {}, children: {} };

    values.forEach(r => {
      const info = {
        group: r[1],
        parent: r[2],
        child: r[3],
        price: Number(r[4]) || 0
      };
      if (info.parent) map.parents[info.parent] = info;
      if (info.child) map.children[info.child] = info;
    });

    return map;
  }

  return { build };

})();
