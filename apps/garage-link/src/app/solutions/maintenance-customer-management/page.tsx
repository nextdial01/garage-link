import type { Metadata } from 'next';
import { SeoIntentPage } from '@/components/public-site/SeoIntentPage';

export const metadata: Metadata = {
  title: '整備工場の顧客管理システム｜車両・整備履歴・車検期限を一元管理',
  description: '整備工場・車検工場向け顧客管理システム。顧客と車両、予約、整備履歴、部品、見積・請求、次回車検を一つの案件で管理。GARAGE LINKは月額0円から試せます。',
  alternates: { canonical: '/solutions/maintenance-customer-management' },
};

export default function MaintenanceCustomerManagementPage() {
  return (
    <SeoIntentPage
      source="seo_maintenance_customer"
      eyebrow="整備工場 顧客管理システム"
      title="整備工場の顧客・車両・整備履歴を、一つの案件で管理。"
      lead="誰の車が、何の作業で入庫し、どの部品を使い、いつ納車し、次の車検がいつか。顧客と車両を分けずに確認します。"
      demoScenario={{ business: 'maintenance', management: 'mixed', goal: 'maintenance' }}
      problems={[
        { title: '顧客台帳と整備履歴が別', body: '顧客名から車両や前回作業を探し直す運用では、受付時の確認に時間がかかります。' },
        { title: '受付と整備で情報が分断', body: '依頼内容、追加作業、使用部品、納車予定が担当者ごとに分かれると、次の対応が見えにくくなります。' },
        { title: '次回期限が別管理', body: '車検満了日や点検時期を顧客・車両と同じ場所に残し、将来の案内対象を確認できる状態が必要です。' },
      ]}
      capabilities={[
        { title: '予約・入庫', body: '受付日時、依頼内容、担当者、対象車両、納車予定を案件として確認します。' },
        { title: '整備履歴・部品', body: '作業内容、使用部品、数量、工賃を記録し、見積・請求へつなげます。' },
        { title: '顧客・車両', body: '顧客情報と対象車両をひも付け、過去の案件と次回対応を探しやすくします。' },
        { title: '次回車検・点検', body: '満了日と次回案内時期を記録できます。L-LINKによる自動連携は現在提供準備中です。' },
      ]}
      fit={[
        '顧客・車両・整備案件を別々の台帳から探している',
        '受付から見積・請求・納車まで同じ案件で共有したい',
        '次回車検や点検時期を車両情報と一緒に残したい',
      ]}
      notFit={[
        '検査ライン機器との専用ハードウェア連携が必須の場合',
        'メーカーや加盟店本部が指定する管理システムを置き換えられない場合',
        'LINE自動配信だけを単独で今すぐ導入することが目的の場合',
      ]}
      relatedHref="/industries/maintenance"
      relatedLabel="整備工場での使い方を見る"
      faq={[
        { q: '顧客と複数車両を管理できますか？', a: '顧客情報と車両情報を登録し、整備・見積などの業務とひも付けて確認できます。' },
        { q: '見積・請求も使えますか？', a: 'はい。Freeプランでは見積・請求を月5件まで利用できます。' },
        { q: '車検案内をLINEで自動送信できますか？', a: '次回車検などの期限は記録できます。L-LINK連携は現在提供準備中で、提供開始前は利用可能機能として案内していません。' },
      ]}
    />
  );
}
