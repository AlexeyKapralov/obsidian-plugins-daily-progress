import { addDays, countDaysInclusive, isDateInRange } from "./dates";
import type { DailyAction, DailyEntry, DayStatus } from "./model";

export interface ActionMetrics {
  completedDays: number;
  skippedDays: number;
  totalDays: number;
  planPercentage: number;
  elapsedEligibleDays: number;
  elapsedPercentage: number;
  streak: number;
}

export function entryKey(actionId: string, date: string): string {
  return `${actionId}\u0000${date}`;
}

export function entryMap(entries: DailyEntry[]): Map<string, DayStatus> {
  return new Map(entries.map((entry) => [entryKey(entry.actionId, entry.date), entry.status]));
}

export function statusFor(entries: Map<string, DayStatus>, actionId: string, date: string): DayStatus | null {
  return entries.get(entryKey(actionId, date)) ?? null;
}

export function calculateMetrics(
  action: DailyAction,
  entries: Map<string, DayStatus>,
  today: string
): ActionMetrics {
  const totalDays = countDaysInclusive(action.start, action.end);
  const lastElapsed = action.end < today ? action.end : today;
  if (lastElapsed < action.start) {
    return {
      completedDays: 0,
      skippedDays: 0,
      totalDays,
      planPercentage: 0,
      elapsedEligibleDays: 0,
      elapsedPercentage: 0,
      streak: 0
    };
  }

  let completedDays = 0;
  let skippedDays = 0;
  for (let date = action.start; date <= lastElapsed; date = addDays(date, 1)) {
    const status = statusFor(entries, action.id, date);
    if (status === "done") completedDays += 1;
    if (status === "skipped") skippedDays += 1;
  }

  const elapsedDays = countDaysInclusive(action.start, lastElapsed);
  const elapsedEligibleDays = elapsedDays - skippedDays;

  let streak = 0;
  for (let date = lastElapsed; isDateInRange(date, action.start, action.end); date = addDays(date, -1)) {
    const status = statusFor(entries, action.id, date);
    if (status === "skipped") continue;
    if (status !== "done") break;
    streak += 1;
  }

  return {
    completedDays,
    skippedDays,
    totalDays,
    planPercentage: totalDays === 0 ? 0 : Math.round(((completedDays + skippedDays) / totalDays) * 100),
    elapsedEligibleDays,
    elapsedPercentage: elapsedEligibleDays === 0 ? 0 : Math.round((completedDays / elapsedEligibleDays) * 100),
    streak
  };
}

export function calculateOverall(actions: DailyAction[], entries: Map<string, DayStatus>, today: string): ActionMetrics {
  const totals = actions.reduce(
    (sum, action) => {
      const metric = calculateMetrics(action, entries, today);
      return {
        completedDays: sum.completedDays + metric.completedDays,
        totalDays: sum.totalDays + metric.totalDays,
        elapsedEligibleDays: sum.elapsedEligibleDays + metric.elapsedEligibleDays,
        skippedDays: sum.skippedDays + metric.skippedDays
      };
    },
    { completedDays: 0, totalDays: 0, elapsedEligibleDays: 0, skippedDays: 0 }
  );
  return {
    completedDays: totals.completedDays,
    skippedDays: totals.skippedDays,
    totalDays: totals.totalDays,
    planPercentage: totals.totalDays === 0
      ? 0
      : Math.round(((totals.completedDays + totals.skippedDays) / totals.totalDays) * 100),
    elapsedEligibleDays: totals.elapsedEligibleDays,
    elapsedPercentage: totals.elapsedEligibleDays === 0
      ? 0
      : Math.round((totals.completedDays / totals.elapsedEligibleDays) * 100),
    streak: 0
  };
}
