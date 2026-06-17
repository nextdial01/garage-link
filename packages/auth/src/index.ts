export type SharedRole = 'owner' | 'admin' | 'implementer' | 'staff' | 'viewer';
export type LLinkRole = 'owner' | 'admin' | 'staff' | 'viewer';

export function canManageBilling(role: string | null | undefined) {
  return role === 'owner' || role === 'admin';
}

export function canManageMembers(role: string | null | undefined) {
  return role === 'owner' || role === 'admin';
}

export function canEditLLinkFriendData(role: string | null | undefined) {
  return role === 'owner' || role === 'admin' || role === 'staff';
}

export function canManageLLinkSettings(role: string | null | undefined) {
  return role === 'owner' || role === 'admin';
}

export function canViewOnly(role: string | null | undefined) {
  return role === 'viewer';
}
