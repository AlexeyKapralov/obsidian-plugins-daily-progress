export const DAY_STATUSES = ["done", "missed", "skipped"] as const;

export type DayStatus = (typeof DAY_STATUSES)[number];

export interface DailyAction {
  id: string;
  name: string;
  start: string;
  end: string;
}

export interface DailyEntry {
  actionId: string;
  date: string;
  status: DayStatus;
}

export interface ProgressData {
  actions: DailyAction[];
  entries: DailyEntry[];
}

export interface PanelConfig {
  dataPath: string;
  weekStart: string;
}

export const DEFAULT_DATA_PATH = "Daily Progress Data.md";

export function isDayStatus(value: string): value is DayStatus {
  return DAY_STATUSES.includes(value as DayStatus);
}
