/** Filters only records already loaded; callers keep server pagination available. */
export function normalizeSearch(value: string): string {
 return value.normalize("NFKD").replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0)-1632)).toLocaleLowerCase().trim();
}
export function filterRecords<T>(rows: readonly T[], query: string, status: string, text: (row:T)=>string, state: (row:T)=>string): T[] {
 const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
 return rows.filter(row => (!status || state(row) === status) && words.every(word => normalizeSearch(text(row)).includes(word)));
}
