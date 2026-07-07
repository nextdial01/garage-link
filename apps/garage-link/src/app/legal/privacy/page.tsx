import { LegalPageShell, LegalSection } from '@/components/legal/LegalPageShell';
import {
  LEGAL_LAST_UPDATED,
  LEGAL_SELLER,
  LEGAL_SUBPROCESSORS,
} from '@/lib/legal/constants';

export default function PrivacyPage() {
  return (
    <LegalPageShell
      title="プライバシーポリシー"
      intro={`${LEGAL_SELLER.legalName}（以下「当社」）は、${LEGAL_SELLER.serviceName}（以下「本サービス」）における個人情報および関連情報の取り扱いについて、以下のとおり定めます。最終更新: ${LEGAL_LAST_UPDATED}`}
    >
      <LegalSection title="1. はじめに">
        <p>
          当社は、個人情報の保護に関する法律（個人情報保護法）その他関連法令を遵守し、利用者および利用者が本サービス上で取り扱う顧客等の情報を適切に保護します。
        </p>
      </LegalSection>

      <LegalSection title="2. 取得する情報">
        <p>当社は、本サービスの提供にあたり、次の情報を取得することがあります。</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>アカウント情報（店舗名、担当者名、メールアドレス、電話番号等）</li>
          <li>認証情報（ログイン履歴、IPアドレス、端末情報、Cookie 等）</li>
          <li>業務データ（在庫、車両、顧客、商談、整備、部品、見積、請求、棚卸等）</li>
          <li>決済関連情報（有料プラン利用時。クレジットカード番号等の機微情報は決済代行会社が直接処理し、当社は保持しない設計とします）</li>
          <li>サポート・問い合わせ内容</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. 利用目的">
        <p>当社は、取得した情報を次の目的で利用します。</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>本サービスの提供、本人確認、認証、アカウント管理</li>
          <li>料金の請求、決済、契約管理</li>
          <li>カスタマーサポート、障害対応、お問い合わせへの回答</li>
          <li>サービスの改善、新機能開発、利用状況の分析（個人を特定しない形式を含む）</li>
          <li>不正利用の防止、セキュリティ確保</li>
          <li>法令に基づく対応、権利行使または義務履行</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. 利用目的の変更">
        <p>
          当社は、利用目的が変更前と関連性を有すると合理的に認められる範囲で、利用目的を変更することがあります。変更した場合は、本ページへの掲示その他適切な方法で通知します。
        </p>
      </LegalSection>

      <LegalSection title="5. 第三者提供">
        <p>
          当社は、次の場合を除き、本人の同意なく個人データを第三者に提供しません。
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>法令に基づく場合</li>
          <li>人の生命、身体または財産の保護のために必要がある場合</li>
          <li>公衆衛生の向上または児童の健全な育成の推進のために特に必要がある場合</li>
          <li>国の機関等への協力が必要な場合</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. 委託（サブプロセッサ）">
        <p>
          当社は、本サービスの提供に必要な範囲で、個人データの取り扱いの全部または一部を外部事業者に委託することがあります。委託先の選定・監督を行い、契約等により適切な安全管理を求めます。
        </p>
        <p>主な委託先（2026年7月時点の想定）は次のとおりです。</p>
        <ul className="list-disc space-y-2 pl-5">
          {LEGAL_SUBPROCESSORS.map((item) => (
            <li key={item.name}>
              {item.name} — {item.purpose}
            </li>
          ))}
        </ul>
      </LegalSection>

      <LegalSection title="7. 保管期間">
        <p>
          当社は、利用目的の達成に必要な期間、個人データを保管します。有料プラン解約後は、解約日から1年間、利用者データを保管したのち削除します（利用再開は有料プランへの再契約のみ可能です）。アカウント削除後は、法令上の保存義務を除き、合理的な期間内に削除または匿名化します。
        </p>
      </LegalSection>

      <LegalSection title="8. 安全管理措置">
        <p>
          当社は、個人データの漏えい、滅失、毀損の防止その他安全管理のため、アクセス制御、通信の暗号化、権限管理、委託先監督等の措置を講じます。
        </p>
      </LegalSection>

      <LegalSection title="9. Cookie 等">
        <p>
          本サービスは、ログイン状態の維持、セキュリティ、利用状況の把握等のため、Cookie および類似技術を使用することがあります。ブラウザ設定により Cookie を無効化できますが、一部機能が利用できなくなる場合があります。
        </p>
      </LegalSection>

      <LegalSection title="10. 個人の権利">
        <p>
          利用者は、当社が保有する自己の個人データについて、開示、訂正、追加、削除、利用停止、第三者提供停止等を求めることができます。ご請求は {LEGAL_SELLER.email}{' '}
          までご連絡ください。本人確認のうえ、法令に従い対応します。
        </p>
      </LegalSection>

      <LegalSection title="11. 未成年者">
        <p>
          本サービスは、主に事業者向け SaaS として提供されます。18歳未満の方が利用する場合は、保護者等の同意を得たうえでご利用ください。
        </p>
      </LegalSection>

      <LegalSection title="12. プライバシーポリシーの変更">
        <p>
          当社は、法令またはサービス内容の変更等に応じ、本ポリシーを改定することがあります。重要な変更は、本サービス上での掲示等により通知します。
        </p>
      </LegalSection>

      <LegalSection title="13. お問い合わせ">
        <p>
          個人情報の取り扱いに関するお問い合わせは、{LEGAL_SELLER.email} までご連絡ください。
        </p>
        <p>
          事業者名: {LEGAL_SELLER.legalName}
          <br />
          所在地: {LEGAL_SELLER.address}
        </p>
      </LegalSection>
    </LegalPageShell>
  );
}
