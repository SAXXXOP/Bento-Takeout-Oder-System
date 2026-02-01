function onFormSubmit(e) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("LINE_TOKEN");
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(20000); 
  } catch (err) {
    console.error("ロック取得失敗");
    return;
  }

  // --- 0. 共通変数の宣言 ---
  const ss = SpreadsheetApp.openById("1h9U3QT1Uwx8qhjRbOzjZdUkk3YoDcSQnnTMTkgOjWwc");
  
  // --- 1. 回答解析 ---
  const response = (e && e.response) ? e.response : FormApp.openByUrl(ss.getFormUrl()).getResponses().pop();
  if (!response) { lock.releaseLock(); return; }

  const itemResponses = response.getItemResponses();
  let userId = "", userName = "", phoneNumber = "", pickupDate = "", pickupTime = "", note = "";
  let orderDetails = "", totalItems = 0, totalPrice = 0;
  let groupSummary = {};
  let isRegular = "";
  let isChange = false; 

  // マスタ読込はループの外で1回だけ行う
  const menuMap = buildMenuMap(); 

  // 全回答をループしてデータを取得
  for (const ir of itemResponses) {
    const item = ir.getItem();
    const title = item.getTitle().trim();
    const res = ir.getResponse();
    if (!res || res === "" || (Array.isArray(res) && res.every(v => v === null))) continue;

    // --- 解析ループの中にこれを入れてテストしてください ---
    console.log("チェック中の項目名: [" + title + "]"); // ログ出力

    if (title.includes("元予約No")) {
      console.log("★元予約Noを検出しました！ 値: " + res);
      isChange = true;
      continue; 
    }

    // --- A. 基本情報の抽出 ---
    // カッコを含めて柔軟に判定
    if (title.toUpperCase().includes("LINE_ID")) {
      userId = res;
      continue; 
    }
    if (title.includes("元予約No")) {
      isChange = true;
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

    // アンケート等の除外項目
    if (title.includes("ご利用されるのは") || title.includes("商品を選ぶ") || title.includes("注文を送信")) {
      continue;
    }

    // --- B. 商品集計ロジック ---
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
      if (gridDetails) orderDetails += `・${title}:\n${gridDetails}`;
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

  // --- 2. 変更対象のチェック ---
  const userProps = PropertiesService.getUserProperties();
  const changeTargetJson = userId ? userProps.getProperty(`CHANGE_TARGET_${userId}`) : null;
  const changeTarget = changeTargetJson ? JSON.parse(changeTargetJson) : null;

  // --- 3. 予約番号発行 ---
  const todayStr = Utilities.formatDate(new Date(), "JST", "MMdd");
  const lastDate = props.getProperty("LAST_DATE");
  const lastNum = Number(props.getProperty("LAST_NUM") || 0);
  const dailyCount = (lastDate === todayStr) ? lastNum + 1 : 1;
  props.setProperty("LAST_DATE", todayStr);
  props.setProperty("LAST_NUM", dailyCount.toString());
  const reservationNo = `${todayStr}-${("0" + dailyCount).slice(-2)}`;

  // --- 4. 変更予約の場合：元予約を無効化 ---
  if (changeTarget) {
    const sheet = ss.getSheetByName("注文一覧");
    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      // 予約番号が一致する行を探す
      if (data[i][1].toString().replace("'", "") === changeTarget.no) {
        const row = i + 1;
        
        // M列（13列目）を「変更済」に更新
        sheet.getRange(row, 13).setValue("変更済"); 
        
        // ★【修正】行全体（1〜14列目）をグレーアウト
        // 範囲を 13 → 14 に広げます
        sheet.getRange(row, 1, 1, 14).setBackground("#cccccc"); 
        
        break;
      }
    }
  }

  // --- 5. 注文一覧へ書き込み ---
  const groupText = Object.entries(groupSummary).map(([g, c]) => `${g}:${c}`).join("\n");
  const sheet = ss.getSheetByName("注文一覧");
  if (sheet) {
    sheet.appendRow([
      new Date(), 
      "'" + reservationNo,
      phoneNumber,
      userName,
      `${pickupDate} / ${pickupTime}`,
      note,
      orderDetails.trim(),
      totalItems,
      totalPrice,
      userId,
      groupText,
      isRegular,
      isChange ? "変更後" : "通常",
      isChange ? changeTarget.no : "" // ★【追加】N列（14列目）に変更元の予約Noを記録
    ]);
  }

  // --- 6. 顧客名簿の更新 ---
  try {
    updateCustomerMaster(userId, userName, phoneNumber, totalPrice, orderDetails, totalItems);
  } catch (err) {
    console.error("顧客名簿の更新エラー: " + err);
  }

  // --- 7. LINE通知 ---
  console.log("通知直前のisChangeの状態: " + isChange); // これも確認用に残します

  if (userId && token) {
    // ログで検出できていれば、ここで必ずタイトルが切り替わります
    const titleHeader = isChange ? "【予約内容の変更を承りました】" : "【ご予約ありがとうございました】";
    
    console.log("送信タイトル: " + titleHeader); // ログで最終確認

    sendLineTextMessage(
      userId, 
      token, 
      reservationNo, 
      pickupDate, 
      pickupTime, 
      userName, 
      phoneNumber, 
      note, 
      orderDetails, 
      totalItems, 
      totalPrice,
      titleHeader // ← ここでタイトルを渡す
    );
  }

  // --- 8. 一時データの削除 ---
  if (userId) {
    userProps.deleteProperty(`CHANGE_TARGET_${userId}`);
    userProps.deleteProperty(`CHANGE_LIST_${userId}`);
  }

  lock.releaseLock();
}

// --- LINEメッセージ送信（ここを完全に上書き！） ---
function sendLineTextMessage(userId, token, reservationNo, pickupDate, pickupTime, userName, phoneNumber, note, orderDetails, totalItems, totalPrice, titleHeader) {
  
  // ログから渡ってきた titleHeader を、メッセージの1行目に確実に埋め込みます
  const text = [
    "━━━━━━━━━━━━━",
    ` ${titleHeader}`, // ★ここが "ご予約〜" と直接書かれていた可能性があります
    "━━━━━━━━━━━━━",
    `■予約No：${reservationNo}`,
    `■受取り：${pickupDate} ${pickupTime}`,
    `■お名前：${userName} 様`,
    `■お電話：${phoneNumber.replace("'", "")}`,
    "【ご要望】",
    note || "なし",
    "【ご注文内容】",
    orderDetails.trim(),
    ` 合計：${totalItems}点 / ${totalPrice.toLocaleString()}円`,
    "━━━━━━━━━━━━━"
  ].join("\n");

  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token
    },
    payload: JSON.stringify({
      to: userId,
      messages: [{ type: "text", text }]
    }),
    muteHttpExceptions: true
  });
}

// buildMenuMapは変更なしのため省略（そのままお使いください）

// --- メニューマスタ読込 ---
function buildMenuMap() {
  const sheet = SpreadsheetApp.getActive().getSheetByName("メニューマスタ");
  const values = sheet.getDataRange().getValues();
  values.shift(); 
  const map = { parents: {}, children: {} };

  values.forEach(r => {
    const info = {
      group: r[1] ? r[1].toString().trim() : "未設定",
      parent: r[2] ? r[2].toString().trim() : "",
      child: r[3] ? r[3].toString().trim() : "",
      price: Number(r[4]) || 0,
      short: r[5] ? r[5].toString().trim() : ""
    };
    if (info.parent) map.parents[info.parent] = info;
    if (info.child) map.children[info.child] = info;
    if (info.short) map.parents[info.short] = info;
  });
  return map;
}

// --- LINEメッセージ送信（ここを完全に上書き！） ---
function sendLineTextMessage(userId, token, reservationNo, pickupDate, pickupTime, userName, phoneNumber, note, orderDetails, totalItems, totalPrice, titleHeader) {
  
  // ログから渡ってきた titleHeader を、メッセージの1行目に確実に埋め込みます
  const text = [
    "━━━━━━━━━━━━━",
    ` ${titleHeader}`, // ★ここが "ご予約〜" と直接書かれていた可能性があります
    "━━━━━━━━━━━━━",
    `■予約No：${reservationNo}`,
    `■受取り：${pickupDate} ${pickupTime}`,
    `■お名前：${userName} 様`,
    `■お電話：${phoneNumber.replace("'", "")}`,
    "【ご要望】",
    note || "なし",
    "【ご注文内容】",
    orderDetails.trim(),
    ` 合計：${totalItems}点 / ${totalPrice.toLocaleString()}円`,
    "━━━━━━━━━━━━━"
  ].join("\n");

  UrlFetchApp.fetch("https://api.line.me/v2/bot/message/push", {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token
    },
    payload: JSON.stringify({
      to: userId,
      messages: [{ type: "text", text }]
    }),
    muteHttpExceptions: true
  });
}