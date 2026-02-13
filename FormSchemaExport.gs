/** FormSchemaExport.gs
 * 予約フォームの「セクション/質問/選択肢」定義を抽出してシートに出力する
 *
 * 使い方：
 *  - スプレッドシートに紐づいたフォームがある場合： exportReservationFormSchemaToSheet();
 *  - フォームURL/IDを指定する場合： exportReservationFormSchemaToSheet("https://docs.google.com/forms/d/....../edit");
 */
function exportReservationFormSchemaToSheet(formUrlOrId, sheetName) {
  const form = openFormForExport_(formUrlOrId);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const outName = sheetName || "フォーム定義";
  const sheet = ss.getSheetByName(outName) || ss.insertSheet(outName);

  sheet.clearContents();

  // ヘッダー
  const header = [
    "sectionNo",
    "sectionTitle",
    "itemIndex",
    "itemId",
    "itemType",
    "title",
    "helpText",
    "required",
    "detailJson"
  ];
  sheet.getRange(1, 1, 1, header.length).setValues([header]);

  const items = form.getItems();

  // セクション管理（PAGE_BREAK を「新セクション開始」として扱う）
  let sectionNo = 1;
  let sectionTitle = "(最初のセクション)";
  const rows = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const type = item.getType(); // FormApp.ItemType
    const typeStr = String(type);

    // PAGE_BREAK は「次のセクション開始」なので、先に更新
    if (type === FormApp.ItemType.PAGE_BREAK) {
      sectionNo += 1;
      const pb = item.asPageBreakItem();
      sectionTitle = pb.getTitle() || "(無題セクション)";
    }

    const title = safeCall_(() => item.getTitle(), "");
    const helpText = safeCall_(() => item.getHelpText(), "");

    const required = safeCall_(() => item.asQuestionItem().isRequired(), ""); // layout item は例外になるので safe

    const detail = buildItemDetail_(item, type);

    rows.push([
      sectionNo,
      sectionTitle,
      safeCall_(() => item.getIndex(), ""),
      safeCall_(() => item.getId(), ""),
      typeStr,
      title,
      helpText,
      required,
      detail ? JSON.stringify(detail) : ""
    ]);
  }

  if (rows.length) {
    sheet.getRange(2, 1, rows.length, header.length).setValues(rows);
  }

  // 参考ログ
  Logger.log("Form title: " + form.getTitle());
  Logger.log("Editor URL: " + form.getEditUrl());      // Form.getEditUrl :contentReference[oaicite:1]{index=1}
  Logger.log("Published URL: " + form.getPublishedUrl()); // Form.getPublishedUrl :contentReference[oaicite:2]{index=2}
  Logger.log("Exported rows: " + rows.length);
}

/** フォームを開く（引数なしなら「アクティブSSの紐づきフォーム」→ダメなら ActiveForm を試す） */
function openFormForExport_(formUrlOrId) {
  if (formUrlOrId) {
    if (String(formUrlOrId).match(/^https?:\/\//)) return FormApp.openByUrl(String(formUrlOrId));
    return FormApp.openById(String(formUrlOrId));
  }

  // 1) スプレッドシート紐づきフォーム
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const url = ss.getFormUrl();
    if (url) return FormApp.openByUrl(url);
  } catch (e) {
    // noop
  }

  // 2) フォームバインド（フォーム側にスクリプトがある場合）
  try {
    return FormApp.getActiveForm();
  } catch (e) {
    // noop
  }

  throw new Error(
    "フォームを特定できません。フォームURL/IDを引数で渡すか、スプレッドシートにフォームを紐づけてください。"
  );
}

/** ItemTypeごとの詳細情報を組み立て（選択肢/行列/スケール等） */
function buildItemDetail_(item, type) {
  try {
    switch (type) {
      case FormApp.ItemType.MULTIPLE_CHOICE: {
        const mc = item.asMultipleChoiceItem();
        return {
          choices: mc.getChoices().map(c => ({
            value: c.getValue(),
            pageNavigationType: safeCall_(() => String(c.getPageNavigationType()), null), // Choice.getPageNavigationType :contentReference[oaicite:3]{index=3}
            gotoPageId: safeCall_(() => (c.getGotoPage() ? c.getGotoPage().getId() : null), null) // Choice.getGotoPage :contentReference[oaicite:4]{index=4}
          })),
          hasOtherOption: safeCall_(() => mc.hasOtherOption(), null)
        };
      }
      case FormApp.ItemType.LIST: {
        const li = item.asListItem();
        return {
          choices: li.getChoices().map(c => ({
            value: c.getValue(),
            pageNavigationType: safeCall_(() => String(c.getPageNavigationType()), null),
            gotoPageId: safeCall_(() => (c.getGotoPage() ? c.getGotoPage().getId() : null), null)
          }))
        };
      }
      case FormApp.ItemType.CHECKBOX: {
        const cb = item.asCheckboxItem();
        return { choices: cb.getChoices().map(c => ({ value: c.getValue() })) };
      }
      case FormApp.ItemType.GRID: {
        const g = item.asGridItem();
        return { rows: g.getRows(), columns: g.getColumns() };
      }
      case FormApp.ItemType.CHECKBOX_GRID: {
        const cg = item.asCheckboxGridItem();
        return { rows: cg.getRows(), columns: cg.getColumns() };
      }
      case FormApp.ItemType.SCALE: {
        const s = item.asScaleItem();
        return {
          lowerBound: s.getLowerBound(),
          upperBound: s.getUpperBound(),
          leftLabel: s.getLeftLabel(),
          rightLabel: s.getRightLabel()
        };
      }
      case FormApp.ItemType.DATE: {
        const d = item.asDateItem();
        return { includesYear: d.includesYear() };
      }
      case FormApp.ItemType.DATETIME: {
        const dt = item.asDateTimeItem();
        return { includesYear: dt.includesYear() };
      }
      case FormApp.ItemType.TIME: {
        const t = item.asTimeItem();
        return {};
      }
      case FormApp.ItemType.PAGE_BREAK: {
        const pb = item.asPageBreakItem();
        return {
          pageNavigationType: safeCall_(() => String(pb.getPageNavigationType()), null), // PageBreakItem.getPageNavigationType :contentReference[oaicite:5]{index=5}
          gotoPageId: safeCall_(() => (pb.getGoToPage() ? pb.getGoToPage().getId() : null), null) // PageBreakItem.getGoToPage :contentReference[oaicite:6]{index=6}
        };
      }
      case FormApp.ItemType.SECTION_HEADER: {
        const sh = item.asSectionHeaderItem();
        return {};
      }
      // テキスト系は detail なしでOK
      case FormApp.ItemType.TEXT:
      case FormApp.ItemType.PARAGRAPH_TEXT:
      default:
        return {};
    }
  } catch (e) {
    // 型変換できない等が起きても全体は止めない
    return { error: String(e) };
  }
}

/** 例外が出る可能性のある呼び出しを安全化 */
function safeCall_(fn, fallback) {
  try {
    return fn();
  } catch (e) {
    return fallback;
  }
}
