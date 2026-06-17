export const dangerousCsvValues = [
  '=HYPERLINK("https://evil.example","click")',
  '+SUM(1,2)',
  '-cmd',
  '@malicious',
  '\t=cmd',
  '\r=cmd',
];

export function createFakeSupabase() {
  const inserts: Array<{ tableName: string; payload: unknown }> = [];

  return {
    inserts,
    client: {
      from(tableName: string) {
        return {
          insert(payload: unknown) {
            inserts.push({ tableName, payload });
            return Promise.resolve({ error: null });
          },
        };
      },
    },
  };
}
