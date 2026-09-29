import { isDateInRange } from "./dates";
import type { DailyAction } from "./model";

export type DayAvailability = "editable" | "future" | "outside";

export function dayAvailability(action: DailyAction, date: string, today: string): DayAvailability {
  if (!isDateInRange(date, action.start, action.end)) return "outside";
  return date > today ? "future" : "editable";
}
