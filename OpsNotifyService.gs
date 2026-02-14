/**
 * OpsNotifyService.gs
 * 運用通知（予約/変更）を「1時間ごと」にまとめてメール送信します。
 *
 * 宛先:
 *   ScriptProps.KEYS.LATE_SUBMISSION_NOTIFY_TO（既存の「締切後送信通知」と共通）
 *
 * 方式:
 *   - フォーム送信時に「運用通知キュー」シートへ1行追加（即送信しない）
 *   - 時間主導トリガー（opsNotifyHourlyTrigger）で未送信分をまとめて送信し、送信済みにマーク
 */
const OPS_NOTIFY_ = (() => {
  const SHEET_NAME = "運用通知キュー";
  const HEADER = [
    "timestamp", "kind", "reservationNo", "oldNo",
    "name", "tel", "pickup",
    "summary", "note",
    "late", "needsCheckReason",
    "sent", "sentAt"
  ];

  // ===== 送信済みキューの肥大化対策 =====
  // 送信済み（sent=あり）の保持日数（ここを ○日 に変更してください）
  const SENT_RETENTION_DAYS_ = 30;
  // 1回の実行で削除する最大行数（大量時のタイムアウト回避）
  const MAX_DELETE_PER_RUN_ = 500;

  const PLACEHOLDERS = new Set([
    "", "__SET_ME__", "SET_ME", "TODO", "DUMMY", "DUMMY_VALUE"
  ]);

  function log_(level, message, extra) {
    try {
      if (typeof logToSheet === "function") return logToSheet(level, message, extra);
    } catch (e) {}
    try { console.log(`[${level}] ${message}`, extra || ""); } catch (e) {}
  }

  function tz_() { return "Asia/Tokyo"; }

  function fmt_(d, pattern) {
    try { return Utilities.formatDate(d, tz_(), pattern); } catch (e) { return String(d); }
  }

  function sanitizeCell_(v) {
    if (v instanceof Date) return v;
    const s = String(v ?? "");
    try {
      if (typeof SECURITY_ !== "undefined" && SECURITY_ && typeof SECURITY_.sanitizeForSheet === "function") {
        return SECURITY_.sanitizeForSheet(s);
      }
    } catch (e) {}
    return s.replace(/[\x00-\x1f\x7f]/g, "");
  }

  function compact_(s, maxLen) {
    s = String(s ?? "");
    s = s.replace(/\r\n?/g, "\n").replace(/\s*\n\s*/g, " / ").trim();
    if (maxLen && s.length > maxLen) return s.slice(0, maxLen) + "…";
    return s;
  }

  function parseRecipients_(raw) {
    raw = String(raw || "");
    const list = raw.split(/[,\s;]+/).map(s => s.trim()).filter(Boolean);
    return list.filter(s => s.includes("@"));
  }

  function getToRaw_() {
    try {
      if (typeof ScriptProps !== "undefined" && ScriptProps && ScriptProps.KEYS) {
        return String(ScriptProps.get(ScriptProps.KEYS.LATE_SUBMISSION_NOTIFY_TO, "") || "");
      }
    } catch (e) {}
    return "";
  }

  function isEnabled_(toRaw) {
    const s = String(toRaw || "").trim();
    if (!s) return false;
    if (PLACEHOLDERS.has(s)) return false;
    return true;
  }

  function getSheet_() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sh = ss.getSheetByName(SHEET_NAME);
    if (!sh) {
      sh = ss.insertSheet(SHEET_NAME);
      sh.appendRow(HEADER);
      sh.setFrozenRows(1);
      try { sh.hideSheet(); } catch (e) {}
    } else {
      if (sh.getLastRow() === 0) {
        sh.appendRow(HEADER);
        sh.setFrozenRows(1);
      } else {
        const v = sh.getRange(1, 1, 1, HEADER.length).getValues()[0];
        const ok = HEADER.every((h, i) => String(v[i] || "") === h);
        if (!ok) {
          sh.getRange(1, 1, 1, HEADER.length).setValues([HEADER]);
          sh.setFrozenRows(1);
        }
      }
    }
    return sh;
  }

  /**
   * 送信済み（sent=あり）で sentAt が retentionDays より古い行を削除する
   * - 未送信行は絶対に消さない
   * - sentAt が Date として取れない行も消さない（安全側）
   */
  function purgeOldSent_() {
    const retentionDays = Math.max(1, Number(SENT_RETENTION_DAYS_) || 30);
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - retentionDays);

    const sh = getSheet_();
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return 0;

    const colSent = HEADER.indexOf("sent") + 1;     // 12
    const numRows = lastRow - 1;                    // data rows

    // sent(12) と sentAt(13) は連続している想定なので2列まとめて読む
    const sentPair = sh.getRange(2, colSent, numRows, 2).getValues(); // [[sent, sentAt], ...]

    const targets = [];
    for (let i = 0; i < sentPair.length; i++) {
      const sent = String(sentPair[i][0] || "").trim();
      if (!sent) continue; // 未送信は対象外

      const sentAt = sentPair[i][1];
      const d = (sentAt instanceof Date && !isNaN(sentAt.getTime())) ? sentAt : null;
      if (!d) continue; // 日付が取れない行は安全のため消さない

      if (d.getTime() < cutoff.getTime()) {
        targets.push(i + 2); // 実シート行番号（ヘッダ1行 + 2行目開始）
      }
    }

    if (!targets.length) return 0;

    // タイムアウト対策：削除上限
    const slice = targets.slice(0, MAX_DELETE_PER_RUN_);

    // 連続行をブロック化して、下からまとめて deleteRows
    const blocks = [];
    let start = slice[0], prev = slice[0];
    for (let i = 1; i < slice.length; i++) {
      const r = slice[i];
      if (r === prev + 1) { prev = r; continue; }
      blocks.push({ start, count: prev - start + 1 });
      start = r; prev = r;
    }
    blocks.push({ start, count: prev - start + 1 });

    let deleted = 0;
    for (let i = blocks.length - 1; i >= 0; i--) {
      sh.deleteRows(blocks[i].start, blocks[i].count);
      deleted += blocks[i].count;
    }

    log_("INFO", "opsNotify purgeOldSent done", { deleted, retentionDays });
    return deleted;
  }

  function enqueueFromForm_(reservationNo, formData, changeMeta) {
    const toRaw = getToRaw_();
    // 宛先が無いならキューも作らない（無駄なタブ増殖防止）
    if (!isEnabled_(toRaw)) return;

    const kind = (changeMeta && changeMeta.changeRequested && !changeMeta.isChange)
      ? "変更希望"
      : (changeMeta && changeMeta.isChange ? "変更" : "新規");

    const oldNo = (changeMeta && changeMeta.oldNo) ? changeMeta.oldNo : "";
    const late = (changeMeta && changeMeta.lateSubmission) ? "1" : "";
    const needsReason = (changeMeta && changeMeta.needsCheckReason) ? changeMeta.needsCheckReason : "";

    const details = compact_(formData && (formData.orderDetailsForCustomer || formData.orderDetails) || "", 160);
    const totalItems = (formData && formData.totalItems) ? formData.totalItems : 0;
    const totalPrice = (formData && formData.totalPrice) ? formData.totalPrice : 0;

    const summary = compact_(
      `合計:${totalItems}点/${totalPrice}円 / ${details}`,
      220
    );

    const note = compact_(formData && formData.note || "", 220);

    const row = [
      new Date(),
      kind,
      reservationNo || "",
      oldNo,
      formData && (formData.userName || formData.simpleName || formData.rawName) || "",
      formData && (formData.phoneNumber || "") || "",
      formData && (formData.pickupDate || "") || "",
      summary,
      note,
      late,
      needsReason,
      "", // sent
      ""  // sentAt
    ].map(sanitizeCell_);

    const sh = getSheet_();
    sh.appendRow(row);
  }

  function buildMailBody_(rows) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const url = ss.getUrl();

    const timestamps = rows.map(r => r.ts).filter(d => d instanceof Date);
    const minTs = timestamps.length ? new Date(Math.min(...timestamps.map(d => d.getTime()))) : new Date();
    const maxTs = timestamps.length ? new Date(Math.max(...timestamps.map(d => d.getTime()))) : new Date();

    const lines = [];
    lines.push(`予約/変更 通知（1時間まとめ）: ${rows.length}件`);
    lines.push(`期間: ${fmt_(minTs, "yyyy/MM/dd HH:mm")} 〜 ${fmt_(maxTs, "HH:mm")}`);
    lines.push("");

    rows.forEach(r => {
      const at = (r.ts instanceof Date) ? fmt_(r.ts, "HH:mm") : "";
      const flags = [
        r.late ? "締切後" : "",
        r.needsCheckReason ? `要確認:${compact_(r.needsCheckReason, 40)}` : ""
      ].filter(Boolean).join(" / ");

      const base =
        `${at} [${r.kind}] No:${r.reservationNo}` +
        (r.oldNo ? ` (旧:${r.oldNo})` : "") +
        ` / ${compact_(r.name, 20)}` +
        (r.tel ? ` / ${r.tel}` : "") +
        (r.pickup ? ` / 受取:${compact_(r.pickup, 40)}` : "");

      const detail = r.summary ? ` / ${compact_(r.summary, 120)}` : "";
      const note = r.note ? ` / 備考:${compact_(r.note, 60)}` : "";
      const flg = flags ? ` / ※${flags}` : "";

      lines.push(base + detail + note + flg);
    });

    lines.push("");
    lines.push("スプレッドシート：");
    lines.push(url);

    return lines.join("\n");
  }

  function flush_(opts) {
    opts = opts || {};
    const force = !!opts.force;

    const toRaw = getToRaw_();
    if (!force && !isEnabled_(toRaw)) return;

    const recipients = parseRecipients_(toRaw);
    if (!recipients.length) return;

    const sh = getSheet_();
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return;

    const values = sh.getRange(2, 1, lastRow - 1, HEADER.length).getValues();
    const unsent = [];
    values.forEach((row, i) => {
      const sent = String(row[11] || "").trim();
      if (sent) return;
      unsent.push({
        rowIndex: i + 2,
        ts: row[0],
        kind: row[1],
        reservationNo: row[2],
        oldNo: row[3],
        name: row[4],
        tel: row[5],
        pickup: row[6],
        summary: row[7],
        note: row[8],
        late: row[9],
        needsCheckReason: row[10]
      });
    });

    if (!unsent.length) return;

    const subject = `【予約通知】${fmt_(new Date(), "yyyy/MM/dd HH:mm")} ${unsent.length}件（1時間まとめ）`;
    const body = buildMailBody_(unsent);

    MailApp.sendEmail({
      to: recipients.join(","),
      subject,
      body
    });

    const sentAt = new Date();
    unsent.forEach(r => {
      sh.getRange(r.rowIndex, 12, 1, 2).setValues([["SENT", sentAt]]);
    });

    log_("INFO", "opsNotify flush sent", { count: unsent.length, to: recipients.join(",") });
  }

  function sendPing_() {
    const toRaw = getToRaw_();
    const recipients = parseRecipients_(toRaw);
    if (!recipients.length) {
      throw new Error("LATE_SUBMISSION_NOTIFY_TO が未設定、または宛先を解析できません。");
    }
    MailApp.sendEmail({
      to: recipients.join(","),
      subject: "【予約通知】疎通（Ping）",
      body:
        "運用通知（予約/変更の1時間まとめ）の疎通テストです。\n\n" +
        "このメールが届けば設定OKです。\n"
    });
  }

  return {
    enqueueFromForm_,
    flush_,
    sendPing_,
    purgeOldSent_,
    SHEET_NAME
  };
})();

/** フォーム送信時に呼ぶ（Main.gs から呼び出し） */
function opsNotifyEnqueueFromForm_(reservationNo, formData, changeMeta) {
  return OPS_NOTIFY_.enqueueFromForm_(reservationNo, formData, changeMeta);
}

/** 1時間ごとのトリガーで呼ぶ */
function opsNotifyHourlyTrigger() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10 * 1000)) return;
  try {
    OPS_NOTIFY_.flush_();
    // 送信済みの古い行を自動削除（キュー肥大化防止）
    OPS_NOTIFY_.purgeOldSent_();
  } catch (err) {
    try { if (typeof logToSheet === "function") logToSheet("ERROR", "opsNotifyHourlyTrigger failed", { err: String(err) }); } catch (e) {}
    throw err;
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}

/** 手動送信（メニュー用） */
function flushOpsNotifyQueueNow() {
  let ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) {}
  try {
    OPS_NOTIFY_.flush_({ force: true });
    OPS_NOTIFY_.purgeOldSent_();
    if (ui) ui.alert("OK：運用通知キューを送信しました（未送信が無い場合は何も送られません）。");
  } catch (err) {
    if (ui) ui.alert("NG：" + String(err));
    throw err;
  }
}

/** 疎通テスト（メニュー用） */
function sendOpsNotifyPing() {
  const ui = SpreadsheetApp.getUi();
  try {
    OPS_NOTIFY_.sendPing_();
    ui.alert("OK：Pingを送信しました。受信できるか確認してください。");
  } catch (err) {
    ui.alert("NG：" + String(err));
    throw err;
  }
}
