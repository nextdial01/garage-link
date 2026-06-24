import { expect, test } from '@playwright/test';
import {
  buildStoragePath,
  isPathInStoreScope,
  isSafeStoragePath,
  isValidUuid,
  privateStorageBucket,
} from '../../src/lib/storage/pathsCore';
import { validateUploadFile } from '../../src/lib/storage/validateFileCore';

const tenantA = '11111111-1111-1111-1111-111111111111';
const storeA = '22222222-2222-2222-2222-222222222222';
const tenantB = '33333333-3333-3333-3333-333333333333';
const storeB = '44444444-4444-4444-4444-444444444444';
const vehicleId = '55555555-5555-5555-5555-555555555555';

test.describe('Storage upload security', () => {
  test('保存pathにtenant/storeを含め、ユーザー入力ファイル名を使わない', () => {
    const result = buildStoragePath({
      tenantId: tenantA,
      storeId: storeA,
      purpose: 'company_logo',
      originalFileName: '../../customer-name.png',
    });

    expect(result.path).toMatch(
      new RegExp(`^tenants/${tenantA}/stores/${storeA}/company/logo/[0-9a-f-]+\\.png$`)
    );
    expect(result.path).not.toContain('customer-name');
    expect(result.safeFilename).toMatch(/^[0-9a-f-]+\.png$/);
    expect(privateStorageBucket).toBe('garage-private');
  });

  test('tenant/store配下以外のpathを拒否できる', () => {
    expect(
      isPathInStoreScope({
        path: `tenants/${tenantA}/stores/${storeA}/company/logo/file.png`,
        tenantId: tenantA,
        storeId: storeA,
      })
    ).toBeTruthy();

    expect(
      isPathInStoreScope({
        path: `tenants/${tenantB}/stores/${storeB}/company/logo/file.png`,
        tenantId: tenantA,
        storeId: storeA,
      })
    ).toBeFalsy();
  });

  test('relatedIdにパストラバーサルが入っても安全なpathに正規化される', () => {
    const result = buildStoragePath({
      tenantId: tenantA,
      storeId: storeA,
      purpose: 'vehicle_image',
      originalFileName: 'photo.png',
      relatedType: 'vehicle',
      relatedId: `../../../tenants/${tenantB}/stores/${storeB}/vehicles/X`,
    });

    expect(result.path).not.toContain('..');
    expect(result.path).not.toContain(tenantB);
    expect(result.path).toMatch(
      new RegExp(`^tenants/${tenantA}/stores/${storeA}/vehicles/unassigned/[0-9a-f-]+\\.png$`)
    );
  });

  test('relatedTypeが許可外のときunassignedに落ちる', () => {
    const result = buildStoragePath({
      tenantId: tenantA,
      storeId: storeA,
      purpose: 'vehicle_image',
      originalFileName: 'photo.png',
      relatedType: 'customer',
      relatedId: vehicleId,
    });
    expect(result.path).toContain('vehicles/unassigned');
  });

  test('relatedIdが正しいUUIDのときのみフォルダ分割する', () => {
    const result = buildStoragePath({
      tenantId: tenantA,
      storeId: storeA,
      purpose: 'vehicle_image',
      originalFileName: 'photo.png',
      relatedType: 'vehicle',
      relatedId: vehicleId,
    });
    expect(result.path).toContain(`vehicles/${vehicleId}/`);
  });

  test('isPathInStoreScopeが ".." を含むpathを拒否する', () => {
    expect(
      isPathInStoreScope({
        path: `tenants/${tenantA}/stores/${storeA}/../../tenants/${tenantB}/stores/${storeB}/file.png`,
        tenantId: tenantA,
        storeId: storeA,
      })
    ).toBeFalsy();
  });

  test('isPathInStoreScopeが連続スラッシュ/絶対pathを拒否する', () => {
    expect(
      isPathInStoreScope({
        path: `tenants/${tenantA}/stores/${storeA}//file.png`,
        tenantId: tenantA,
        storeId: storeA,
      })
    ).toBeFalsy();
    expect(
      isPathInStoreScope({
        path: `/tenants/${tenantA}/stores/${storeA}/file.png`,
        tenantId: tenantA,
        storeId: storeA,
      })
    ).toBeFalsy();
  });

  test('isPathInStoreScopeは非UUIDのtenantId/storeIdを拒否する', () => {
    expect(
      isPathInStoreScope({
        path: 'tenants/tenant-a/stores/store-a/file.png',
        tenantId: 'tenant-a',
        storeId: 'store-a',
      })
    ).toBeFalsy();
  });

  test('isSafeStoragePathが各種異常pathを弾く', () => {
    expect(isSafeStoragePath('tenants/a/stores/b/x.png')).toBeTruthy();
    expect(isSafeStoragePath('tenants/a/../b/x.png')).toBeFalsy();
    expect(isSafeStoragePath('tenants/a//x.png')).toBeFalsy();
    expect(isSafeStoragePath('/tenants/a/x.png')).toBeFalsy();
    expect(isSafeStoragePath('tenants\\a\\x.png')).toBeFalsy();
    expect(isSafeStoragePath('tenants/a/\0/x.png')).toBeFalsy();
  });

  test('buildStoragePathが非UUIDのtenantId/storeIdを拒否する', () => {
    expect(() =>
      buildStoragePath({
        tenantId: 'tenant-a',
        storeId: 'store-a',
        purpose: 'company_logo',
        originalFileName: 'logo.png',
      })
    ).toThrow();
  });

  test('isValidUuidの判定', () => {
    expect(isValidUuid(tenantA)).toBeTruthy();
    expect(isValidUuid('not-a-uuid')).toBeFalsy();
    expect(isValidUuid('')).toBeFalsy();
    expect(isValidUuid(null)).toBeFalsy();
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
