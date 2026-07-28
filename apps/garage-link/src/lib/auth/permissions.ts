export type UserRole = 'owner' | 'admin' | 'implementer' | 'staff' | 'viewer' | string;

export type CurrentStoreMember = {
  store_id: string;
  role: UserRole;
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
  const { requireActiveGarageStore } = await import('@/lib/store/garageUiContext');
  const user = await getCurrentUser();
  const context = await requireActiveGarageStore();

  return {
    store_id: context.storeId,
    role: context.role,
    display_name: context.displayName || null,
    email: user.email ?? null,
  };
}

export async function getCurrentStoreId() {
  return (await getCurrentStoreMember()).store_id;
}

export async function getCurrentUserRole() {
  return (await getCurrentStoreMember()).role;
}

export function canManageSettings(role: string | null | undefined) {
  return role === 'owner' || role === 'admin';
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
