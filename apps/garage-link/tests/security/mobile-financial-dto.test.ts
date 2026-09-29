import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('mobile quote reads do not select or serialize source costs', () => {
  const dto = source('src/lib/mobile/dto.ts');
  const quoteItems = dto.match(/MOBILE_QUOTE_ITEM_FIELDS = '([^']+)'/)?.[1] ?? '';
  const quoteProjection = dto.slice(dto.indexOf('export function mobileQuote'), dto.indexOf('export const FORBIDDEN_MOBILE_FINANCIAL_FIELDS'));
  expect(quoteItems).not.toContain('cost_price');
  expect(quoteProjection).not.toMatch(/costPrice|cost_price/);
});

test('mobile invoice and maintenance responses omit internal-only source fields', () => {
  const invoiceDetail = source('src/app/api/mobile/v2/invoices/[id]/route.ts');
  const invoiceList = source('src/app/api/mobile/v2/invoices/route.ts');
  const maintenanceFields = source('src/lib/mobile/v2Resources.ts').split('maintenance: {')[1]?.split('tradeIns: {')[0] ?? '';
  const maintenanceDetail = source('src/app/api/mobile/v2/[resource]/[id]/route.ts');
  for (const responseContract of [invoiceDetail, invoiceList, maintenanceFields, maintenanceDetail]) {
    expect(responseContract).not.toMatch(/(?:select\([^\n]*|fields: [^\n]*)(?:internal_memo|cost_price|work_memo)/);
  }
});

test('document copies accept a source item ID and re-read its cost inside the scoped server source', () => {
  const quoteCopy = source('src/app/api/mobile/quotes/route.ts');
  const invoiceCopy = source('src/app/api/mobile/v2/invoices/route.ts');
  expect(quoteCopy).toContain('item.sourceItemId');
  expect(quoteCopy).toContain(".eq('store_id',context.member.storeId).in('id',maintenanceItemIds)");
  expect(quoteCopy).toContain(".eq('id',sourceId).eq('store_id',context.member.storeId).is('deleted_at',null)");
  expect(quoteCopy).toContain(".eq('quote_id',sourceId).eq('store_id',context.member.storeId)");
  expect(quoteCopy).toContain('trustedSourceItemCost(sourceItemId, trustedSourceItems)');
  expect(quoteCopy).not.toContain('item.costPrice');
  expect(invoiceCopy).toContain('item.sourceItemId');
  expect(invoiceCopy).toContain(".eq('id',body.sourceInvoiceId).eq('store_id',context.member.storeId).is('deleted_at',null)");
  expect(invoiceCopy).toContain(".eq('invoice_id',body.sourceInvoiceId).eq('store_id',context.member.storeId)");
  expect(invoiceCopy).toContain('trustedSourceItemCost(sourceItemId,sourceItems.data ?? [])');
  expect(invoiceCopy).not.toContain('item.costPrice');
});

test('purchase-cost DTOs stay behind the mobile finance-role boundary', () => {
  const inventory = source('src/app/api/mobile/v2/inventory/route.ts');
  const purchaseCreate = source('src/app/api/mobile/v2/purchases/route.ts');
  const purchaseDetail = source('src/app/api/mobile/v2/purchases/[id]/route.ts');
  for (const route of [inventory, purchaseCreate, purchaseDetail]) {
    expect(route).toContain("context.member.role");
    expect(route).toMatch(/owner.*admin.*staff|staff.*admin.*owner/);
  }
});
