export type UserRole = 'owner' | 'admin' | 'implementer' | 'staff' | 'viewer' | string;

export type CurrentStoreMember = {
  store_id: string;
  role: UserRole;
  display_name: string | null;
  email: string | null;
};

type StoreMemberRow = {
  store_id: string;
  role: string | null;
  display_name: string | null;
  email: string | null;
};

export const roleLabels: Record<string, string> = {
  owner: 'オーナー',
  admin: '管理者',
  implementer: '構築担当者',
  staff: 'スタッフ',
  viewer: '閲覧のみ',
};

export function getRoleLabel(role: string | null | undefined) {
  return role ? roleLabels[role] ?? role : '未設定';
}

export async function getCurrentUser() {
  const { createClient } = await import('@/lib/supabase/client');
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error('ログイン情報を取得できませんでした。');
  }
  return data.user;
}

export async function getCurrentStoreMember(): Promise<CurrentStoreMember> {
  const { createClient } = await import('@/lib/supabase/client');
  const supabase = createClient();
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from<StoreMemberRow>('store_members')
    .select('store_id, role, display_name, email')
    .eq('user_id', user.id)
    .single();

  if (error || !data?.store_id) {
    throw new Error('所属店舗を取得できませんでした。');
  }

  return {
    store_id: data.store_id,
    role: data.role ?? 'viewer',
    display_name: data.display_name,
    email: data.email ?? user.email ?? null,
  };
}

export async function getCurrentStoreId() {
  return (await getCurrentStoreMember()).store_id;
}

export async function getCurrentUserRole() {
  return (await getCurrentStoreMember()).role;
}

export function canManageSettings(role: string | null | undefined) {
  return role === 'owner' || role === 'admin' || role === 'implementer';
}

export function canManageMembers(role: string | null | undefined) {
  return role === 'owner' || role === 'admin';
}

export function canImportExportSettings(role: string | null | undefined) {
  return role === 'owner' || role === 'admin' || role === 'implementer';
}

export function canManageLineSettings(role: string | null | undefined) {
  return role === 'owner' || role === 'admin' || role === 'implementer';
}

export function canEditLineContent(role: string | null | undefined) {
  return role === 'owner' || role === 'admin' || role === 'implementer';
}

export function canEditVehicleData(role: string | null | undefined) {
  return role === 'owner' || role === 'admin' || role === 'staff';
}

export function canViewOnly(role: string | null | undefined) {
  return role === 'viewer';
}

export function canSendLine(role: string | null | undefined) {
  return role === 'owner' || role === 'admin';
}
