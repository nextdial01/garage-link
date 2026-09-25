const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const apiOrigin = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/apiOrigin.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:apiOrigin,URL,__DEV__:false});
let response;
let saved = null;
let calls = 0;
let sentToken;
const exported = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/passwordLogin.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}}).outputText, {
  exports: exported,
  process: {env: {EXPO_PUBLIC_APP_BASE_URL: 'https://app.example.invalid'}},
  require(name) {
    if (name === './apiOrigin') return apiOrigin;
    if (name === './supabase') return {supabase: {auth: {setSession: async (s) => {saved = s; return {error: null};}}}};
    if (name === './authTransport') return {authFetch: async (url, options) => {
      calls++;sentToken=JSON.parse(options.body).captchaToken;
      assert.equal(url, 'https://app.example.invalid/api/mobile/password-login');
      assert.equal(options.method, 'POST');
      assert.equal(JSON.parse(options.body).email, 'synthetic@example.invalid');
      return response;
    }};
    throw Error('unexpected import');
  },
});
(async () => {
  response = Response.json({ok: true, session: {access_token: 'synthetic-access', refresh_token: 'synthetic-refresh'}});
  await exported.passwordLogin(' synthetic@example.invalid ', 'synthetic-password');
  assert.equal(saved.access_token, 'synthetic-access');
  assert.equal(calls, 1);assert.equal(sentToken,undefined);
  response = Response.json({ok:true,session:{access_token:'synthetic-access',refresh_token:'synthetic-refresh'}});
  await exported.passwordLogin('synthetic@example.invalid','synthetic-password','synthetic-captcha');
  assert.equal(sentToken,'synthetic-captcha');
  saved = null;
  response = Response.json({code: 'LOGIN_LOCKED'}, {status: 429});
  await assert.rejects(exported.passwordLogin('synthetic@example.invalid', 'synthetic-password'), /30分/);
  assert.equal(saved, null);
  response = Response.json({code: 'BOT_PROTECTION_REQUIRED'}, {status: 401});
  await assert.rejects(exported.passwordLogin('synthetic@example.invalid', 'synthetic-password'), /ボット対策/);
  assert.equal(saved, null);
  response = Response.json({ok: true});
  await assert.rejects(exported.passwordLogin('synthetic@example.invalid', 'synthetic-password'), /ログイン情報/);
  const quality = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/qualityState.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:quality});
  for (const [code,expected] of [['INVALID_CREDENTIALS','メールアドレスまたはパスワード'],['LOGIN_LOCKED','30分後'],['BOT_PROTECTION_REQUIRED','ボット対策'],['LOGIN_SECURITY_CHECK_FAILED','確認処理'],['LOGIN_SESSION_INVALID','ログイン情報'],['LOGIN_SESSION_SAVE_FAILED','保存できません'],['invalid_base_url','接続先']]) {
    const displayed=quality.userFacingError(new exported.MobileLoginError(code,'SYNTHETIC_SECRET_PROVIDER_DETAIL'));
    assert.ok(displayed.includes(expected));assert.ok(!displayed.includes('SYNTHETIC_SECRET'));
  }
  console.log('MOBILE_SHARED_PASSWORD_LOGIN=PASS');
})().catch(() => {console.error('MOBILE_SHARED_PASSWORD_LOGIN=FAIL');process.exitCode=1;});
