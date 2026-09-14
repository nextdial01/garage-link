import { NextResponse } from 'next/server';
import { getGarageMonitorMetrics, hasValidMonitorBearer } from '@/lib/monitor/garageMetrics';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function noStoreJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      ...init?.headers,
    },
  });
}

export async function GET(request: Request) {
  if (!hasValidMonitorBearer(request, 'GARAGE_LINK_MONITOR_TOKEN')) {
    return noStoreJson({ error: 'unauthorized' }, { status: 401 });
  }

  const metrics = await getGarageMonitorMetrics();
  return noStoreJson(metrics, { status: metrics.sourceStatus === 'error' ? 503 : 200 });
}
