/**
 * SecurityUtils.gs
 * - スプレッドシート数式注入対策
 * - 制御文字除去
 * - ログ用の短縮・簡易マスク
 */
const SECURITY_ = (() => {
  const DANGEROUS_PREFIX_RE = /^[=\+\-@]/; // Sheetsで式として解釈されやすい先頭
  const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

  function sanitizeForSheet(value) {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value;
    if (typeof value === "number" || typeof value === "boolean") return value;

    let s = String(value);
    s = s.replace(CONTROL_CHARS_RE, "");
    s = s.replace(/\r\n?/g, "\n");

    // 数式注入対策：先頭が危険文字ならアポストロフィで文字列扱いへ
    if (DANGEROUS_PREFIX_RE.test(s)) s = "'" + s;
    return s;
  }

  function truncate(s, maxLen) {
    const limit = maxLen || 800;
    s = String(s ?? "");
    return s.length > limit ? s.slice(0, limit) + "…(truncated)" : s;
  }

  // ざっくりPIIを落とす（必要最低限）
  function redact(obj) {
    if (!obj || typeof obj !== "object") return obj;
    const copy = Array.isArray(obj) ? obj.slice() : { ...obj };
    const keys = ["userId", "replyToken", "to", "lineId", "LINE_ID", "phoneNumber", "tel", "text", "message", "body"];
    keys.forEach(k => {
      if (copy[k] !== undefined) copy[k] = "[REDACTED]";
    });
    return copy;
  }

  function toLogString(extra, maxLen) {
    let s;
    try {
      s = (typeof extra === "string") ? extra : JSON.stringify(redact(extra));
    } catch (e) {
      s = String(extra);
    }
    return truncate(sanitizeForSheet(s), maxLen || 800);
  }

  return { sanitizeForSheet, toLogString, truncate, redact };
})();
