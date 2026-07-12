import iconv from "iconv-lite";
import type { JournalEntry } from "./journalEntries";

function toWarekiOrIso(dateIso: string): string {
  // Both 弥生 and freee accept plain yyyy/MM/dd — no need for 和暦 conversion.
  return dateIso.replaceAll("-", "/");
}

function csvField(value: string | number): string {
  const str = String(value);
  if (str === "") return "";
  if (/[",\n]/.test(str)) return `"${str.replaceAll('"', '""')}"`;
  return str;
}

function csvRow(fields: (string | number)[]): string {
  return fields.map(csvField).join(",");
}

function taxCategoryLabel(category: "taxable" | "tax" | "exempt", rate: number | null): string {
  if (category === "tax") return "対象外";
  if (category === "taxable" && rate && rate > 0) {
    return `課税売上${Math.round(rate * 100)}%`;
  }
  return "対象外";
}

/**
 * 弥生会計インポート形式（弥生会計05以降）。freeeもこの25列形式を
 * 「弥生会計形式」としてそのままインポートできるため、freee/弥生の両方に
 * このファイルをそのまま使える。弥生はShift-JIS保存が必須のため、
 * 呼び出し側でこの関数の戻り値をShift-JISへ変換すること（encodeShiftJis参照）。
 */
export function formatYayoiCsv(entries: JournalEntry[]): string {
  const rows: string[] = [];

  for (const entry of entries) {
    const lineCount = 1 + entry.creditLines.length; // debit row + one row per credit line
    const date = toWarekiOrIso(entry.date);

    entry.creditLines.forEach((credit, index) => {
      const isFirst = index === 0;
      const isLast = index === entry.creditLines.length - 1;
      const flag = lineCount === 1 ? "2111" : isFirst ? "2110" : isLast ? "2101" : "2100";

      rows.push(
        csvRow([
          flag, // A 識別フラグ
          "", // B 伝票No.
          "", // C 決算
          date, // D 取引日付
          isFirst ? entry.debitAccount : "", // E 借方勘定科目
          "", // F 借方補助科目
          "", // G 借方部門
          isFirst ? "対象外" : "対象外", // H 借方税区分
          isFirst ? entry.debitAmount : 0, // I 借方金額
          0, // J 借方税金額
          credit.account, // K 貸方勘定科目
          "", // L 貸方補助科目
          "", // M 貸方部門
          taxCategoryLabel(credit.taxCategory, credit.taxRate), // N 貸方税区分
          credit.amount, // O 貸方金額
          0, // P 貸方税金額
          entry.memo, // Q 摘要
          "", // R 番号
          "", // S 期日
          lineCount === 1 ? "0" : "3", // T タイプ（0:仕訳データ、複数行は3:振替伝票データ）
          "", // U 生成元
          "", // V 仕訳メモ
          "0", // W 付箋1
          "0", // X 付箋2
          "no", // Y 調整
        ]),
      );
    });
  }

  // 弥生形式はヘッダー行なし（データのみ）。
  return rows.join("\r\n") + (rows.length > 0 ? "\r\n" : "");
}

/**
 * マネーフォワード クラウド会計の仕訳帳インポート形式。
 * 1行目はラベル行（編集不可のテンプレート見本に合わせたヘッダー）。
 */
export function formatMoneyForwardCsv(entries: JournalEntry[]): string {
  const header = csvRow([
    "取引No",
    "取引日",
    "借方勘定科目",
    "借方補助科目",
    "借方部門",
    "借方取引先",
    "借方税区分",
    "借方インボイス",
    "借方金額(円)",
    "借方税額",
    "貸方勘定科目",
    "貸方補助科目",
    "貸方部門",
    "貸方取引先",
    "貸方税区分",
    "貸方インボイス",
    "貸方金額(円)",
    "貸方税額",
    "摘要",
    "仕訳メモ",
    "タグ",
    "MF仕訳タイプ",
    "決算整理仕訳",
  ]);

  const rows: string[] = [header];

  entries.forEach((entry, entryIndex) => {
    const transactionNo = entryIndex + 1;
    const date = toWarekiOrIso(entry.date);

    entry.creditLines.forEach((credit, index) => {
      const isFirst = index === 0;
      rows.push(
        csvRow([
          transactionNo,
          date,
          isFirst ? entry.debitAccount : "",
          "",
          "",
          "",
          "対象外",
          "",
          isFirst ? entry.debitAmount : 0,
          "",
          credit.account,
          "",
          "",
          "",
          taxCategoryLabel(credit.taxCategory, credit.taxRate),
          "",
          credit.amount,
          "",
          entry.memo,
          "",
          "",
          "",
          "",
        ]),
      );
    });
  });

  return rows.join("\r\n") + "\r\n";
}

export function encodeShiftJis(csvText: string): Buffer {
  return iconv.encode(csvText, "Shift_JIS");
}
