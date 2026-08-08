'use client';


import { toUserErrorMessage } from '@/lib/errors/user-error';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { logAudit } from '@/lib/audit/logAudit';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  async function handleSoftDelete() {
    if (!storeId || !rowId) {
      return;
    }

    try {
      setIsDeleting(true);
      setErrorMessage('');
      const supabase = createClient();
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user?.id) {
        throw new Error('ログイン情報を取得できませんでした。');
      }

      const { data: member } = await supabase
        .from<StoreMemberRow>('memberships')
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
      setErrorMessage(toUserErrorMessage(error, '削除に失敗しました。時間をおいて再試行してください。'));
      setConfirmOpen(false);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setConfirmOpen(true)} disabled={isDeleting || !storeId} className={className}>
        {isDeleting ? '削除中...' : label}
      </button>
      {errorMessage && <p role="alert" className="mt-2 text-sm font-bold text-red-700">{errorMessage}</p>}
      <ConfirmDialog
        open={confirmOpen}
        title={`${targetLabel}を削除しますか？`}
        description="削除すると一覧から非表示になります。データは完全削除されず、ゴミ箱 / アーカイブから復元できます。"
        confirmLabel="一覧から削除する"
        busy={isDeleting}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void handleSoftDelete()}
      />
    </>
  );
}
