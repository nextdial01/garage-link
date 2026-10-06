# 独立CV・法務監査 2026-10-06

対象: localhost:3001、17公開ルート、1440/390、認証・課金・送信なし。ブラウザの外部通信を遮断。
証拠: independent-browser-report.json、independent-tabs-report.json、independent-keyboard-demo-report.json、independent-*.png。

## P0/P1

P0なし。P1: ホームの表示専用theatreはpointer-events-noneでマウス操作を拒否しているが、内部検索入力と追加/行ボタンがTab巡回に残る。実Tab順は外側tab→tabpanel→検索INPUT→車両を追加BUTTON→プリウスBUTTON→N-BOX BUTTON。マウス実クリックはtabpanelのinterceptionで失敗。内部プレビューをinertにし、外5tabと実操作デモへの案内を保持すること。画面が表示専用である短い説明も必要。

## 10反証への評価

1. Free訴求: 冒頭で月額0円・カード不要、料金部で5台/1人/1店舗/月5件を明示。理解可能。
2. Standard移行: 台数/人数の拡大とBasic付帯を価格と並べて提示。Pro付帯の捏造なし。
3. Basicと準備状況: 商用付帯とGARAGE LINKデータ連携準備中が別文。Free/Starter付帯なしも料金詳細で明示。
4. CTA量: home signup6箇所、各説明ページ3-4箇所。hero/製品確認後/料金/末尾で用途が分かれている。
5. 外部退出: 一般公開ページの外部リンクはfooter問い合わせ1件。関連サービスへの販売誘導の退出なし。
6. mobile長さ: home3709px、pricing2082px、demo2523px。法務を除く通常ページに過剰な長文はない。
7. 製品画面幅: desktopは広いtheatre、mobileは読みやすい2件の縦表示。静的縮小スクリーンショットではなくデモUI。実製品との同一性は今回の検証範囲外。display-only内部ボタンの誤操作/keyboardだけP1。
8. 日本語改行: home/pricing/demo/signup/FAQ/業種の実画像で破綻なし。390の横overflowは全17ルート0。
9. 対象: 中古車・バイク販売修理・整備工場を冒頭と業種ページで表示。デモは整備業種に切替生成できた。
10. 法務整合: card-only hosted Checkout実装に合わせた現在形、カード番号等非保持の範囲を維持。期間末解約/終了から1年保管/Free復帰不可/インボイス非発行/返金原則不可を保持。追加購入不可の注意もpricingに反映済み。

34描画すべてHTTP200、JS例外0、横overflow0。5tabは両幅で切替PASS、ArrowRight末尾→先頭もPASS。standalone demo見積表示と整備業種生成PASS。Homeは製品画面が冒頭に現れ、説明文中心のテンプレートより製品を確かめる体験になっている。

課金権限付与・実際の登録・CV増加は未検証。Backend billingは変更していない。

## 修正後最終確認

最終P0/P1: なし。P1は解消済み。両幅で内部プレビューinert=true、Tab順は外tab→tabpanel→無料登録→実操作デモ→料金全プランになり、内部INPUT/BUTTONには入らない。操作風の追加/検索/商談作成ボタンは表示専用プレビューから隠れ、タブ切替・自由操作デモの短い説明が表示される。外5tabと実際の製品見出しは両幅で保持。切替後animation完了を待ち、scroll0で最終画面を取得した。

10反証は上記評価を維持し、7番のP1も解消。証拠: independent-final-report.json、independent-final-home-1440.png、independent-final-home-390.png、independent-final-tab-*.png。
