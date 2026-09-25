import { expect, test } from '@playwright/test';
import { resolvePostAuthPath } from '../../src/lib/auth/post-auth-redirect';

function client(state: string, rpcError = false, storeError = false) {
  return {
    rpc: async () => ({ data: { state, store_id: 'synthetic' }, error: rpcError ? {message:'offline'} : null }),
    from: () => ({select: () => ({eq: () => ({maybeSingle: async () => ({data: {onboarding_completed_at:'2026-01-01'}, error: storeError ? {message:'offline'} : null})})})}),
  };
}
test('provider failure is not treated as a new account', async () => {
  await expect(resolvePostAuthPath(client('active', true), 'synthetic')).rejects.toThrow('store_context_unavailable');
  await expect(resolvePostAuthPath(client('active', false, true), 'synthetic')).rejects.toThrow('store_context_unavailable');
});
test('confirmed no access retains signup recovery and active accounts keep normal navigation', async () => {
  expect(await resolvePostAuthPath(client('no_access'), 'synthetic')).toBe('/signup?resume=1');
  expect(await resolvePostAuthPath(client('active'), 'synthetic', {nextPath:'/vehicles'})).toBe('/vehicles');
  expect(await resolvePostAuthPath(client('active'), 'synthetic', {nextPath:'/\\evil.example'})).toBe('/dashboard');
  expect(await resolvePostAuthPath(client('active'), 'synthetic', {nextPath:'/login?next=/login'})).toBe('/dashboard');
});
