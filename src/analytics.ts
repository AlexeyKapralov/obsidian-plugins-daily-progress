import { addDays, countDaysInclusive, daysBetween, mondayOf } from "./dates";
import { entryKey } from "./metrics";
import { MISSED_REASON_LABELS, type DailyAction, type DailyEntry, type DayStatus, type MissedReason } from "./model";

export type AnalyticsPeriod = "30" | "90" | "all";

export interface StatusCounts {
  done: number;
  missed: number;
  skipped: number;
  unmarked: number;
}

export interface AnalyticsSlice extends StatusCounts {
  eligible: number;
  percentage: number;
}

export interface WeeklyAnalytics extends AnalyticsSlice {
  weekStart: string;
}

export interface WeekdayAnalytics extends AnalyticsSlice {
  weekday: number;
}

export interface HeatmapDay extends AnalyticsSlice {
  date: string;
}

export interface ActionAnalytics extends AnalyticsSlice {
  actionId: string;
  name: string;
  currentStreak: number;
  bestStreak: number;
  averageMissInterval: number | null;
}

export interface ProgressAnalytics extends AnalyticsSlice {
  start: string;
  end: string;
  weekly: WeeklyAnalytics[];
  weekdays: WeekdayAnalytics[];
  heatmap: HeatmapDay[];
  actions: ActionAnalytics[];
  reasons: Array<{ reason: MissedReason; label: string; count: number }>;
  observations: string[];
}

function emptyCounts(): StatusCounts {
  return { done: 0, missed: 0, skipped: 0, unmarked: 0 };
}

function addStatus(counts: StatusCounts, status: DayStatus | null): void {
  counts[status ?? "unmarked"] += 1;
}

function finish(value: StatusCounts): AnalyticsSlice {
  const eligible = value.done + value.missed + value.unmarked;
  return { ...value, eligible, percentage: eligible === 0 ? 0 : Math.round((value.done / eligible) * 100) };
}

function startForPeriod(period: AnalyticsPeriod, actions: DailyAction[], today: string): string {
  if (period === "30") return addDays(today, -29);
  if (period === "90") return addDays(today, -89);
  return actions.reduce((earliest, action) => action.start < earliest ? action.start : earliest, today);
}

function streaks(action: DailyAction, statusByDay: Map<string, DayStatus>, start: string, end: string): {
  current: number;
  best: number;
} {
  let run = 0;
  let best = 0;
  for (const date of daysBetween(start > action.start ? start : action.start, end < action.end ? end : action.end)) {
    const status = statusByDay.get(entryKey(action.id, date));
    if (status === "skipped") continue;
    if (status === "done") {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return { current: run, best };
}

export function calculateAnalytics(
  actions: DailyAction[],
  entries: DailyEntry[],
  today: string,
  period: AnalyticsPeriod
): ProgressAnalytics {
  const start = startForPeriod(period, actions, today);
  const actionsById = new Map(actions.map((action) => [action.id, action]));
  const statusByDay = new Map(entries.map((entry) => [entryKey(entry.actionId, entry.date), entry.status]));
  const weekly = new Map<string, StatusCounts>();
  const weekdays = Array.from({ length: 7 }, () => emptyCounts());
  const heatmap = new Map<string, StatusCounts>();
  const total = emptyCounts();
  const actionResults: ActionAnalytics[] = [];

  for (const action of actions) {
    const actionCounts = emptyCounts();
    const rangeStart = action.start > start ? action.start : start;
    const rangeEnd = action.end < today ? action.end : today;
    if (rangeStart <= rangeEnd) {
      for (const date of daysBetween(rangeStart, rangeEnd)) {
        const status = statusByDay.get(entryKey(action.id, date)) ?? null;
        addStatus(total, status);
        addStatus(actionCounts, status);
        const weekStart = mondayOf(new Date(`${date}T12:00:00`));
        const weeklyCounts = weekly.get(weekStart) ?? emptyCounts();
        addStatus(weeklyCounts, status);
        weekly.set(weekStart, weeklyCounts);
        const weekday = (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
        addStatus(weekdays[weekday]!, status);
        const heatmapCounts = heatmap.get(date) ?? emptyCounts();
        addStatus(heatmapCounts, status);
        heatmap.set(date, heatmapCounts);
      }
    }
    const actionEntries = entries
      .filter((entry) =>
        entry.actionId === action.id
        && entry.status === "missed"
        && entry.date >= rangeStart
        && entry.date <= rangeEnd
      )
      .sort((left, right) => left.date.localeCompare(right.date));
    const intervals = actionEntries.slice(1).map((entry, index) => countDaysInclusive(actionEntries[index]!.date, entry.date) - 1);
    const streak = rangeStart <= rangeEnd ? streaks(action, statusByDay, start, today) : { current: 0, best: 0 };
    actionResults.push({
      actionId: action.id,
      name: action.name,
      ...finish(actionCounts),
      currentStreak: streak.current,
      bestStreak: streak.best,
      averageMissInterval: intervals.length === 0
        ? null
        : Math.round((intervals.reduce((sum, value) => sum + value, 0) / intervals.length) * 10) / 10
    });
  }

  const reasonCounts = new Map<MissedReason, number>();
  for (const entry of entries) {
    const action = actionsById.get(entry.actionId);
    if (
      entry.status === "missed"
      && entry.reason
      && action
      && entry.date >= start
      && entry.date <= today
      && entry.date >= action.start
      && entry.date <= action.end
    ) {
      reasonCounts.set(entry.reason, (reasonCounts.get(entry.reason) ?? 0) + 1);
    }
  }

  const weeklyResults = [...weekly.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([weekStart, counts]) => ({ weekStart, ...finish(counts) }));
  const weekdayResults = weekdays.map((counts, weekday) => ({ weekday, ...finish(counts) }));
  const finished = finish(total);
  return {
    start,
    end: today,
    ...finished,
    weekly: weeklyResults,
    weekdays: weekdayResults,
    heatmap: daysBetween(start, today).map((date) => ({ date, ...finish(heatmap.get(date) ?? emptyCounts()) })),
    actions: actionResults.sort((left, right) => right.percentage - left.percentage || left.name.localeCompare(right.name)),
    reasons: [...reasonCounts.entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([reason, count]) => ({ reason, label: MISSED_REASON_LABELS[reason], count })),
    observations: observations(finished, weeklyResults, weekdayResults)
  };
}

function observations(
  total: AnalyticsSlice,
  weekly: WeeklyAnalytics[],
  weekdays: WeekdayAnalytics[]
): string[] {
  const result: string[] = [];
  if (total.eligible < 14) return result;

  const usableDays = weekdays.filter((day) => day.eligible >= 2);
  if (usableDays.length >= 4) {
    const sorted = usableDays.slice().sort((left, right) => right.percentage - left.percentage);
    const best = sorted[0]!;
    const worst = sorted[sorted.length - 1]!;
    if (best.percentage - worst.percentage >= 15) {
      result.push(`В этой выборке результат по ${weekdayName(best.weekday)} выше, чем по ${weekdayName(worst.weekday)} (${best.percentage}% против ${worst.percentage}%).`);
    }
  }

  const completeWeeks = weekly.filter((week) => week.eligible >= 3);
  if (completeWeeks.length >= 4) {
    const split = Math.floor(completeWeeks.length / 2);
    const previous = rate(completeWeeks.slice(0, split));
    const recent = rate(completeWeeks.slice(split));
    if (Math.abs(recent - previous) >= 10) {
      result.push(`В последних неделях доля выполнения ${recent > previous ? "выше" : "ниже"} ранней части периода (${recent}% против ${previous}%). Это наблюдение, а не вывод о причине.`);
    }
  }
  return result;
}

function rate(slices: AnalyticsSlice[]): number {
  const done = slices.reduce((sum, slice) => sum + slice.done, 0);
  const eligible = slices.reduce((sum, slice) => sum + slice.eligible, 0);
  return eligible === 0 ? 0 : Math.round((done / eligible) * 100);
}

export function weekdayName(index: number): string {
  return ["понедельникам", "вторникам", "средам", "четвергам", "пятницам", "субботам", "воскресеньям"][index] ?? "дням";
}
