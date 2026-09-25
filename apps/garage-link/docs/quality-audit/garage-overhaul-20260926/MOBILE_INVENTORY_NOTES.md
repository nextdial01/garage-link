# Mobile到達画面の初期棚卸し

自動抽出候補 37画面。App.tsx login/OTP/store gateとv2 route union、Tab union、V2Resource unionから展開。create/editは同じcomponentでも別操作として区別。写真は関連先3種を区別。

車両/整備formのstepとdetail内tabは各screenの操作検証に含める。PDF/印刷/写真OS pickerはplatform機能として追加記録。旧App.tsxのpage分岐はstore選択→todayでv2を返すため通常導線から到達するか実操作で確認し、到達可能なら追加する。静的候補数だけで全到達画面確認完了とはしない。

全行NOT_TESTED。OTP撤去後は更新し、非強制の旧URL/互換挙動も別検証する。

## 最終候補04の再集計
通常メールOTP画面を撤去し、到達可能なアプリ画面は36。CAPTCHAはlogin内の条件付きUIであり独立routeではありません。MOBILE_PAGE_INVENTORY_FINAL.csvに全36の主操作、保存、再表示を記録しました。

全36の操作プラットフォームはReact Native Web（390px、実ローカルAPI・DB、写真実storage保存）です。SSRやモック表示を操作PASSへ数えません。見積/請求PDFの追加プレビュー2件も開閉・元金額一致を確認しました。iOS Simulatorのnative版はログアウト→1回ログイン→店舗→今日、終了再起動→認証復帰、5タブ移動を実施しました。native全36画面、物理カメラ、Android実機、人間の実CAPTCHAは未確認であり、この36 PASSをそれらの代用にはしません。
