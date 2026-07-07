const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'Invalid login credentials': 'メールアドレスまたはパスワードが正しくありません。',
  'Email not confirmed': 'メールアドレスの確認が完了していません。確認メールをご確認ください。',
  'User already registered': 'このメールアドレスは既に登録されています。ログインしてください。',
  'Password should be at least 6 characters': 'パスワードは6文字以上で入力してください。',
  'Unable to validate email address: invalid format': 'メールアドレスの形式が正しくありません。',
  'Signup requires a valid password': '有効なパスワードを入力してください。',
  '既に店舗が登録されています。': '既に店舗が登録されています。ログインして続行してください。',
  '店舗名を入力してください。': '店舗名を入力してください。',
  'ログインが必要です。': 'ログインが必要です。再度ログインしてください。',
};

const RPC_ERROR_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /create_store_for_current_user/i,
    message:
      '店舗の作成に失敗しました。管理者にお問い合わせいただくか、しばらくしてから再度お試しください。',
  },
  {
    pattern: /function .* does not exist/i,
    message:
      'サインアップ機能の準備が完了していません。管理者にデータベース更新（037_signup_onboarding）の適用を依頼してください。',
  },
];

export function translateAuthError(message: string): string {
  const trimmed = message.trim();
  if (AUTH_ERROR_MESSAGES[trimmed]) {
    return AUTH_ERROR_MESSAGES[trimmed];
  }

  for (const { pattern, message: translated } of RPC_ERROR_PATTERNS) {
    if (pattern.test(trimmed)) {
      return translated;
    }
  }

  return trimmed;
}

export function isEmailConfirmationRequired(message: string): boolean {
  return message.includes('確認メール') || message === AUTH_ERROR_MESSAGES['Email not confirmed'];
}
