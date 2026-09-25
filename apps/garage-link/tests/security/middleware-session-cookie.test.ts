import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { NextRequest, NextResponse } from 'next/server';
const source = fs.readFileSync('src/middleware.ts', 'utf8');
async function execute(route: string, postAuth: string, contract: string) {
  const exported = {} as { middleware: (request: NextRequest) => Promise<NextResponse> };
  const fakeRequire = (name: string) => {
    if (name === 'next/server') return {NextRequest, NextResponse};
    if (name === '@supabase/ssr') return {createServerClient: (_u: string, _k: string, {cookies}: {cookies: {setAll: (values: unknown[]) => void}}) => ({auth: {
      getUser: async () => {cookies.setAll([{name:'sb-synthetic-auth-token',value:'refreshed-synthetic',options:{path:'/',httpOnly:true,sameSite:'lax'}}]); return {data:{user:{id:'synthetic-user'}},error:null};},
      getClaims: async () => ({data:{claims:{session_id:'synthetic-session'}}})
    }, rpc: async () => ({data:{state:contract}})})};
    if (name === '@supabase/supabase-js') return {createClient: () => ({rpc: async () => ({data:{role:'staff'},error:null})})};
    if (name.endsWith('/post-auth-redirect')) return {resolvePostAuthPath: async () => { if (postAuth === 'ERROR') throw new Error('synthetic outage'); return postAuth; }};
    if (name.endsWith('/stale-session-recovery')) return {getSupabaseAuthCookieNames: () => [],isRecoverableStaleSessionError: () => false};
    if (name.endsWith('/adminEmailOtp')) return {hasEffectiveAdminRole: () => false};
    if (name.endsWith('/contractAccess')) return {isBillingRecoveryAllowedPath: () => false, parseContractAccess:(x: unknown)=>x, resolveEffectiveContractAccess:(x: unknown)=>x};
    throw new Error('unexpected dependency '+name);
  };
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:exported,require:fakeRequire,URL,process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://synthetic.invalid',NEXT_PUBLIC_SUPABASE_ANON_KEY:'synthetic',SUPABASE_SERVICE_ROLE_KEY:'synthetic'}}});
  const response = await exported.middleware(new NextRequest('https://app.invalid'+route));
  return {route,postAuth,contract,status:response.status,location:response.headers.get('location'),refreshCookiePreserved:response.cookies.get('sb-synthetic-auth-token')?.value==='refreshed-synthetic'};
}

for (const [route, target, state] of [
  ['/dashboard','/dashboard','active'], ['/login','/dashboard','active'],
  ['/onboarding','/dashboard','active'], ['/dashboard','/onboarding','active'],
  ['/api/customers','/onboarding','active'], ['/dashboard','/dashboard','restricted'],
  ['/api/customers','/dashboard','restricted'], ['/dashboard','/dashboard','cancelled_retention'],
]) {
  test(`refresh cookie survives ${route} to ${target} with ${state}`, async () => {
    const result = await execute(route, target, state);
    expect(result.refreshCookiePreserved).toBe(true);
    expect(result.location ?? '').not.toContain('/security/email-otp');
    if (route.startsWith('/api/')) expect(result.status).toBe(state === 'restricted' ? 402 : 403);
  });
}

test('store outage keeps refreshed session and cannot redirect into signup', async () => {
  const result = await execute('/dashboard', 'ERROR', 'active');
  expect(result.status).toBe(503);
  expect(result.location).toBeNull();
  expect(result.refreshCookiePreserved).toBe(true);
});
for (const path of ['/auth/callback', '/auth/reset-password', '/forgot-password', '/api/auth/password-login']) {
  test(`store outage cannot block public recovery ${path}`, async () => {
    const result = await execute(path, 'ERROR', 'active');
    expect(result.status).toBe(200);
    expect(result.refreshCookiePreserved).toBe(true);
  });
}
