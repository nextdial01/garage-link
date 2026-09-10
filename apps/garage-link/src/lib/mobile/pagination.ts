export function mobileReadPage(request: Request) {
  const p = new URL(request.url).searchParams;
  const offset = p.get('offset') ?? '0';
  const limit = p.get('limit') ?? '100';
  if (!/^\d+$/.test(offset) || !/^\d+$/.test(limit)) return null;
  const start = Number(offset), size = Number(limit);
  return Number.isSafeInteger(start) && start <= 100000 && size >= 1 && size <= 100
    ? { offset: start, limit: size } : null;
}
export function mobileReadResult<T>(rows: T[], page: {offset: number; limit: number}) {
  return { rows: rows.slice(0, page.limit), nextOffset: rows.length > page.limit ? page.offset + page.limit : null };
}
export const mobileReadHeaders = { 'cache-control': 'private, no-store' };
