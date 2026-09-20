import * as XLSX from 'xlsx';

export type Cell = string | number | null;
export interface Sheet { name: string; rows: Cell[][]; widths?: number[] }

const safeName = (s: string) => s.replace(/[\[\]:*?/\\]/g, '-').slice(0, 31) || 'Sheet';

/** Builds an .xlsx in the browser and downloads it. Numbers stay numbers so Excel can add them up. */
export function downloadWorkbook(filename: string, sheets: Sheet[]) {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  for (const sh of sheets) {
    let name = safeName(sh.name);
    let k = 2;
    while (used.has(name.toLowerCase())) name = safeName(`${sh.name.slice(0, 27)} ${k++}`);
    used.add(name.toLowerCase());
    const ws = XLSX.utils.aoa_to_sheet(sh.rows.map((r) => r.map((c) => (c === null ? '' : c))));
    if (sh.widths) ws['!cols'] = sh.widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export const num = (v: unknown): number => Number(v ?? 0);
export const today = () => new Date().toLocaleDateString('en-IN');
