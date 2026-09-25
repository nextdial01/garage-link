import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

const trustedDeviceSource = readFileSync(new URL('../src/trustedDevice.ts', import.meta.url), 'utf8');
const mobileApiSource = readFileSync(new URL('../src/mobileApi.ts', import.meta.url), 'utf8');
const syntheticToken = 'a'.repeat(64);

function loadCommonJs(source, imports, globals = {}) {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports,
    require(name) {
      assert.ok(imports[name], `unexpected import: ${name}`);
      return imports[name];
    },
    ...globals,
  });
  return exports;
}

function createRuntime() {
  const storage = new Map();
  let readError = false;
  let writeError = false;
  let deleteError = false;
  let readOverride;
  let clearReadErrorOnVerify = false;
  const requests = [];
  const secureStore = {
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 99,
    async getItemAsync(key) {
      if (readError) throw new Error('synthetic secure read failure');
      if (readOverride !== undefined) return readOverride;
      return storage.get(key) ?? null;
    },
    async setItemAsync(key, value) {
      if (writeError) throw new Error('synthetic secure write failure');
      storage.set(key, value);
    },
    async deleteItemAsync(key) {
      if (deleteError) throw new Error('synthetic secure delete failure');
      storage.delete(key);
    },
  };
  const trustedDevice = loadCommonJs(trustedDeviceSource, { 'expo-secure-store': secureStore });
  const supabase = { auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic-access-token' } } }) } };
  const mobileApi = loadCommonJs(mobileApiSource, {
    './supabase': { supabase },
    'react-native': { Platform: { OS: 'ios' } },
    './apiOrigin': loadCommonJs(readFileSync(new URL('../src/apiOrigin.ts', import.meta.url), 'utf8'), {}, {URL, __DEV__: false}),
    './trustedDevice': trustedDevice,
  }, {
    AbortController,
    clearTimeout,
    fetch: async (url, init = {}) => {
      const path = new URL(url).pathname;
      const headers = new Headers(init.headers);
      requests.push({ path, trustedHeaderPresent: headers.has('x-garage-trusted-device-token') });
      if (path.endsWith('/admin-email-otp/verify') && clearReadErrorOnVerify) readError = false;
      if (path.endsWith('/admin-email-otp/request'))
        return Response.json({ ok: true, maskedEmail: 'ow***@example.test', retryAfter: 60 });
      if (path.endsWith('/admin-email-otp/verify'))
        return Response.json({ ok: true, trustedDeviceToken: syntheticToken });
      if (path === '/api/mobile/stores') return Response.json({ ok: true, stores: [] });
      return Response.json({ ok: false, code: 'unexpected_route' }, { status: 404 });
    },
    process: { env: { EXPO_PUBLIC_APP_BASE_URL: 'https://garage.test' } },
    setTimeout,
  });
  return {
    api: mobileApi.mobileApi,
    trustedDevice,
    requests,
    storage,
    failRead(value) { readError = value; },
    failWrite(value) { writeError = value; },
    failDelete(value) { deleteError = value; },
    overrideRead(value) { readOverride = value; },
    recoverReadOnVerify(value) { clearReadErrorOnVerify = value; },
  };
}

test('save writes to device-only SecureStore and reads the exact value back', async () => {
  const runtime = createRuntime();
  await runtime.trustedDevice.saveTrustedDeviceToken(syntheticToken);
  assert.equal(runtime.storage.get('garage-link.trusted-device-token'), syntheticToken);
  assert.equal(await runtime.trustedDevice.getTrustedDeviceToken(), syntheticToken);
});

test('silent write loss and SecureStore write errors are explicit failures', async () => {
  const runtime = createRuntime();
  runtime.failWrite(true);
  await assert.rejects(runtime.trustedDevice.saveTrustedDeviceToken(syntheticToken), (error) => error?.code === 'trusted_device_save_failed');
});

test('read-back mismatch and read-back exceptions are distinguished', async () => {
  const mismatch = createRuntime();
  mismatch.overrideRead('b'.repeat(64));
  await assert.rejects(mismatch.trustedDevice.saveTrustedDeviceToken(syntheticToken), (error) => error?.code === 'trusted_device_readback_failed');

  const readFailure = createRuntime();
  readFailure.failRead(true);
  await assert.rejects(readFailure.trustedDevice.saveTrustedDeviceToken(syntheticToken), (error) => error?.code === 'trusted_device_readback_failed');
});

test('SecureStore read and malformed-token failures are not converted to a missing token', async () => {
  const readFailure = createRuntime();
  readFailure.failRead(true);
  await assert.rejects(readFailure.trustedDevice.getTrustedDeviceToken(), (error) => error?.code === 'trusted_device_read_failed');

  const malformed = createRuntime();
  malformed.overrideRead('not-a-token');
  await assert.rejects(malformed.trustedDevice.getTrustedDeviceToken(), (error) => error?.code === 'trusted_device_token_invalid');
});

test('ordinary API requests ignore retired trusted-device storage failures', async () => {
  const runtime = createRuntime();
  runtime.failRead(true);
  await runtime.api.stores();
  assert.equal(runtime.requests.length, 1);
  assert.equal(runtime.requests[0].trustedHeaderPresent, false);
  assert.equal(runtime.api.requestAdminEmailOtp, undefined);
  assert.equal(runtime.api.verifyAdminEmailOtp, undefined);
});

test('trusted-token deletion failure is explicit and does not claim logout cleanup succeeded', async () => {
  const runtime = createRuntime();
  await runtime.trustedDevice.saveTrustedDeviceToken(syntheticToken);
  runtime.failDelete(true);
  await assert.rejects(runtime.trustedDevice.clearTrustedDeviceToken(), (error) => error?.code === 'trusted_device_clear_failed');
  assert.equal(runtime.storage.has('garage-link.trusted-device-token'), true);
});
