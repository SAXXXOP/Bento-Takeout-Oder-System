/**
 * 顧客管理に関連するサービス
 */
const CustomerService = {

  /**
   * フォーム送信時の名簿更新（CONFIG対応版）
   * 既存顧客なら更新してtrueを返し、新規なら追加してfalseを返す
   */
  checkAndUpdateCustomer: function(formData) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET.CUSTOMER_LIST);
    if (!sheet) return false;

    const values = sheet.getDataRange().getValues();
    const lineId = formData.userId;
    const phone = formData.phoneNumber;
    const newName = formData.userName;
    const now = new Date();

    let foundRow = -1;

    // --- ① LINE ID で検索 ---
    if (lineId) {
      const idIdx = CONFIG.CUSTOMER_COLUMN.LINE_ID - 1;
      for (let i = 1; i < values.length; i++) {
        if (values[i][idIdx] === lineId) {
          foundRow = i + 1;
          break;
        }
      }
    }

    // --- ② 保険：電話番号で検索（LINE IDで見つからなかった場合） ---
    if (foundRow === -1 && phone) {
      const telIdx = CONFIG.CUSTOMER_COLUMN.TEL - 1;
      const searchPhone = phone.toString().replace(/'/g, "");
      for (let i = 1; i < values.length; i++) {
        const currentPhone = values[i][telIdx].toString().replace(/'/g, "");
        if (currentPhone === searchPhone) {
          foundRow = i + 1;
          break;
        }
      }
    }

    // === 既存顧客の更新 ===
    if (foundRow !== -1) {
      const row = values[foundRow - 1];

      const oldNameRaw = String(row[CONFIG.CUSTOMER_COLUMN.NAME - 1] || "");
      const newNameRaw = String(newName || "");

      const oldNorm = normalizeCustomerName_(oldNameRaw);
      const newNorm = normalizeCustomerName_(newNameRaw);

      let nameToWrite = oldNameRaw;

      // 旧名が空で、新名がある → そのまま採用（初回登録の補完）
      if (!oldNorm && newNorm) {
        nameToWrite = newNameRaw;

      // 旧名も新名もあるが一致しない → 上書きしない＋要確認＋ログ
      } else if (oldNorm && newNorm && oldNorm !== newNorm) {
        formData._needsCheckNameReason =
          `氏名不一致（顧客名簿:${oldNameRaw} / 入力:${newNameRaw}）`;

        appendNameConflictLog_(sheet.getParent(), {
          ts: now,
          orderNo: formData._reservationNoForLog || "",
          lineId: lineId || row[CONFIG.CUSTOMER_COLUMN.LINE_ID - 1] || "",
          phone: phone || "",
          oldName: oldNameRaw,
          newName: newNameRaw
        });

        // nameToWrite は oldNameRaw のまま（= 上書きしない）
      } else {
        // 一致（空白差など）は従来通り「長い方」を採用
        if (newNameRaw && newNameRaw.length > oldNameRaw.length) {
          nameToWrite = newNameRaw;
        }
      }

      sheet.getRange(foundRow, CONFIG.CUSTOMER_COLUMN.LINE_ID)
        .setValue(lineId || row[CONFIG.CUSTOMER_COLUMN.LINE_ID - 1]);

      sheet.getRange(foundRow, CONFIG.CUSTOMER_COLUMN.NAME).setValue(nameToWrite);
      sheet.getRange(foundRow, CONFIG.CUSTOMER_COLUMN.LAST_VISIT).setValue(now);
      sheet.getRange(foundRow, CONFIG.CUSTOMER_COLUMN.VISIT_COUNT).setValue(currentCount + 1);
      sheet.getRange(foundRow, CONFIG.CUSTOMER_COLUMN.TOTAL_SPEND).setValue(currentTotal + (formData.totalPrice || 0));

      return true;
    }


    // === 新規顧客の追加 ===
    const newRow = [];
    newRow[CONFIG.CUSTOMER_COLUMN.LINE_ID - 1] = lineId;
    newRow[CONFIG.CUSTOMER_COLUMN.NAME - 1] = newName;
    newRow[CONFIG.CUSTOMER_COLUMN.TEL - 1] = phone ? "'" + phone : "";
    newRow[CONFIG.CUSTOMER_COLUMN.FIRST_VISIT - 1] = now;
    newRow[CONFIG.CUSTOMER_COLUMN.LAST_VISIT - 1] = now;
    newRow[CONFIG.CUSTOMER_COLUMN.VISIT_COUNT - 1] = 1;
    newRow[CONFIG.CUSTOMER_COLUMN.TOTAL_SPEND - 1] = formData.totalPrice || 0;
    newRow[CONFIG.CUSTOMER_COLUMN.NOTE_COOK - 1] = "";
    newRow[CONFIG.CUSTOMER_COLUMN.NOTE_OFFICE - 1] = "";
    newRow[CONFIG.CUSTOMER_COLUMN.HISTORY_1 - 1] = "";
    newRow[CONFIG.CUSTOMER_COLUMN.HISTORY_2 - 1] = "";
    newRow[CONFIG.CUSTOMER_COLUMN.HISTORY_3 - 1] = "";

    sheet.appendRow(newRow);
    return false;
  },

  /**
   * サイドバー検索（氏名・電話番号での検索）
   */
  searchCustomers: function(query) {
    if (!query) return [];
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET.CUSTOMER_LIST);
    const data = sheet.getDataRange().getValues();
    const results = [];
    const nameIdx = CONFIG.CUSTOMER_COLUMN.NAME - 1;
    const telIdx = CONFIG.CUSTOMER_COLUMN.TEL - 1;

    for (let i = 1; i < data.length; i++) {
      const name = String(data[i][nameIdx] || "");
      const tel = String(data[i][telIdx] || "");
      if (name.includes(query) || tel.includes(query)) {
        results.push({ name: name, tel: tel, row: i + 1 });
      }
    }
    return results;
  },

  /**
   * 選択された行の顧客情報を取得
   */
  getCustomerByRow: function(row) {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET.CUSTOMER_LIST);
    const data = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
    return {
      row: row,
      name: data[CONFIG.CUSTOMER_COLUMN.NAME - 1],
      noteKitchen: data[CONFIG.CUSTOMER_COLUMN.NOTE_COOK - 1],
      noteOffice: data[CONFIG.CUSTOMER_COLUMN.NOTE_OFFICE - 1]
    };
  },

  /**
   * 備考の保存
   */
  saveCustomerNote: function(row, note, type) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG.SHEET.CUSTOMER_LIST);

  // kitchen / office 以外は弾く（想定外の書き込み防止）
  if (type !== 'kitchen' && type !== 'office') return "種別が不正です";

  const col = (type === 'kitchen')
    ? CONFIG.CUSTOMER_COLUMN.NOTE_COOK
    : CONFIG.CUSTOMER_COLUMN.NOTE_OFFICE;

  // 注入対策 + 制御文字除去
  const safe = SECURITY_.sanitizeForSheet(String(note || ""));

  // 長さ制限（過剰入力・ログ爆発防止）
  const limited = safe.length > 1000 ? safe.slice(0, 1000) : safe;

  sheet.getRange(row, col).setValue(limited);
  return "保存しました";
  }

};

function normalizeCustomerName_(s) {
  // 半角/全角スペース・改行等を除去して比較
  return String(s || "").replace(/[ \t\r\n　]/g, "");
}

function appendNameConflictLog_(ss, data) {
  const sheetName = (CONFIG.SHEET && CONFIG.SHEET.NAME_CONFLICT_LOG)
    ? CONFIG.SHEET.NAME_CONFLICT_LOG
    : "氏名不一致ログ";

  const sh = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

  if (sh.getLastRow() === 0) {
    sh.appendRow(["timestamp", "orderNo", "lineId", "phone", "oldName", "newName"]);
  }

  const ts = Utilities.formatDate(data.ts || new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");

  sh.appendRow([
    ts,
    SECURITY_.sanitizeForSheet(String(data.orderNo || "")),
    SECURITY_.sanitizeForSheet(String(data.lineId || "")),
    SECURITY_.sanitizeForSheet(String(data.phone || "")),
    SECURITY_.sanitizeForSheet(String(data.oldName || "")),
    SECURITY_.sanitizeForSheet(String(data.newName || ""))
  ]);
}

// ===== 氏名不一致ログ：CustomerService側（書き込み担当） =====

function normalizeCustomerName_(name) {
  let s = String(name || "");
  try { s = s.normalize("NFKC"); } catch (e) {}
  // 空白・全角空白・改行などを除去して比較しやすく
  return s.trim().replace(/[\s\u3000]+/g, "");
}

function getOrCreateNameConflictLogSheet_(ss) {
  const sheetName = CONFIG.SHEET.NAME_CONFLICT_LOG;
  let sh = ss.getSheetByName(sheetName);
  if (!sh) sh = ss.insertSheet(sheetName);

  // ヘッダ（増減に強く：無ければ末尾に追加）
  const required = [
    "状態", "発生日時", "予約No",
    "LINE_ID", "電話",
    "旧氏名", "新氏名",
    "理由",
    "処理者", "処理日時", "メモ"
  ];

  const lastCol = Math.max(1, sh.getLastColumn());
  const header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(x => String(x || "").trim());
  const existing = new Set(header.filter(Boolean));

  // シートが完全に空っぽ/ヘッダ未作成の場合
  if (sh.getLastRow() === 0 || header.every(v => !v)) {
    sh.getRange(1, 1, 1, required.length).setValues([required]);
    return sh;
  }

  // 不足分を末尾に足す
  const toAdd = required.filter(h => !existing.has(h));
  if (toAdd.length) {
    sh.getRange(1, header.length + 1, 1, toAdd.length).setValues([toAdd]);
  }

  return sh;
}

function appendNameConflictLog_(ss, payload) {
  const sh = getOrCreateNameConflictLogSheet_(ss);

  const lastCol = Math.max(1, sh.getLastColumn());
  const header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(x => String(x || "").trim());
  const col = {};
  header.forEach((h, i) => { if (h) col[h] = i + 1; });

  const row = Array(lastCol).fill("");

  // 必ず “未処理(PENDING)”
  row[(col["状態"] || 1) - 1] = "PENDING";

  const ts = payload.ts || new Date();
  if (col["発生日時"]) row[col["発生日時"] - 1] = ts;

  if (col["予約No"]) row[col["予約No"] - 1] = payload.orderNo ? "'" + String(payload.orderNo) : "";
  if (col["LINE_ID"]) row[col["LINE_ID"] - 1] = SECURITY_.sanitizeForSheet(payload.lineId || "");
  if (col["電話"]) row[col["電話"] - 1] = SECURITY_.sanitizeForSheet(payload.phone || "");
  if (col["旧氏名"]) row[col["旧氏名"] - 1] = SECURITY_.sanitizeForSheet(payload.oldName || "");
  if (col["新氏名"]) row[col["新氏名"] - 1] = SECURITY_.sanitizeForSheet(payload.newName || "");
  if (col["理由"]) row[col["理由"] - 1] = SECURITY_.sanitizeForSheet(payload.reason || "");

  sh.appendRow(row);
}
