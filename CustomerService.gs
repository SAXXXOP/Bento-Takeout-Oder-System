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
    const pickupDate = getPickupDateForHistory_(formData, now);


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

      // ★追加：部分一致なら「同一人物候補」扱い（上書きせず、要確認にも振らない）
      if (isPartialNameMatch_(oldNorm, newNorm)) {
        // nameToWrite は oldNameRaw のまま（上書きなし）
        // _needsCheckNameReason もログも出さない
      } else {
        // 従来どおり：不一致 → 要確認＋ログ
        formData._needsCheckNameReason =
          `氏名不一致（顧客名簿:${oldNameRaw} / 入力:${newNameRaw}）`;

        appendNameConflictLogV2_(sheet.getParent(), {
          at: now,
          orderNo: formData._reservationNoForLog || "",
          totalPrice: formData.totalPrice || 0,
          lineId: lineId || row[CONFIG.CUSTOMER_COLUMN.LINE_ID - 1] || "",
          phone: phone || "",
          customerRow: foundRow,
          oldName: oldNameRaw,
          newName: newNameRaw
        });

        // nameToWrite は oldNameRaw のまま（= 上書きしない）
      }

    } else {
      // 一致（空白差など）は従来通り「長い方」を採用
      if (newNameRaw && newNameRaw.length > oldNameRaw.length) {
        nameToWrite = newNameRaw;
      }
    }


      sheet.getRange(foundRow, CONFIG.CUSTOMER_COLUMN.LINE_ID)
        .setValue(lineId || row[CONFIG.CUSTOMER_COLUMN.LINE_ID - 1]);

      sheet.getRange(foundRow, CONFIG.CUSTOMER_COLUMN.NAME).setValue(nameToWrite);
      sheet.getRange(foundRow, CONFIG.CUSTOMER_COLUMN.LAST_VISIT).setValue(pickupDate);

      // ★追加：現状値を行から取得（空・文字列でも0扱いにする）
      const currentCount = (() => {
        const n = parseInt(String(row[CONFIG.CUSTOMER_COLUMN.VISIT_COUNT - 1] || "0").replace(/,/g, ""), 10);
        return Number.isFinite(n) ? n : 0;
      })();
      const currentTotal = (() => {
        const n = Number(String(row[CONFIG.CUSTOMER_COLUMN.TOTAL_SPEND - 1] || "0").replace(/,/g, ""));
        return Number.isFinite(n) ? n : 0;
      })();
      const addTotal = (() => {
        const n = Number(String(formData.totalPrice || 0).replace(/,/g, ""));
        return Number.isFinite(n) ? n : 0;
      })();

      sheet.getRange(foundRow, CONFIG.CUSTOMER_COLUMN.VISIT_COUNT).setValue(currentCount + 1);
      sheet.getRange(foundRow, CONFIG.CUSTOMER_COLUMN.TOTAL_SPEND).setValue(currentTotal + (formData.totalPrice || 0));

      
      // ★追加：履歴1-3を更新（最新→履歴1、既存履歴1→履歴2…）
      const historyEntry = buildCustomerHistoryEntry_(formData, pickupDate);
      shiftCustomerHistory_(sheet, foundRow, historyEntry);


      return true;
    }


    // === 新規顧客の追加 ===
    const newRow = [];
    newRow[CONFIG.CUSTOMER_COLUMN.LINE_ID - 1] = lineId;
    newRow[CONFIG.CUSTOMER_COLUMN.NAME - 1] = newName;
    newRow[CONFIG.CUSTOMER_COLUMN.TEL - 1] = phone ? "'" + phone : "";
    newRow[CONFIG.CUSTOMER_COLUMN.FIRST_VISIT - 1] = pickupDate;
    newRow[CONFIG.CUSTOMER_COLUMN.LAST_VISIT - 1] = pickupDate;
    newRow[CONFIG.CUSTOMER_COLUMN.VISIT_COUNT - 1] = 1;
    newRow[CONFIG.CUSTOMER_COLUMN.TOTAL_SPEND - 1] = formData.totalPrice || 0;
    newRow[CONFIG.CUSTOMER_COLUMN.NOTE_COOK - 1] = "";
    newRow[CONFIG.CUSTOMER_COLUMN.NOTE_OFFICE - 1] = "";
    newRow[CONFIG.CUSTOMER_COLUMN.HISTORY_1 - 1] = buildCustomerHistoryEntry_(formData, pickupDate);
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

// 追加：部分一致（サブストリング）を「同一人物候補」とみなす
// - 短すぎる一致で誤爆しないためのガード付き
function isPartialNameMatch_(aNorm, bNorm) {
  const a = String(aNorm || "");
  const b = String(bNorm || "");
  if (!a || !b) return false;

  const shorter = (a.length <= b.length) ? a : b;
  const longer  = (a.length <= b.length) ? b : a;

  // ガード：短すぎる一致は信用しない
  if (shorter.length < 3) return false;

  // ガード：短い方が長い方の半分未満なら誤爆しやすいので除外（必要なら調整可）
  if (shorter.length / longer.length < 0.5) return false;

  return longer.includes(shorter);
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

function appendNameConflictLogV2_(ss, payload) {
  const sheetName = (CONFIG.SHEET && CONFIG.SHEET.NAME_CONFLICT_LOG)
    ? CONFIG.SHEET.NAME_CONFLICT_LOG
    : "氏名不一致ログ";

  const sh = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);

  // ヘッダが無いなら AdminTools 仕様で作る
  if (sh.getLastRow() === 0) {
    sh.appendRow([
      "記録日時", "状態", "LINE_ID", "電話番号", "顧客行", "旧氏名", "新氏名",
      "処理", "処理日時", "処理者", "メモ",
      "予約No", "合計金額"
    ]);
    sh.setFrozenRows(1);
  }

  // AdminTools 側の ensure を流用（足りない列があれば末尾に追加）
  ensureNameConflictHeader_(sh);

  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
  const col = {};
  header.forEach((h, i) => { if (h) col[h] = i + 1; });

  const row = Array(sh.getLastColumn()).fill("");

  row[(col["記録日時"] || 1) - 1] = payload.at || new Date();
  row[(col["状態"] || 2) - 1] = "PENDING";
  if (col["LINE_ID"]) row[col["LINE_ID"] - 1] = SECURITY_.sanitizeForSheet(payload.lineId || "");
  if (col["電話番号"]) row[col["電話番号"] - 1] = SECURITY_.sanitizeForSheet(payload.phone || "");
  if (col["顧客行"]) row[col["顧客行"] - 1] = payload.customerRow || "";
  if (col["旧氏名"]) row[col["旧氏名"] - 1] = SECURITY_.sanitizeForSheet(payload.oldName || "");
  if (col["新氏名"]) row[col["新氏名"] - 1] = SECURITY_.sanitizeForSheet(payload.newName || "");
  if (col["予約No"]) row[col["予約No"] - 1] = payload.orderNo ? "'" + String(payload.orderNo) : "";
  if (col["合計金額"]) row[col["合計金額"] - 1] = Number(payload.totalPrice || 0) || 0;

  sh.appendRow(row);
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
    "状態", "記録日時", "予約No",
    "LINE_ID", "電話番号",
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
  if (col["記録日時"]) row[col["記録日時"] - 1] = ts;

  if (col["予約No"]) row[col["予約No"] - 1] = payload.orderNo ? "'" + String(payload.orderNo) : "";
  if (col["LINE_ID"]) row[col["LINE_ID"] - 1] = SECURITY_.sanitizeForSheet(payload.lineId || "");
  if (col["電話番号"]) row[col["電話番号"] - 1] = SECURITY_.sanitizeForSheet(payload.phone || "");
  if (col["旧氏名"]) row[col["旧氏名"] - 1] = SECURITY_.sanitizeForSheet(payload.oldName || "");
  if (col["新氏名"]) row[col["新氏名"] - 1] = SECURITY_.sanitizeForSheet(payload.newName || "");
  if (col["理由"]) row[col["理由"] - 1] = SECURITY_.sanitizeForSheet(payload.reason || "");

  sh.appendRow(row);
}


function getPickupDateForHistory_(formData, fallbackNow) {
  const now = fallbackNow || new Date();

  // ① 最優先：FormService.parse が入れる Date（pickupDateRaw）
  const d0 = formData && formData.pickupDateRaw;
  if (d0 instanceof Date && !isNaN(d0.getTime())) {
    const d = new Date(d0);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // ② 保険：表示文字列 "M/D / ..." から月日だけ拾う
  const s = formData && formData.pickupDate ? String(formData.pickupDate) : "";
  const m = s.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);

    // 年跨ぎ（12月に1月を選ぶケース）だけ補正
    let year = now.getFullYear();
    if (now.getMonth() === 11 && month === 1) year++;

    const d = new Date(year, month - 1, day);
    d.setHours(0, 0, 0, 0);
    if (!isNaN(d.getTime())) return d;
  }

  // ③ どうしても取れないときは送信日
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}



function buildCustomerHistoryEntry_(formData, now) {
  const tz = Session.getScriptTimeZone();
  const pickupDate = getPickupDateForHistory_(formData, now);
  const dateStr = Utilities.formatDate(pickupDate, tz, "yyyy/MM/dd");


  const orderNo = formData && formData._reservationNoForLog
    ? String(formData._reservationNoForLog).replace(/'/g, "")
    : "";

  const price = Number(String((formData && formData.totalPrice) || 0).replace(/,/g, "")) || 0;

  const memo = [
    orderNo ? `予約No:${orderNo}` : "",
    price ? `+${price}` : ""
  ].filter(Boolean).join(" / ");

  const raw = memo ? `${dateStr} ${memo}` : dateStr;
  return SECURITY_.sanitizeForSheet(raw);
}

function shiftCustomerHistory_(sheet, row, entry) {
  if (!entry) return;

  const col1 = CONFIG.CUSTOMER_COLUMN.HISTORY_1;
  const range = sheet.getRange(row, col1, 1, 3);
  const [h1, h2] = range.getValues()[0].map(v => String(v || "").trim());

  const entryDate = String(entry).split(" ")[0];
  const h1Date = String(h1).split(" ")[0];

  // 同日なら履歴1だけ差し替え（同日に複数回注文で履歴が埋まるのを軽減）
  if (h1 && h1Date === entryDate) {
    range.getCell(1, 1).setValue(entry);
    return;
  }

  // entry -> 履歴1, 旧履歴1 -> 履歴2, 旧履歴2 -> 履歴3（旧履歴3は捨てる）
  range.setValues([[entry, h1, h2]]);
}

/**  
 * 受取日を安全に取るヘルパー
 **/
function getPickupDateForHistory_(formData, fallbackNow) {
  const now = fallbackNow || new Date();

  // ① FormService.parse(e) が作る Date（最優先）
  const d0 = formData && formData.pickupDateRaw;
  if (d0 instanceof Date && !isNaN(d0.getTime())) return d0; // :contentReference[oaicite:5]{index=5}

  // ② 表示用文字列 "M/D / ..." から月日だけ拾う（保険）
  const s = formData && formData.pickupDate ? String(formData.pickupDate) : "";
  const m = s.match(/(\d{1,2})\s*\/\s*(\d{1,2})/);
  if (m) {
    const month = Number(m[1]);
    const day = Number(m[2]);

    // 年跨ぎ（12月に1月を選ぶケース）だけ FormService と同じ補正
    let year = now.getFullYear();
    if (now.getMonth() === 11 && month === 1) year++;

    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime())) return d;
  }

  // ③ どうしても取れないときは送信日
  return now;
}

