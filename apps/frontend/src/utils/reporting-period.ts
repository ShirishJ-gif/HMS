export type ReportingPreset = 'today' | 'yesterday' | 'last_7' | 'this_month' | 'last_month' | 'custom';
export type ReportingSelection = { preset: ReportingPreset; range: { from: string; to: string } };
export const reportingToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

export function reportingRange(preset: ReportingPreset, today = reportingToday()) {
  const addDays = (value: string, days: number) => new Date(Date.parse(`${value}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  if (preset === 'yesterday') return { from: addDays(today, -1), to: addDays(today, -1) };
  if (preset === 'last_7') return { from: addDays(today, -6), to: today };
  if (preset === 'this_month') return { from: `${today.slice(0, 7)}-01`, to: today };
  if (preset === 'last_month') {
    const to = addDays(`${today.slice(0, 7)}-01`, -1);
    return { from: `${to.slice(0, 7)}-01`, to };
  }
  return { from: today, to: today };
}

export function isReportingSelection(value: unknown): value is ReportingSelection {
  if (!value || typeof value !== 'object') return false;
  const selection = value as ReportingSelection;
  if (!['today', 'yesterday', 'last_7', 'this_month', 'last_month', 'custom'].includes(selection.preset)) return false;
  const validDate = (date: unknown): date is string => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  if (!validDate(selection.range?.from) || !validDate(selection.range?.to)) return false;
  const days = (Date.parse(selection.range.to) - Date.parse(selection.range.from)) / 86400000 + 1;
  return days >= 1 && days <= 366;
}
