export type FriendProfileOptionField =
  | "customer_status"
  | "source"
  | "preferred_contact_method"
  | "interest_category"
  | "inquiry_type";

export type FriendProfileOption = {
  value: string;
  label: string;
};

export const friendProfileOptions: Record<FriendProfileOptionField, FriendProfileOption[]> = {
  customer_status: [
    { value: "prospect", label: "見込み客" },
    { value: "negotiating", label: "商談中" },
    { value: "customer", label: "既存顧客" },
    { value: "repeat_candidate", label: "リピート候補" },
    { value: "dormant", label: "休眠" },
    { value: "no_follow", label: "対応不要" },
  ],
  source: [
    { value: "store_qr", label: "店頭QR" },
    { value: "instagram", label: "Instagram" },
    { value: "website", label: "ホームページ" },
    { value: "google_search", label: "Google検索" },
    { value: "google_map", label: "Googleマップ" },
    { value: "referral", label: "紹介" },
    { value: "flyer", label: "チラシ" },
    { value: "existing_customer", label: "既存顧客" },
    { value: "other", label: "その他" },
  ],
  preferred_contact_method: [
    { value: "line", label: "LINE" },
    { value: "phone", label: "電話" },
    { value: "email", label: "メール" },
    { value: "any", label: "どれでも可" },
  ],
  interest_category: [
    { value: "purchase", label: "購入相談" },
    { value: "assessment", label: "買取査定" },
    { value: "inspection", label: "車検" },
    { value: "repair", label: "修理" },
    { value: "custom", label: "カスタム" },
    { value: "maintenance", label: "点検" },
    { value: "insurance", label: "保険" },
    { value: "trade_in", label: "乗り換え" },
    { value: "other", label: "その他" },
  ],
  inquiry_type: [
    { value: "purchase_consultation", label: "購入相談" },
    { value: "assessment", label: "買取査定" },
    { value: "inspection_repair_custom", label: "車検・修理・カスタム" },
    { value: "visit_reservation", label: "来店予約" },
    { value: "test_ride", label: "試乗相談" },
    { value: "stock_check", label: "在庫確認" },
    { value: "other", label: "その他" },
  ],
};

export function getFriendProfileOptionLabel(field: FriendProfileOptionField, value: string | null | undefined) {
  if (!value) return "-";
  return friendProfileOptions[field].find((option) => option.value === value || option.label === value)?.label ?? value;
}

export function normalizeFriendProfileOptionValue(field: FriendProfileOptionField, value: string | null | undefined) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return null;
  return friendProfileOptions[field].find((option) => option.value === trimmed || option.label === trimmed)?.value ?? trimmed;
}

export function optionsForPublicQuestion(field: "interest_category" | "inquiry_type", configuredOptions: string[] | null | undefined) {
  const options = (configuredOptions ?? []).filter(Boolean);
  if (options.length > 0) return options.map((option) => ({ value: option, label: getFriendProfileOptionLabel(field, option) }));
  return friendProfileOptions[field];
}
