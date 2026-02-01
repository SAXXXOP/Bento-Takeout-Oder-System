const DateUtil = {
  parsePickupDate(str) {
    const m = str?.match(/(\d{1,2})\/(\d{1,2})/);
    if (!m) return null;
    const now = new Date();
    let d = new Date(now.getFullYear(), m[1] - 1, m[2]);
    if (now.getMonth() === 11 && m[1] === "1") d.setFullYear(now.getFullYear() + 1);
    return d;
  }
};
