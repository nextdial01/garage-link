import assert from 'node:assert/strict';
import { localSignOutScope, sessionAfterAuthEvent, shouldRefreshForAppState } from '../src/authLifecycle.ts';

const persisted = { access_token: 'test-session' };
const refreshed = sessionAfterAuthEvent(persisted, 'TOKEN_REFRESHED', { access_token: 'refreshed' });

assert.equal(sessionAfterAuthEvent(null, 'INITIAL_SESSION', persisted), persisted, 'persisted session survives cold launch');
assert.equal(refreshed?.access_token, 'refreshed', 'refresh replaces session');
assert.equal(sessionAfterAuthEvent(persisted, 'TOKEN_REFRESH_FAILED', null), persisted, 'transient refresh failure preserves session');
assert.equal(sessionAfterAuthEvent(persisted, 'SIGNED_OUT', null), null, 'signed out clears session');
assert.deepEqual(localSignOutScope, { scope: 'local' }, 'manual logout is device-local');
assert.equal(shouldRefreshForAppState('active'), true, 'foreground restarts refresh');
assert.equal(shouldRefreshForAppState('background'), false, 'background stops refresh');

console.log('GARAGE_AUTH_LIFECYCLE=PASS');
