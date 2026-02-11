# FAQ

## Q. メニューが出ない
A. 再読み込みで onOpen を実行。さらに **管理者/閲覧者の判定**（`ADMIN_EMAILS` など）が原因の場合もあります。
- `★予約管理 → 初期設定/復旧 → 権限チェック（管理者/閲覧者）` で判定結果を確認
→ `setup/menu-visibility.md`

## Q. フォーム送信したのに何も起きない
A. `onFormSubmit` トリガーと承認を確認。  
→ `setup/triggers.md` / `setup/permissions.md`

## Q. 要確認が急に増えた
A. フォーム質問タイトル変更が多い。  
→ `troubleshooting/form-title-mismatch.md`

## Q. LINE Webhook が届かない
A. デプロイURL・WEBHOOK_KEY・アクセス権を確認。  
→ `setup/deployment.md` / `troubleshooting/line-webhook-fails.md`
