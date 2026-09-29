# Native 最終実操作記録

- iOS 26.4 / iPhone 17 Pro Simulator / Expo Go、ローカル API・Supabase、合成 admin・primary store。
- 正規画面表: `NATIVE_PAGE_INVENTORY_FINAL.csv`、36画面の主操作・保存・再開をPASS。33業務は `runtime/native-business-results.json`、認証・店舗・今日3画面は `runtime/native-auth-results.json` の実操作証跡に基づきます。React Native Webの操作をNativeへ転用していません。
- 最終コード内容hash: `514ed7c1ec53dddbdb27149707ba9047d7f8eab20a30d7e7ef356b5594c3a3ca`（`runtime/document-codehash-native-final.json`）。後半に入った帳票ラベル補修は明示Reload後に見積・請求を再開して再確認しました。

## 保存・再開の確認

顧客/車両/商談各4画面、予約3、下取3、整備4、写真3、見積/見積詳細/請求/請求詳細/入金5、成約/取消/納車3を実操作しました。整備は新規顧客と車両をその場で保存、作業3行4000円→行copy/edit/delete後4500円、見積copy5000円、請求copy5500円、合成現金500円入金後未入金5000円。元見積4500円・元請求5000円は再開して不変でした。新しい詳細表示は数量/税込単価/税抜行金額/内税/入金の保存値と一致しています。

## PDFの確認範囲

見積はNative UIでPDF生成・共有シートを開き、直接の印刷前プレビューで小計4092円・税408円・合計4500円と小数数量を目視しました。プリンタ未選択のまま閉じています。

請求はNative UIでPDF生成と450KB共有シート表示を確認しました。Simulatorの共有拡張のPreview/Printを選択してもPDF表示画面へ移らず、**OS内プレビュー表示は未確認**です。そのため、UIが生成した既知UUIDのPDFだけを端末cacheから取得してテキスト抽出・画像描画で照合しました。`runtime/native-invoice-generated.pdf/png` は数量2.5/1.5/0.5、小計5001円・税499円・合計5500円・支払済500円・未払5000円です。これは生成物の内容検査であり、Nativeプレビュー表示PASSへ読み替えていません。外部共有・実印刷・実決済はありません。

## 検出と補修

写真送信はExpo57 converterが旧URIオブジェクトを拒否する製品不具合を実検出しました。親がplatform native Expo Fileへ補修後、車両/下取/整備すべてライブラリ選択→保存→一覧→再開→青い合成画像のdecoded表示を確認しました。最初の失敗経緯はJSON内photo_attemptsに保持しています。

帳票詳細のnet行金額に税抜の説明がなかったため、親が表示だけ補修しました。明示Reload後のスクリーンショットで新ラベル・数量・単価・集計の一致を確認しました。

Maestroの可視判定でtab裏の保存ボタンを誤タップし未保存整備draftを失った試行はPASSへ数えていません。再入力し、自然な追加swipeで保存ボタン全体へ到達することを画像で確認した後に保存しました。これは製品のスクロール不能ではありません。

## 観測限界

Native全console/全HTTP監視は実施していません。画面のエラーと実操作結果の確認であり、RNWebのconsole/failed-fetch監視とは区別します。カメラ撮影はSimulator対象外ですが、写真3画面はライブラリから同じローカル合成PNGを選択して実保存しています。実顧客データ・秘密・Production・mainは変更していません。
