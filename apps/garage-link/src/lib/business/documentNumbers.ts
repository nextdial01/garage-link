/** Existing Web numbering contract. Date is UTC; time uses the browser timezone. */
export function createDocumentNo(prefix: string) {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replaceAll('-', '');
  const time = now.toTimeString().slice(0, 8).replaceAll(':', '');
  return `${prefix}-${date}-${time}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
}

export const DOCUMENT_NUMBER_RULE = '日付8桁（UTC）-時刻6桁（端末時刻）-識別子6桁';
