import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.describe('mobile maintenance identity contract', () => {
  test('adds only scoped customer and vehicle labels to already authorized maintenance work', async () => {
    const [identity, today, list, detail] = await Promise.all([
      readFile('src/lib/mobile/maintenanceIdentity.ts', 'utf8'),
      readFile('src/app/api/mobile/today/route.ts', 'utf8'),
      readFile('src/app/api/mobile/maintenance/route.ts', 'utf8'),
      readFile('src/app/api/mobile/maintenance/[jobId]/route.ts', 'utf8'),
    ]);
    expect(identity).toContain("select('id, name')");
    expect(identity).toContain("select('id, management_no, maker, model_name')");
    expect(identity).toContain(".eq('store_id', storeId).in('id', customerIds)");
    expect(identity).toContain(".eq('store_id', storeId).in('id', vehicleIds)");
    expect(identity).toContain('customerName:');
    expect(identity).toContain('vehicleLabel:');
    expect(today).toContain('withMaintenanceIdentity(context.service, context.member.storeId');
    expect(list).toContain('withMaintenanceIdentity(context.service, context.member.storeId');
    expect(detail).toContain('withMaintenanceIdentity(context.service, context.member.storeId');
  });
});
