import { LegalPageShell, LegalSection } from '@/components/legal/LegalPageShell';
import {
  LEGAL_LAST_UPDATED,
  LEGAL_PLANS,
  LEGAL_SELLER,
  LEGAL_TAX_NOTE,
} from '@/lib/legal/constants';

function formatYen(value: number) {
  return `${value.toLocaleString('ja-JP')}円（税抜）`;
}

export default function TokushoPage() {
  return (
    <LegalPageShell
      title="特定商取引法に基づく表記"
      intro={`${LEGAL_SELLER.serviceName} のインターネット通信販売に関する表示です。最終更新: ${LEGAL_LAST_UPDATED}`}
    >
      <LegalSection title="販売事業者名">
        <p>{LEGAL_SELLER.legalName}</p>
      </LegalSection>

      <LegalSection title="運営責任者">
        <p>{LEGAL_SELLER.representative}</p>
      </LegalSection>

      <LegalSection title="所在地">
        <p>{LEGAL_SELLER.address}</p>
      </LegalSection>

      <LegalSection title="電話番号">
        <p>
          {LEGAL_SELLER.phone}
          <br />
          <span className="text-slate-500">
            ※お問い合わせは原則メールにて受け付けます。電話は折返し対応とする場合があります。
          </span>
        </p>
      </LegalSection>

      <LegalSection title="メールアドレス">
        <p>{LEGAL_SELLER.email}</p>
        {LEGAL_SELLER.lineOfficialUrl ? (
          <p className="mt-2">
            公式LINE（サポート窓口）:{' '}
            <a href={LEGAL_SELLER.lineOfficialUrl} className="font-semibold text-blue-600 hover:underline">
              {LEGAL_SELLER.lineOfficialUrl}
            </a>
            <br />
            <span className="text-slate-500">※契約・個人情報に関するお問い合わせは、上記メールアドレスをご利用ください。</span>
          </p>
        ) : null}
      </LegalSection>

      <LegalSection title="販売URL">
        <p>{LEGAL_SELLER.serviceUrl}</p>
      </LegalSection>

      <LegalSection title="運営会社サイト">
        <p>{LEGAL_SELLER.corporateHomeUrl}</p>
      </LegalSection>

      <LegalSection title="販売価格">
        <ul className="list-disc space-y-2 pl-5">
          {LEGAL_PLANS.map((plan) => (
            <li key={plan.name}>
              {plan.name}: {plan.monthlyPriceExTax === 0 ? '無料' : `${formatYen(plan.monthlyPriceExTax)} / 月`}
              {plan.note ? `（${plan.note}）` : ''}
            </li>
          ))}
        </ul>
        <p className="mt-2">{LEGAL_TAX_NOTE}</p>
        <p>
          オプション（追加スタッフ・店舗・ストレージ等）の料金は、サービス内の料金表または申込画面に表示します。
        </p>
      </LegalSection>

      <LegalSection title="商品代金以外の必要料金">
        <p>
          インターネット接続に必要な通信料、決済手数料（該当する場合）等は、利用者の負担となります。
        </p>
      </LegalSection>

      <LegalSection title="支払方法">
        <p>
          クレジットカード決済（Stripe 経由、導入後）。ローンチ初期は請求書・銀行振込等による手動契約を行う場合があります。
        </p>
      </LegalSection>

      <LegalSection title="支払時期">
        <p>
          有料プランは、申込日または契約開始日を起算日として、月額の前払い（または Stripe
          サブスクリプションの請求サイクルに従う）とします。詳細は利用規約および申込画面の表示に従います。
        </p>
      </LegalSection>

      <LegalSection title="役務の提供時期">
        <p>
          決済確認または契約成立後、速やかに有料プランの機能を利用可能にします。Free
          プランはアカウント登録完了後、直ちに利用開始できます。
        </p>
      </LegalSection>

      <LegalSection title="返品・キャンセル・解約">
        <p>
          本サービスはデジタルコンテンツ・クラウドサービスの提供であり、原則として提供開始後の返品・返金はお受けできません。
        </p>
        <p>
          有料プランの解約・プラン変更の条件は利用規約およびサービス内の設定画面に従います。解約後も、当該請求期間の終了までは有料機能を利用できる場合があります。
        </p>
        <p>
          Free プランへのダウングレードはできません。解約後の利用再開は有料プランへの再契約のみ可能です。解約日から1年間データを保管したのち、当社はデータを削除します。
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
