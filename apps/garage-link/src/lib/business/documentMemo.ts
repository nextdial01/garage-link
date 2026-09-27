const structuredMemoLabels = ['支払方法内訳', '下取り情報'] as const;

function structuredLine(line: string) {
  for (const label of structuredMemoLabels) {
    const prefix = `${label}:`;
    if (!line.startsWith(prefix)) continue;

    try {
      JSON.parse(line.slice(prefix.length).trim());
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

function memoLines(value: string | null | undefined) {
  return (value ?? '').split(/\r?\n/);
}

export function humanDocumentMemo(value: string | null | undefined) {
  return memoLines(value).filter((line) => !structuredLine(line)).join('\n');
}

export function mergeDocumentMemo(humanMemo: string, sourceMemo: string | null | undefined) {
  const humanText = humanMemo.trim();
  const structuredLines = memoLines(sourceMemo).filter(structuredLine);
  const lines = [humanText, ...structuredLines].filter(Boolean);
  return lines.length > 0 ? lines.join('\n') : null;
}
