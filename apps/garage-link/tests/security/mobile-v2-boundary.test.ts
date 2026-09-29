import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const api = resolve(process.cwd(), 'src/app/api/mobile/v2');
const source = (path: string) => readFileSync(resolve(api, path), 'utf8');

test('all V2 resource reads and writes pass the existing bearer and store context', () => {
  for (const route of ['[resource]/route.ts', '[resource]/[id]/route.ts', 'inventory/route.ts',
    'purchases/route.ts', 'purchases/[id]/route.ts', 'invoices/route.ts',
    'invoices/[id]/route.ts', 'payments/[invoiceId]/route.ts', 'sales/[dealId]/route.ts',
    'photos/route.ts']) {
    const code = source(route);
    expect(code, route).toContain('getGarageMobileBearerContext(request)');
    expect(code, route).toContain('context.member.storeId');
  }
});

test('write routes refuse viewer and critical transitions use atomic RPCs', () => {
  for (const route of ['[resource]/route.ts', '[resource]/[id]/route.ts', 'purchases/route.ts',
    'purchases/[id]/route.ts', 'invoices/route.ts', 'invoices/[id]/route.ts',
    'payments/[invoiceId]/route.ts', 'sales/[dealId]/route.ts']) {
    expect(source(route), route).toMatch(/viewer|\['owner','admin','staff'\]|authorizedRole/);
  }
  expect(source('sales/[dealId]/route.ts')).toContain("context.service.rpc(fn, args)");
  expect(source('payments/[invoiceId]/route.ts')).toContain("context.service.rpc('record_garage_payment'");
  expect(source('invoices/route.ts')).toContain("context.service.rpc('garage_mobile_invoice_from_quote'");
});

test('client-supplied store ID is never an authority for V2 writes', () => {
  for (const route of ['[resource]/route.ts', '[resource]/[id]/route.ts', 'purchases/route.ts',
    'purchases/[id]/route.ts', 'sales/[dealId]/route.ts']) {
    const code = source(route);
    expect(code, route).not.toMatch(/(?:body|patch)\.store_id/);
  }
});

test('deal label lookups require authenticated store-scoped customer and vehicle reads', () => {
  const v2Detail = source('[resource]/[id]/route.ts');
  expect(v2Detail).toContain('getGarageMobileBearerContext(request)');
  expect(v2Detail).toContain(".eq('store_id', context.member.storeId)");
  expect(v2Detail).not.toContain('createAdminClient');

  const vehicleDetail = readFileSync(resolve(process.cwd(), 'src/app/api/mobile/vehicles/[vehicleId]/route.ts'), 'utf8');
  expect(vehicleDetail).toContain('getGarageMobileBearerContext(request)');
  expect(vehicleDetail).toContain(".eq('store_id', context.member.storeId)");
  expect(vehicleDetail).not.toContain('createAdminClient');
});

test('photo category writes verify the related row in the authenticated store', () => {
  const upload = readFileSync(resolve(process.cwd(), 'src/app/api/storage/upload/route.ts'), 'utf8');
  expect(upload).toContain(".eq('store_id', context.member.storeId)");
  expect(upload).toContain("code: 'forbidden_related_resource'");
  expect(upload).toContain('photo_category: photoCategory');
  expect(source('photos/route.ts')).toContain(".eq('related_id', id)");
});
