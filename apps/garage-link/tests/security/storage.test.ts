import { expect, test } from '@playwright/test';
import { buildStoragePath, isPathInStoreScope, privateStorageBucket } from '../../src/lib/storage/pathsCore';
import { validateUploadFile } from '../../src/lib/storage/validateFileCore';

test.describe('Storage upload security', () => {
  test('保存pathにtenant/storeを含め、ユーザー入力ファイル名を使わない', () => {
    const result = buildStoragePath({
      tenantId: 'tenant-a',
      storeId: 'store-a',
      purpose: 'company_logo',
      originalFileName: '../../customer-name.png',
    });

    expect(result.path).toMatch(/^tenants\/tenant-a\/stores\/store-a\/company\/logo\/[0-9a-f-]+\.png$/);
    expect(result.path).not.toContain('customer-name');
    expect(result.safeFilename).toMatch(/^[0-9a-f-]+\.png$/);
    expect(privateStorageBucket).toBe('garage-private');
  });

  test('tenant/store配下以外のpathを拒否できる', () => {
    expect(isPathInStoreScope({
      path: 'tenants/tenant-a/stores/store-a/company/logo/file.png',
      tenantId: 'tenant-a',
      storeId: 'store-a',
    })).toBeTruthy();

    expect(isPathInStoreScope({
      path: 'tenants/tenant-b/stores/store-b/company/logo/file.png',
      tenantId: 'tenant-a',
      storeId: 'store-a',
    })).toBeFalsy();
  });

  test('MIME type・拡張子・サイズを検証する', () => {
    const image = new File(['x'], 'logo.png', { type: 'image/png' });
    expect(validateUploadFile({ file: image, purpose: 'company_logo' }).ok).toBeTruthy();

    const invalidExtension = new File(['x'], 'logo.exe', { type: 'image/png' });
    expect(validateUploadFile({ file: invalidExtension, purpose: 'company_logo' })).toMatchObject({
      ok: false,
      reason: 'invalid_extension',
    });

    const invalidMime = new File(['x'], 'logo.png', { type: 'application/x-msdownload' });
    expect(validateUploadFile({ file: invalidMime, purpose: 'company_logo' })).toMatchObject({
      ok: false,
      reason: 'invalid_mime_type',
    });

    const tooLarge = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'logo.png', { type: 'image/png' });
    expect(validateUploadFile({ file: tooLarge, purpose: 'company_logo' })).toMatchObject({
      ok: false,
      reason: 'file_too_large',
    });
  });
});
