const FormService = {
  parse(e) {
    let response;
    if (e && e.response) {
      response = e.response;
    } else {
      const formUrl = SpreadsheetApp.getActiveSpreadsheet().getFormUrl();
      response = FormApp.openByUrl(formUrl).getResponses().pop();
    }

    const itemResponses = response.getItemResponses();
    const formData = {
      userId: "", userName: "", rawName: "", simpleName: "",
      phoneNumber: "", pickupDate: "", note: "",
      oldReservationNo: "",
      orderDetails: "",              // 保存用（内部キー）
      orderDetailsForCustomer: "",   // 返信用（お客様向け）
      totalItems: 0, totalPrice: 0,
      groupSummary: {}, isRegular: false,
      _needsCheckReasons: [] // ★追加：フォーム解析時点の要確認理由（Main.gsで合流）
    };

    let pickupDateObj = null;
    let rawDate = "", rawTime = "";
    const pickupDateKeyNorm = String(CONFIG.FORM.PICKUP_DATE || "").replace(/け/g, "");
    const pickupTimeKeyNorm = String(CONFIG.FORM.PICKUP_TIME || "").replace(/け/g, "");

    // FormService.gs（新規追加：配列/文字列を安全に文字列化）
    function normalizeMultiAnswer_(answer) {
      if (answer === null || answer === undefined) return "";

      // チェックボックスは配列で返る
      if (Array.isArray(answer)) {
        return answer
          .map(v => sanitizeSingleLine_(v))
          .filter(v => v !== "")
          .join(" / "); // 区切りはお好みで
      }

      // その他（記述式など）
      return sanitizeSingleLine_(answer);
    }

    // 改行を除去して1行に潰す
    function sanitizeSingleLine_(value) {
      return String(value || "")
        .replace(/\r\n|\n|\r/g, " ") // 改行→スペース
        .replace(/[ \t\u00A0]+/g, " ") // 連続空白・タブ等を1つに
        .trim();
    }


    
    itemResponses.forEach(r => {
      const item = r.getItem();
      if (!item) return;
      const title = item.getTitle() ? item.getTitle().trim() : "";
      const titleNorm = title.replace(/け/g, "");
      const answer = r.getResponse();

      if (title.includes(CONFIG.FORM.NAME_SHORT)) formData.simpleName = answer || "";
      else if (title === CONFIG.FORM.NAME_FULL) formData.rawName = answer || "";
      else if (title.includes(CONFIG.FORM.PHONE)) formData.phoneNumber = answer ? "'" + answer : "";
      else if (title.includes(CONFIG.FORM.OLD_RESERVATION_NO)) formData.oldReservationNo = answer || ""; // ★追加
      else if (pickupDateKeyNorm && titleNorm.includes(pickupDateKeyNorm)) rawDate = answer || "";
      else if (pickupTimeKeyNorm && titleNorm.includes(pickupTimeKeyNorm)) rawTime = answer || "";
      else if (title.includes(CONFIG.FORM.LINE_ID)) formData.userId = answer || "";
      else if (title.includes(CONFIG.FORM.NOTE)) { formData.note = normalizeMultiAnswer_(answer);}
      else this.parseOrder(title, answer, formData);
    });

    // --- Date生成 ---
    if (rawDate) {
      const m = rawDate.match(/(\d{1,2})\/(\d{1,2})/);
      if (m) {
        const month = Number(m[1]);
        const day   = Number(m[2]);
        const now = new Date();
        let year = now.getFullYear();
        if (now.getMonth() === 11 && month === 1) year++;
        pickupDateObj = new Date(year, month - 1, day);
      }
    }

    // ★ 内部用 Date
    formData.pickupDateRaw = pickupDateObj;

    // 表示用（既存仕様）
    formData.pickupDate = [rawDate, rawTime].filter(Boolean).join(" / ");

    // ユーザー名確定
    formData.userName = formData.simpleName || formData.rawName || "";

    return formData;
  },

  parseOrder(title, answer, formData) {
    const menuData = MenuRepository.getMenu();
    const safeTitle = title ? String(title).trim() : "";
    const targets = menuData.filter(m => m.parentName === safeTitle);
    
    if (targets.length === 0) return;

    const counts = Array.isArray(answer) ? answer : String(answer).split(',');

    // 文字整形（NFKC + 全角数字→半角）
    const normalizeCountText_ = (v) => {
      let s = String(v ?? "").trim();
      if (!s) return "";
      try { s = s.normalize("NFKC"); } catch (e) {}
      s = s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
      return s;
    };

    // NOTEへ追記（複数行）
    const sanitizeSingleLineLocal_ = (v) => {
      return String(v ?? "")
        .replace(/\r\n|\n|\r/g, " ")
        .replace(/[ \t\u00A0]+/g, " ")
        .trim();
    };
    const appendRequestNote_ = (line) => {
      const s = sanitizeSingleLineLocal_(line);
      if (!s) return;
      const limited = s.length > 200 ? s.slice(0, 200) + "…(省略)" : s;
      formData.note = formData.note ? (String(formData.note) + "\n" + limited) : limited;
    };
    // ★要確認：理由は空欄でもOK（運用側で後から入力）
    const markNeedsCheck_ = () => {
      formData._needsCheckFlag = true;
    };
    const pushNeedsCheck_ = (reason) => {
      markNeedsCheck_();
      const r = String(reason || "").trim();
      if (!r) return;
      if (!formData._needsCheckReasons) formData._needsCheckReasons = [];
      formData._needsCheckReasons.push(r);
    };

    // "４個" / "4個" / "  ４  " / "4こ" などから数量だけ拾う（先頭/途中の整数）
    const parseCountFromText_ = (v) => {
      const s0 = normalizeCountText_(v);
      if (!s0) return NaN;
      const s = s0        
        .replace(/[，、]/g, ","); // 念のため
      const m = s.match(/(\d+)/); // 最初の連続数字
      if (!m) return NaN;
      const n = parseInt(m[1], 10);
      return Number.isFinite(n) ? n : NaN;
    };

    // 「ほぼ数量だけ」判定（文章入りを弾く）
    // 例: "4" "4個" "4 こ" はOK、"4個 大盛り" "家族分で4個" はNG扱い→NOTEへ原文退避
    const isPlainCountOnly_ = (v) => {
      const s = normalizeCountText_(v);
      return /^\s*\d+\s*(?:個|こ|コ|ヶ|ケ)?\s*$/u.test(s);
    };

    // NOTE（リクエスト欄）に追記（1行化＆既存と結合）
    const appendToNote_ = (text) => {
      const clean = String(text ?? "")
        .replace(/\r\n|\n|\r/g, " ")
        .replace(/[ \t\u00A0]+/g, " ")
        .trim();
      if (!clean) return;
      formData.note = formData.note ? `${formData.note} / ${clean}` : clean;
    };

    // 「4」「4個」「４こ」など “数量だけ” の入力か判定（これならNOTEへは書かない）
    const isSimpleCountText_ = (v) => {
      const s = String(v ?? "").trim()
        .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
        .replace(/[ \t\u00A0]+/g, "");
      return /^(\d+)(個|こ|ヶ|ケ)?$/.test(s);
    };

    // 【重要】マスタの何行目を参照するかを管理するポインタ
    let masterPointer = 0;

    counts.forEach((countStr, index) => {
      if (countStr === null || countStr === undefined || String(countStr).trim() === "") {
        // グリッドの未選択行など：対応するマスタ行も進める
        masterPointer++;
        return;
      }

      // 参照先の項目を取得
      let menu = targets[masterPointer];

      // 【修正の核心】
      // もし参照した項目が「親項目（小メニュー空）」だった場合、
      // それはグリッドの選択肢（具材）ではないので、その行を飛ばして次を見る
      while (menu && (!menu.childName || menu.childName.trim() === "") && targets.length > masterPointer + 1) {
        masterPointer++;
        menu = targets[masterPointer];
      }

      // ラベル（NOTE/理由用）
      const parent = String(menu && menu.parentName || safeTitle || "").trim();
      const child  = String(menu && menu.childName  || "").trim();
      const hasChild = !!child && child !== parent;
      const label = hasChild ? `${parent}(${child})` : parent;

      // 数量解析
      const rawInput = String(countStr ?? "");
      const count = parseCountFromText_(rawInput);
      const plain = isPlainCountOnly_(rawInput);

      // 原文をNOTEに退避したか（これが true の場合、下の appendRequestNote_ は重複になりやすい）
      const wroteRawToNote = !isSimpleCountText_(countStr);
      if (wroteRawToNote) {
        appendToNote_(`【${safeTitle}】${String(countStr).trim()}`);
      }

      // (A) 数字が拾えない：NOTEへ原文退避＋★要確認
      if (!Number.isFinite(count) || count <= 0) {
         // 原文はすでにNOTEへ退避しているなら二重になるので追記しない
        if (!wroteRawToNote) {
          appendRequestNote_(`【数量判定できず】${label}: ${rawInput}`);
        }
        pushNeedsCheck_(`数量判定できず: ${label}`);
        masterPointer++;
        return;
      }

      // (B) 数字は拾えるが文章入り：NOTEへ原文退避＋★要確認
      if (!plain) {
        if (!wroteRawToNote) {
          appendRequestNote_(`【自由記入あり】${label}: ${rawInput}`);
        }
        // ★要確認にはするが、理由(REASON)は自動入力しない（空欄のまま）
        markNeedsCheck_();
      }

      if (!menu) {
        // menuが取れないのは想定外なので★要確認
        if (!wroteRawToNote) {
          appendRequestNote_(`【メニュー紐付け不明】${safeTitle}: ${rawInput}`);
        }
        pushNeedsCheck_(`メニュー紐付け不明: ${safeTitle}`);
        masterPointer++;
        return;
      }

      // 保存用（これまで通り：略称優先）
      const internalName =
        menu.shortName || (hasChild ? `${parent}(${child})` : parent);

      // 返信用（小メニュー有無に関係なく、自動返信表示名を優先）
      const auto = String(menu.autoReplyName || "").trim();
      const customerName =
        auto ||
        (hasChild ? `${parent}(${child})` : parent);

      formData.orderDetails += `・${internalName} x ${count}\n`;
      formData.orderDetailsForCustomer += `・${customerName} x ${count}\n`;
      formData.totalItems += count;
      formData.totalPrice += (menu.price || 0) * count;
      
      const group = menu.group || "その他";
      formData.groupSummary[group] = (formData.groupSummary[group] || 0) + count;

      // この回答の処理が終わったので、次の回答のためにマスタのポインタを進める
      masterPointer++;
    });
  }
};