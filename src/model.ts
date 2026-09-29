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
  reason?: MissedReason;
  comment?: string;
}

export const MISSED_REASONS = [
  "no-time",
  "forgot",
  "health",
  "workload",
  "priorities",
  "dependency",
  "intentional",
  "other"
] as const;

export type MissedReason = (typeof MISSED_REASONS)[number];

export const MISSED_REASON_LABELS: Record<MissedReason, string> = {
  "no-time": "Не хватило времени",
  forgot: "Забыл",
  health: "Усталость / здоровье",
  workload: "Высокая нагрузка",
  priorities: "Изменились приоритеты",
  dependency: "Зависел от других",
  intentional: "Сознательно не делал",
  other: "Другое"
};

export interface ProgressData {
  actions: DailyAction[];
  entries: DailyEntry[];
}

export interface PanelConfig {
  dataPath: string;
}

export const DEFAULT_DATA_PATH = "Daily Progress Data.md";

export function isDayStatus(value: string): value is DayStatus {
  return DAY_STATUSES.includes(value as DayStatus);
}

export function isMissedReason(value: string): value is MissedReason {
  return MISSED_REASONS.includes(value as MissedReason);
}
