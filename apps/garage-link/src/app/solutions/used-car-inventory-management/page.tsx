import type { Metadata } from 'next';
import { SeoIntentPage } from '@/components/public-site/SeoIntentPage';

export const metadata: Metadata = {
  title: '中古車の在庫管理システム｜Excel台帳から車両・商談を一元管理',
  description: '中古車販売店向け在庫管理システム。仕入日、原価、在庫日数、掲載状態、顧客・商談、見積・請求を車両単位でまとめて管理。GARAGE LINKは在庫5台まで月額0円です。',
  alternates: { canonical: '/solutions/used-car-inventory-management' },
};

export default function UsedCarInventoryManagementPage() {
  return (
    <SeoIntentPage
      source="seo_used_car_inventory"
      eyebrow="中古車 在庫管理システム"
      title="中古車の在庫管理を、Excelの車両台帳から一つの画面へ。"
      lead="仕入日・原価・在庫日数・掲載状態だけで終わらず、問い合わせ、商談、見積、納車まで同じ車両にひも付けて確認します。"
      demoScenario={{ business: 'used-car', management: 'excel', goal: 'inventory' }}
      problems={[
        { title: '車両台帳と商談が別', body: '在庫表だけでは、その車両に誰から問い合わせがあり、次に誰へ連絡するかまで追えません。' },
        { title: '同じ車両情報を再入力', body: '見積・請求や整備で同じ車両情報を別管理すると、更新漏れや確認作業が増えます。' },
        { title: '長期在庫を後から発見', body: '仕入日と在庫状態を車両ごとに持ち、長く残っている車両を日常確認できる状態が必要です。' },
      ]}
      capabilities={[
        { title: '車両在庫', body: '仕入、原価、入庫日、販売状態、保管場所、媒体掲載状況を車両ごとに確認します。' },
        { title: '顧客・商談', body: '問い合わせ、希望条件、対象車両、見積、次回連絡を同じ車両へつなげます。' },
        { title: '見積・請求', body: '車両、整備、部品、諸費用の明細を使い、見積から請求へ引き継ぎます。' },
        { title: '納車後の期限', body: '納車日、点検・車検など次回確認したい期限を顧客・車両に残します。' },
      ]}
      fit={[
        'Excelや複数台帳に車両・顧客・商談が分かれている',
        '少人数の店舗で在庫から商談・帳票まで一つにまとめたい',
        '最初は少数車両で試してから本格導入を判断したい',
      ]}
      notFit={[
        '複数の中古車広告媒体へ車両情報を自動一括掲載することが最優先の場合',
        'メーカー・FC指定の基幹システムを変更できない場合',
        '大規模ディーラー向けの専用基幹会計・DMS連携が必須の場合',
      ]}
      relatedHref="/industries/used-car"
      relatedLabel="中古車販売での使い方を見る"
      faq={[
        { q: 'Excelから始めてもいいですか？', a: 'はい。過去データをすべて移す前に、販売中の車両を1台だけ登録して操作を確認できます。' },
        { q: '無料で何台まで登録できますか？', a: 'Freeプランは在庫5台、スタッフ1人、1店舗まで月額0円で利用できます。' },
        { q: '広告媒体へ自動掲載できますか？', a: '現在は媒体掲載状況を車両へ記録できますが、複数広告媒体への自動一括掲載を主機能とはしていません。その用途が最優先なら専用サービスも比較してください。' },
      ]}
    />
  );
}
