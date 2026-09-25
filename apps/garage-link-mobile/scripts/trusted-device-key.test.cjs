const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const calls = [];
let storedToken = 'a'.repeat(64);
const secureStore = {
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
  getItemAsync: async (key) => { calls.push(['get', key]); return storedToken; },
  setItemAsync: async (key, value, options) => { calls.push(['set', key, value, options]); storedToken = value; },
  deleteItemAsync: async (key) => { calls.push(['delete', key]); storedToken = null; },
};
const exported = {};
const context = { exports: exported, require: (name) => name === 'expo-secure-store' ? secureStore : {} };

vm.runInNewContext(
  ts.transpileModule(fs.readFileSync('src/trustedDevice.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText,
  context,
);

(async () => {
  assert.equal(await exported.getTrustedDeviceToken(), 'a'.repeat(64));
  await exported.saveTrustedDeviceToken('b'.repeat(64));
  await exported.clearTrustedDeviceToken();
  assert.equal(storedToken, null);
  const keys = calls.map((call) => call[1]);
  assert.deepEqual(keys, Array(4).fill('garage-link.trusted-device-token'));
  assert.ok(keys.every((key) => /^[A-Za-z0-9._-]+$/.test(key)));
  assert.equal(calls[1][3].keychainAccessible, 'device-only');
  console.log('GARAGE_TRUSTED_DEVICE_KEY=PASS');
})().catch(() => {
  console.error('GARAGE_TRUSTED_DEVICE_KEY=FAIL');
  process.exitCode = 1;
});
