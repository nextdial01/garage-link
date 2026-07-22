import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

test('context help renders outside shell stacking contexts', () => {
  const source = readFileSync(join(root, 'src/components/ContextHelp.tsx'), 'utf8');

  expect(source).toContain("import { createPortal } from 'react-dom'");
  expect(source).toContain('createPortal(');
  expect(source).toContain('document.body');
});

test('app shell and dashboard cards cannot widen the viewport', () => {
  const shell = readFileSync(join(root, 'src/components/AppShell.tsx'), 'utf8');
  const dashboard = readFileSync(join(root, 'src/app/dashboard/page.tsx'), 'utf8');

  expect(shell).toContain('w-full max-w-full overflow-x-hidden');
  expect(shell).toContain('min-w-0 w-full flex-1');
  expect(shell).toContain('mx-auto w-full min-w-0 max-w-[1440px]');
  expect(dashboard).toContain('grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-5');
  expect(dashboard).toContain('min-w-0 overflow-hidden rounded-2xl');
});
