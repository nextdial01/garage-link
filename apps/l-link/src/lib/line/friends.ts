import 'server-only';
import { createLLinkServiceClient, getCurrentLLinkCompany } from '@/lib/supabase/server';

export type FriendListItem = {
  id: string;
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
  friend_status: string;
  followed_at: string | null;
  last_message_at: string | null;
  last_interaction_at: string | null;
  created_at: string;
  real_name: string | null;
  phone: string | null;
  email: string | null;
  customer_status: string | null;
  inquiry_type: string | null;
  interest_category: string | null;
  tag_count: number;
};

export type FriendDetail = FriendListItem & {
  status_message: string | null;
  language: string | null;
  profile: {
    kana: string | null;
    birth_date: string | null;
    gender: string | null;
    postal_code: string | null;
    address: string | null;
    source: string | null;
    assigned_staff_id: string | null;
    preferred_contact_method: string | null;
    memo_summary: string | null;
    owned_vehicle: string | null;
    vehicle_inspection_expiry_date: string | null;
    desired_vehicle: string | null;
    preferred_visit_date: string | null;
    last_contact_note: string | null;
    next_follow_up_at: string | null;
  };
};

export type FriendNote = {
  id: string;
  body: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type FriendTag = {
  id: string;
  name: string;
  color: string | null;
  description?: string | null;
};

export type FriendsListResult = {
  friends: FriendListItem[];
  error: string | null;
  warning: string | null;
};

type RawFriend = {
  id: string;
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
  status_message: string | null;
  language: string | null;
  friend_status: string;
  followed_at: string | null;
  last_message_at: string | null;
  last_interaction_at: string | null;
  created_at: string;
};

type RawProfile = {
  line_friend_id: string;
  real_name: string | null;
  kana: string | null;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  gender: string | null;
  postal_code: string | null;
  address: string | null;
  customer_status: string | null;
  source: string | null;
  assigned_staff_id: string | null;
  preferred_contact_method: string | null;
  interest_category: string | null;
  memo_summary: string | null;
  owned_vehicle: string | null;
  vehicle_inspection_expiry_date: string | null;
  desired_vehicle: string | null;
  inquiry_type: string | null;
  preferred_visit_date: string | null;
  last_contact_note: string | null;
  next_follow_up_at: string | null;
};

function isDevelopment() {
  return process.env.NODE_ENV !== 'production';
}

function safeErrorDetail(error: { code?: string; message?: string } | null | undefined) {
  const code = error?.code ? `${error.code} / ` : '';
  const message = error?.message ?? 'unknown error';
  return `${code}${message}`.slice(0, 220);
}

function fetchError(operation: string, error: { code?: string; message?: string } | null | undefined) {
  if (!isDevelopment()) return '友だち情報を取得できませんでした';
  if (error?.code === '42501') return `${operation}: RLS violation or permission denied (${safeErrorDetail(error)})`;
  return `${operation}: ${safeErrorDetail(error)}`;
}

async function getLineCompanyId() {
  const currentCompany = await getCurrentLLinkCompany();
  return currentCompany?.companyId ?? null;
}

export async function listFriends(filters?: {
  q?: string;
  friendStatus?: string;
  customerStatus?: string;
  inquiryType?: string;
  interestCategory?: string;
}): Promise<FriendsListResult> {
  const supabase = createLLinkServiceClient();
  const companyId = await getLineCompanyId();
  if (!supabase) return { friends: [], error: 'friends fetch failed: service role key missing', warning: null };
  if (!companyId) return { friends: [], error: 'friends fetch failed: company_id が取得できません', warning: null };

  const { data: friendsData, error: friendsError } = await supabase
    .from('ll_line_friends')
    .select('id, line_user_id, display_name, picture_url, friend_status, followed_at, last_message_at, last_interaction_at, created_at')
    .eq('company_id', companyId)
    .order('last_interaction_at', { ascending: false, nullsFirst: false })
    .limit(200);

  if (friendsError) return { friends: [], error: fetchError('friends fetch failed', friendsError), warning: null };

  const friends = (friendsData ?? []) as RawFriend[];
  const ids = friends.map((friend) => friend.id);
  if (ids.length === 0) return { friends: [], error: null, warning: null };

  const { data: profilesData, error: profilesError } = await supabase
    .from('ll_friend_profiles')
    .select('line_friend_id, real_name, phone, email, customer_status, inquiry_type, interest_category')
    .eq('company_id', companyId)
    .in('line_friend_id', ids);

  if (profilesError) return { friends: [], error: fetchError('friend profiles fetch failed', profilesError), warning: null };

  const { data: tagRowsData, error: tagRowsError } = await supabase.from('ll_friend_tags').select('line_friend_id').eq('company_id', companyId).in('line_friend_id', ids);
  const tagWarning = tagRowsError ? fetchError('friend tags fetch failed', tagRowsError) : null;

  const profileMap = new Map((profilesData ?? []).map((profile) => [(profile as RawProfile).line_friend_id, profile as RawProfile]));
  const tagCountMap = new Map<string, number>();
  for (const row of (tagRowsError ? [] : tagRowsData ?? []) as { line_friend_id: string }[]) {
    tagCountMap.set(row.line_friend_id, (tagCountMap.get(row.line_friend_id) ?? 0) + 1);
  }

  const q = filters?.q?.trim().toLowerCase();
  const statusFilter = filters?.friendStatus === 'all' ? '' : filters?.friendStatus;
  const filteredFriends = friends
    .map((friend): FriendListItem => {
      const profile = profileMap.get(friend.id);
      return {
        ...friend,
        real_name: profile?.real_name ?? null,
        phone: profile?.phone ?? null,
        email: profile?.email ?? null,
        customer_status: profile?.customer_status ?? null,
        inquiry_type: profile?.inquiry_type ?? null,
        interest_category: profile?.interest_category ?? null,
        tag_count: tagCountMap.get(friend.id) ?? 0,
      };
    })
    .filter((friend) => {
      if (statusFilter && friend.friend_status !== statusFilter) return false;
      if (filters?.customerStatus && friend.customer_status !== filters.customerStatus) return false;
      if (filters?.inquiryType && friend.inquiry_type !== filters.inquiryType) return false;
      if (filters?.interestCategory && friend.interest_category !== filters.interestCategory) return false;
      if (!q) return true;
      return [friend.display_name, friend.real_name, friend.phone, friend.email, friend.line_user_id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });

  return { friends: filteredFriends, error: null, warning: tagWarning };
}

export async function getFriendDetail(id: string) {
  const supabase = createLLinkServiceClient();
  const companyId = await getLineCompanyId();
  if (!supabase || !companyId) return null;

  const { data: friendData } = await supabase
    .from('ll_line_friends')
    .select('id, line_user_id, display_name, picture_url, status_message, language, friend_status, followed_at, last_message_at, last_interaction_at, created_at')
    .eq('company_id', companyId)
    .eq('id', id)
    .maybeSingle();

  if (!friendData) return null;

  const friend = friendData as RawFriend;
  const { data: profileData } = await supabase
    .from('ll_friend_profiles')
    .select('*')
    .eq('company_id', companyId)
    .eq('line_friend_id', id)
    .maybeSingle();

  const profile = profileData as RawProfile | null;

  return {
    ...friend,
    real_name: profile?.real_name ?? null,
    phone: profile?.phone ?? null,
    email: profile?.email ?? null,
    customer_status: profile?.customer_status ?? null,
    inquiry_type: profile?.inquiry_type ?? null,
    interest_category: profile?.interest_category ?? null,
    tag_count: 0,
    profile: {
      kana: profile?.kana ?? null,
      birth_date: profile?.birth_date ?? null,
      gender: profile?.gender ?? null,
      postal_code: profile?.postal_code ?? null,
      address: profile?.address ?? null,
      source: profile?.source ?? null,
      assigned_staff_id: profile?.assigned_staff_id ?? null,
      preferred_contact_method: profile?.preferred_contact_method ?? null,
      memo_summary: profile?.memo_summary ?? null,
      owned_vehicle: profile?.owned_vehicle ?? null,
      vehicle_inspection_expiry_date: profile?.vehicle_inspection_expiry_date ?? null,
      desired_vehicle: profile?.desired_vehicle ?? null,
      preferred_visit_date: profile?.preferred_visit_date ?? null,
      last_contact_note: profile?.last_contact_note ?? null,
      next_follow_up_at: profile?.next_follow_up_at ?? null,
    },
  } satisfies FriendDetail;
}

export async function listFriendNotes(lineFriendId: string) {
  const supabase = createLLinkServiceClient();
  const companyId = await getLineCompanyId();
  if (!supabase || !companyId) return [];

  const { data } = await supabase
    .from('ll_friend_notes')
    .select('id, body, created_by, created_at, updated_at')
    .eq('company_id', companyId)
    .eq('line_friend_id', lineFriendId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  return (data ?? []) as FriendNote[];
}

export async function listTags() {
  const supabase = createLLinkServiceClient();
  const companyId = await getLineCompanyId();
  if (!supabase || !companyId) return [];

  const { data } = await supabase.from('ll_tags').select('id, name, color, description').eq('company_id', companyId).order('name');
  return (data ?? []) as FriendTag[];
}

export async function listFriendTags(lineFriendId: string) {
  const supabase = createLLinkServiceClient();
  const companyId = await getLineCompanyId();
  if (!supabase || !companyId) return new Set<string>();

  const { data } = await supabase
    .from('ll_friend_tags')
    .select('tag_id')
    .eq('company_id', companyId)
    .eq('line_friend_id', lineFriendId);

  return new Set((data ?? []).map((row) => String((row as { tag_id: string }).tag_id)));
}

export async function listMessageLogs(lineFriendId: string) {
  const supabase = createLLinkServiceClient();
  const companyId = await getLineCompanyId();
  if (!supabase || !companyId) return [];

  const { data } = await supabase
    .from('ll_message_logs')
    .select('id, direction, message_type, message_body, status, sent_at, received_at, created_at')
    .eq('company_id', companyId)
    .eq('line_friend_id', lineFriendId)
    .order('created_at', { ascending: false })
    .limit(20);

  return (data ?? []) as {
    id: string;
    direction: string;
    message_type: string | null;
    message_body: string | null;
    status: string;
    sent_at: string | null;
    received_at: string | null;
    created_at: string;
  }[];
}
