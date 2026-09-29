# Native写真送信の診断と補修

## 再現

専用iOS Simulator/Expo Go、合成PNGのみ。下取り詳細→写真追加→写真ライブラリ→合成画像を選択すると「通信を完了できませんでした」。04:52/04:53 JSTに2回再現。Maestro実行は `node runtime/native-mcp.cjs run runtime/native-business-step.yaml`。業務操作担当の既存UI再現を親が引き継ぎ、並列のsales操作は停止せず診断しました。

## 仮説と観測

1. 端末画像を読めない: picker cacheに各1810bytesのPNGが存在。写真ライブラリ選択そのものは成功。
2. Native multipart変換が失敗: 採用。installed Expo57 runtime.native.tsはglobal fetchをExpo版へ切り替え、convertFormData.tsは旧URI descriptorを明示拒否します。
3. API/Storageの20秒timeout: 初期候補。Web同API画像保存はPASS、実converterの再現でAPI前の失敗原因を特定。根拠なくtimeoutを延長していません。

`node runtime/native-photo-converter-probe.cjs` は実installed converterを読み、旧{uri,name,type}を渡すとUnsupported FormDataPart implementation、bytes互換Fileは成功することを確認しました。結果runtime/native-photo-converter-probe.json。OSログは対象Expo Goの時刻/エラーコードのみ抽出し、本文・認証値を保存していません。

## 補修と検査

旧車両uploadと分類写真uploadの共通helperを追加。Nativeはexpo-file-system57.0.6のFileを使い、pickerの元fileName/mimeTypeを保持するBlob互換delegateでbytesを渡します。WebはFile/Blobを維持。API/RLS/認証header/timeoutは変更しません。framework固有の認証付きtransport補修と最終runtime検査はCodex担当です。Qwenへ資格情報やruntimeを渡していません。

最初のdynamic import版はunit/build PASSでしたがnativeでHMRClient.setup例外を検出したため不採用（候補07）。Metroのplatform-specific `photoUpload.native.ts`でstatic importする方式に補修しました。型検査とactual Expo converterを使う4回帰試験はPASS。Nativeの下取り・車両は実送信→戻る→再表示→青い合成画像のデコード表示までPASS。整備写真もNativeでupload→一覧→再開→合成画像のデコード表示までPASSです。RN Webは3種とも同じ再表示操作までPASS。候補08のコードを採用対象とし、失敗した候補07を最終PASSへ流用しません。

回帰試験は `node --test scripts/photo-upload.test.cjs`。旧形式拒否、Native bytes/filename/MIMEのmultipart保持、Web File保持、Web URI→Blob変換を検証。元写真名をcache UUIDへ変えない点は独立reviewで指摘され補修しました。

参考一次資料: [Expo公式画像upload例](https://github.com/expo/image-upload-example)、[Expo FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/)。決定根拠は実際のinstalled57.0.20/57.0.6ソースと実行結果です。
