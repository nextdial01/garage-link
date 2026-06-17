'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { logAudit } from '@/lib/audit/logAudit';

type StoreMemberRow = {
  store_id: string;
  role: string | null;
  display_name: string | null;
  email: string | null;
};

type SoftDeleteRow = {
  id: string;
  store_id?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  is_archived?: boolean | null;
};

type SoftDeleteButtonProps = {
  tableName: string;
  rowId: string;
  storeId: string;
  targetType: Parameters<typeof logAudit>[0]['targetType'];
  targetLabel: string;
  redirectHref: string;
  label?: string;
  className?: string;
};

export default function SoftDeleteButton({
  tableName,
  rowId,
  storeId,
  targetType,
  targetLabel,
  redirectHref,
  label = '削除',
  className = 'rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 shadow-sm transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60',
}: SoftDeleteButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleSoftDelete() {
    if (!storeId || !rowId) {
      return;
    }

    const confirmed = window.confirm(`${targetLabel}を削除します。一覧から非表示になり、ゴミ箱 / アーカイブから復元できます。よろしいですか？`);
    if (!confirmed) {
      return;
    }

    try {
      setIsDeleting(true);
      const supabase = createClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user?.id) {
        throw new Error('ログイン情報を取得できませんでした。');
      }

      const { data: member } = await supabase
        .from<StoreMemberRow>('store_members')
        .select('store_id, role, display_name, email')
        .eq('user_id', userData.user.id)
        .single();

      const deletedAt = new Date().toISOString();
      const payload = {
        deleted_at: deletedAt,
        deleted_by: member?.email ?? userData.user.email ?? null,
        is_archived: true,
      };
      const { error } = await supabase
        .from<SoftDeleteRow>(tableName)
        .update(payload)
        .eq('id', rowId)
        .eq('store_id', storeId);

      if (error) {
        throw new Error(error.message);
      }

      await logAudit({
        supabase,
        storeId,
        userId: userData.user.id,
        userEmail: member?.email ?? userData.user.email ?? null,
        userRole: member?.role ?? null,
        userDisplayName: member?.display_name ?? null,
        action: 'delete',
        targetType,
        targetId: rowId,
        targetLabel,
        beforeData: null,
        afterData: payload,
        metadata: { soft_delete: true, table_name: tableName },
      });

      router.push(redirectHref);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '削除に失敗しました。');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <button type="button" onClick={() => void handleSoftDelete()} disabled={isDeleting || !storeId} className={className}>
      {isDeleting ? '削除中...' : label}
    </button>
  );
}
