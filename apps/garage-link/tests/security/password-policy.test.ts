import { expect, test } from '@playwright/test';
import { hasMinimumPasswordLength, MIN_PASSWORD_LENGTH } from '../../src/lib/auth/password-policy';
import { translateAuthError } from '../../src/lib/auth/auth-errors';

test('password policy rejects six and seven characters and accepts eight', () => {
  expect(MIN_PASSWORD_LENGTH).toBe(8);
  expect(hasMinimumPasswordLength('123456')).toBe(false);
  expect(hasMinimumPasswordLength('1234567')).toBe(false);
  expect(hasMinimumPasswordLength('12345678')).toBe(true);
  expect(translateAuthError('Password should be at least 6 characters')).toBe('パスワードは8文字以上で入力してください。');
  expect(translateAuthError('Password should be at least 8 characters')).toBe('パスワードは8文字以上で入力してください。');
});
