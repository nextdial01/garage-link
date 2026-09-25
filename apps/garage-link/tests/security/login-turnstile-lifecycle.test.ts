import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function harness() {
  const callbacks: Array<Record<string, (value?: string) => void>> = [];
  const removed: string[] = [];
  const stateChanges: unknown[] = [];
  let effect: (() => () => void) | undefined;
  const widget = {
    render: (_target: unknown, options: Record<string, (value?: string) => void>) => {
      callbacks.push(options);
      return `widget-${callbacks.length}`;
    },
    remove: (id: string) => removed.push(id),
  };
  const browser: { turnstile?: typeof widget; onGarageTurnstileLoad?: () => void } = {};
  const code = ts.transpileModule(readFileSync(resolve('src/components/auth/GarageLoginForm.tsx'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports: { GarageLoginForm?: (props: object) => unknown } = {};
  vm.runInNewContext(code, {
    exports, window: browser,
    process: { env: { NEXT_PUBLIC_ENABLE_BOT_PROTECTION: 'true', NEXT_PUBLIC_BOT_PROTECTION_SITE_KEY: 'synthetic-public-site-key' } },
    require: (id: string) => {
      if (id === 'react') return { useState: (value: unknown) => [value, (next: unknown) => stateChanges.push(next)], useEffect: (fn: () => () => void) => { effect = fn; }, useRef: () => ({ current: {} }) };
      if (id === 'react/jsx-runtime') return { jsx: () => null, jsxs: () => null };
      if (id === 'next/navigation') return { useSearchParams: () => ({ get: () => null }) };
      if (id.endsWith('/useHydrated')) return { useHydrated: () => true };
      if (id.endsWith('/releaseQaCallback')) return { releaseQaRunId: () => null };
      if (id.endsWith('/login-error-contract')) return { loginErrorMessage: () => 'safe error' };
      if (['next/link', 'next/script', '@/components/BrandLogo'].includes(id)) return { default: () => null };
      throw new Error(`Unexpected dependency: ${id}`);
    },
  });
  return { browser, widget, callbacks, removed, stateChanges, mount: () => { exports.GarageLoginForm!({}); return effect!(); } };
}

test('loaded Turnstile renders again after client navigation and removes each old widget', () => {
  const h = harness();
  h.browser.turnstile = h.widget;
  const cleanup = h.mount();
  expect(h.callbacks).toHaveLength(1);
  h.browser.onGarageTurnstileLoad!();
  expect(h.callbacks).toHaveLength(1);
  h.callbacks[0].callback('synthetic-token');
  expect(h.stateChanges.at(-1)).toBe('synthetic-token');
  cleanup();
  expect(h.removed).toEqual(['widget-1']);
  const updates = h.stateChanges.length;
  h.callbacks[0].callback('stale-token');
  expect(h.stateChanges).toHaveLength(updates);
  const cleanupAgain = h.mount();
  expect(h.callbacks).toHaveLength(2);
  h.callbacks[1]['expired-callback']();
  expect(h.stateChanges.at(-1)).toBeNull();
  cleanupAgain();
  expect(h.removed).toEqual(['widget-1', 'widget-2']);
});

test('first script load renders once and cleanup does not remove another mounted callback', () => {
  const h = harness();
  const cleanup = h.mount();
  expect(h.callbacks).toHaveLength(0);
  h.browser.turnstile = h.widget;
  h.browser.onGarageTurnstileLoad!();
  expect(h.callbacks).toHaveLength(1);
  const otherCallback = () => {};
  h.browser.onGarageTurnstileLoad = otherCallback;
  cleanup();
  expect(h.browser.onGarageTurnstileLoad).toBe(otherCallback);
});
