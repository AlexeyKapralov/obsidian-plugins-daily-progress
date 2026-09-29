const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value: string): Date | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  return formatIsoDate(date) === value ? date : null;
}

export function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addDays(value: string, count: number): string {
  const date = parseIsoDate(value);
  if (!date) throw new Error(`Invalid ISO date: ${value}`);
  date.setDate(date.getDate() + count);
  return formatIsoDate(date);
}

export function mondayOf(date: Date): string {
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const distance = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - distance);
  return formatIsoDate(copy);
}

export function isDateInRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end;
}

export function isValidRange(start: string, end: string): boolean {
  return parseIsoDate(start) !== null && parseIsoDate(end) !== null && start <= end;
}

export function daysBetween(start: string, end: string): string[] {
  if (!isValidRange(start, end)) return [];
  const days: string[] = [];
  for (let date = start; date <= end; date = addDays(date, 1)) days.push(date);
  return days;
}

export function countDaysInclusive(start: string, end: string): number {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  if (!startDate || !endDate || start > end) return 0;
  const startUtc = Date.UTC(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endUtc = Date.UTC(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  return Math.floor((endUtc - startUtc) / 86_400_000) + 1;
}
