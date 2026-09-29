import { expect, test } from '@playwright/test';
import { POST as webRequest } from '../../src/app/api/auth/admin-email-otp/request/route';
import { POST as webVerify } from '../../src/app/api/auth/admin-email-otp/verify/route';
import { POST as mobileRequest } from '../../src/app/api/mobile/admin-email-otp/request/route';
import { POST as mobileVerify } from '../../src/app/api/mobile/admin-email-otp/verify/route';

for (const [name, handler] of Object.entries({ webRequest, webVerify, mobileRequest, mobileVerify })) {
  test(`${name} is retired without network access or session issuance`, async () => {
    const original = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => { calls++; throw new Error('External access prohibited'); };
    try {
      const response = await handler();
      expect(response.status).toBe(410);
      expect(await response.json()).toEqual({ code: 'ROUTINE_EMAIL_OTP_RETIRED' });
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.headers.get('set-cookie')).toBeNull();
      expect(calls).toBe(0);
    } finally { globalThis.fetch = original; }
  });
}
