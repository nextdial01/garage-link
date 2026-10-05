# GARAGE LINK LP 差分監査

基準SHA: `6ea2e8b4b8b6b1ca910e49ec024e454b5072ca4a`  
参照: [ATTIO_VISUAL_CONTRACT.json](./ATTIO_VISUAL_CONTRACT.json)、[attio-live-source-evidence.json](./attio-live-source-evidence.json)

## 比較方法

現行 `https://attio.com/` の公開HTMLとそのCSSを通常のHTTP GETで取得し、レスポンシブ規則・タイポグラフィ・余白・表面・動きをCSS宣言から抽出した。ブラウザ内スクリプトやcomputed-style計測は行っていない。取得した570×1430の画面は相対比の参考だけにし、その値はすべて推定扱いとして合否ゲートから外した。

実測された基準は、Inter Display 600の可変H1（64〜80px、line-height 0.95）、Inter 16px / 500の本文、白とnear-black、1pxの境界線、一般面での影なし、36px / 46pxのCTA、52pxのsticky header、375〜1536pxの明示breakpoint群。日本語はInterへ固定せず、既存の日本語システム書体を使い、同じ重量と文字階層を目標にする。

## 現行LPの差分

### REMOVE

- 5つの説明ボタンそれぞれに`min-height:70vh`を与え、右側の製品画面をstickyにする構造。短い説明の直後に大きな実製品UIと切替ナビを置く形へ変更する。
- 「見出しは550以下」「デスクトップ製品画面はsticky必須」の旧テスト基準。AttioのH1実測600と今回の非sticky製品切替を受け入れる検査へ置き換える。
- LP外枠の装飾青、セクション全体の灰色面、CTA以外へ広がるカード影と大きな角丸。
- 英語だけの小見出し（`TRY IT YOURSELF`、`MIGRATION`など）。意味を残し日本語にする。

### KEEP

- `GarageInteractiveDemo`の業務ロジック、状態遷移、自由操作、計測イベント。Product Platformは同じ実UIを`forcedView`で見せ、下の自由操作デモは条件選択・データ作成・見積確認を行う別体験として残す。
- 車両・顧客・商談・見積・整備の5状態、Free 0円、在庫5台、カード不要、CSV移行、料金リンク、FAQ、問い合わせ、法務リンク。
- `AcquisitionPageTracker`、signup/inquiry/loginのtracked link、structured data、モバイルメニュー。
- 製品内部の業務状態色とGARAGE LINKの識別要素。変更範囲はlanding外枠と製品プラットフォーム切替に限る。

### CHANGE

- Heroをロゴ/短いナビ/日本語H1/短い説明/主CTAに整理し、その直後に製品UIを表示する。
- 5項目を押して切り替える同一画面のProduct Platformへ変更する。デスクトップ・モバイルともにタブで切り替え、固定sticky stageとスクロール連動を使わない。
- 日本語用書体を維持し、H1 weight 600、本文16px/500、section見出し32px（992px以上40px）、52pxヘッダー、36〜46px CTAを契約値に合わせる。
- 最大幅1440px、境界線中心の薄い表面、契約のbreakpointを使う。料金はFreeの事実を一つの境界線パネルで整理し、大量カードを作らない。
- 主要セクションを「製品Platform → 自由操作デモ → CSV移行 → Free/料金 → データと法務 → FAQ → 最終CTA」の順にし、長い機能列を短い主張とUIで見せる。

## 実装前判定

構造変更の理由はHTML/CSSの実ルールとGARAGE LINKの5業務フローの両方にある。570px画面だけの比率推定は、ナビ方向・sticky採否・section順など重要構造の根拠に使っていない。テストを先に新契約へ合わせてから、LP実装を変更する。

## 検査で保持する事実

- H1 desktop weight 600、mobile 40px/600と600px以上の56px/600を許容する。
- 1440 / 1024 / 768 / 430 / 390の各幅でoverflow、文字切れ、CTA、Platform状態切替、自由操作デモ、料金、FAQ、最終CTAを確認する。
- Hero typography・section spacing・製品stage幅・CTA geometryは契約値±8%、日本語text block高さは±12%を目安にし、見た目監査も別に行う。
- desktop sticky stageを要求しない。Product stageは全幅の文書フロー内にあることを確認する。
- CTAのURL・signup/inquiry計測、structured data、料金/法務リンク、モバイルメニュー、reduced-motionを回帰確認する。

## 証跡上の制約

570×1430のAttio画面は前回表示されたが、ワークスペース内の画像パスが見つからなかった。最新の指示に従いブラウザ側の再計測・再キャプチャはせず、相対比は`ATTIO_VISUAL_CONTRACT.json`で推定・非ゲートとした。公開HTML/CSSの内容とSHA-256はsource evidenceに保存した。

## 反証と最終視覚QA

| 反証 | 判定 | 根拠 |
|---|---|---|
| Attioへ寄せすぎてGARAGE LINKらしさが消えていないか | PASS | 中古車・バイク・整備の用途、車両を起点にした5業務、Freeプラン、CSV移行、GARAGE LINK実画面を維持。 |
| 英語用書体設定が日本語可読性を損なっていないか | PASS | 日本語のシステム書体スタックを使用し、H1/本文のサイズと重量だけ契約値へ寄せた。 |
| 大きな製品画面でサービス内容が曖昧になっていないか | PASS | Heroは店舗管理の対象を明記し、Platform見出しと5つの業務タブがUIの意味を示す。 |
| 青を減らしてCTAが見つけにくくなっていないか | PASS | primary CTAはNear-black塗り、白文字、矢印、二次リンクとの面差で識別できる。 |
| スクロール演出を減らして車両→整備の流れが不明瞭でないか | PASS | 車両・顧客・商談・見積・整備の順序をタブにし、実際のデモ状態を切り替える。 |
| 自由操作デモとPlatformが重複して冗長でないか | PASS | 上段は実画面を5業務で閲覧、下段は業態・管理方法・目的を選んでデータを再生成する操作体験。別の動作をE2Eで確認。 |
| PCだけでなくスマートフォンも整っているか | PASS | 390px/430pxの全ページ・各主要区間、メニュー、横幅、文字切れ、タブ操作を確認。 |
| 改善でsignup/demo計測を壊していないか | PASS | hero signupの開始/入力/submitイベント、demoの生成/車両/商談/見積イベント、outbound attributionをE2Eで確認。 |
| SEO・価格・法務導線が維持されているか | PASS | SoftwareApplication JSON-LD、0円・在庫5台・カード不要、料金・FAQ・3法務リンクを確認。 |
| 表面だけでなく情報階層を再現できたか | PASS | 短いHeroからPlatform UI、自由操作、CSV移行、料金、信頼/法務、FAQ、最終CTAの順で情報を配置。 |

1440px、1024px、768px、430px、390pxで撮影したGARAGE LINKのスクリーンショットを`./screenshots/`へ保存。自動条件、5幅の画面確認、モバイルとデスクトップの個別確認にP0/P1差分は残っていない。Attio比較画像は旧570×1430画像がローカルに存在せず、現在の指示に従いブラウザから再取得・再撮影していないため未添付。
