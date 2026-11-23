export const CSV_BOM = '\uFEFF';

export function csvCell(value: unknown): string {
  if (typeof value === 'number') {
    return String(value);
  }
  const str = String(value ?? '');
  const first = str.charAt(0);
  const isDangerous = ['=', '+', '-', '@', '\t', '\r'].includes(first);
  const escaped = str.replace(/"/g, '""');
  if (isDangerous) {
    return `"'${escaped}"`;
  }
  return `"${escaped}"`;
}
