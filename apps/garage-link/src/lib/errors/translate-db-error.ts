const DB_ERROR_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /permission denied for table company_subscriptions/i,
    message: '契約情報を読み取れませんでした。しばらくしてから再度お試しください。',
  },
  {
    pattern: /permission denied/i,
    message: 'データベースへのアクセス権限がありません。',
  },
  {
    pattern: /could not find the function/i,
    message: '契約機能の準備が完了していません。管理者にデータベース更新の適用を依頼してください。',
  },
  {
    pattern: /relation .* does not exist/i,
    message: '必要なデータベーステーブルが見つかりません。管理者にお問い合わせください。',
  },
  {
    pattern: /column .* does not exist/i,
    message: '必要なデータ項目が見つかりません。管理者にお問い合わせください。',
  },
  {
    pattern: /JWT expired/i,
    message: 'ログインの有効期限が切れました。再度ログインしてください。',
  },
  {
    pattern: /invalid input syntax for type uuid/i,
    message: '店舗情報の形式が正しくありません。',
  },
  {
    pattern: /inventory_counts_one_active_store_uidx|duplicate key value violates unique constraint.*inventory_count/i,
    message: '棚卸し中の案件が既にあります。一覧から既存の棚卸しを再開してください。',
  },
  {
    pattern: /^最後のownerは降格できません。$/,
    message: '最後のオーナーは降格できません。先に別のメンバーをオーナーへ変更してください。',
  },
  {
    pattern: /^最後のownerは無効化できません。$/,
    message: '最後のオーナーは無効化できません。先に別のメンバーをオーナーへ変更してください。',
  },
  {
    pattern: /^(?:roleを変更|membershipを無効化|自分自身のroleを変更)する権限がありません。$/,
    message: 'このメンバーを変更する権限がありません。操作対象と自分の権限を確認してください。',
  },
];

export function translateDbError(message: string, fallback = '処理に失敗しました。時間をおいて再度お試しください。'): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return '処理に失敗しました。';
  }

  for (const { pattern, message: translated } of DB_ERROR_PATTERNS) {
    if (pattern.test(trimmed)) {
      return translated;
    }
  }

  if (/^[a-z0-9_.\s-]+$/i.test(trimmed) && /[a-z_]{3,}/i.test(trimmed) && !/[\u3040-\u30ff\u4e00-\u9faf]/.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}
