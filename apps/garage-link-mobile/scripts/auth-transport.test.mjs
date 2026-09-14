import assert from 'node:assert/strict';
import { AuthRequestTimeoutError, createAuthFetch } from '../src/authTransport.ts';

let receivedSignal;
const response = new Response(null, { status: 204 });
const immediate = createAuthFetch(async (_input, init) => {
  receivedSignal = init?.signal;
  return response;
}, 50);
assert.equal(await immediate('https://auth.example.invalid/token'), response, 'auth fetch delegates the request');
assert.equal(receivedSignal?.aborted, false, 'auth fetch supplies a live abort signal');

const never = createAuthFetch(() => new Promise(() => {}), 0);
await assert.rejects(() => never('https://auth.example.invalid/token'), AuthRequestTimeoutError, 'an unresolved auth fetch must fail instead of leaving the login UI pending');

const upstream = new AbortController();
const parentAbort = createAuthFetch((_input, init) => new Promise((_, reject) => {
  init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
}), 1_000);
const pending = parentAbort('https://auth.example.invalid/token', { signal: upstream.signal });
upstream.abort(new Error('cancelled'));
await assert.rejects(pending, /cancelled/, 'an upstream cancellation must still be honoured');

console.log('GARAGE_AUTH_TRANSPORT=PASS');
