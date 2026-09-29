import { addDays, isValidRange } from "./dates";
import type { DailyAction, ProgressData } from "./model";

export function createActionDraft(today: string): DailyAction {
  return {
    id: `action-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: "",
    start: today,
    end: addDays(today, 6)
  };
}

export function saveAction(data: ProgressData, action: DailyAction): ProgressData {
  return {
    ...data,
    actions: [...data.actions.filter((item) => item.id !== action.id), action]
  };
}

export function completeAction(data: ProgressData, actionId: string, endDate: string): ProgressData {
  const action = data.actions.find((item) => item.id === actionId);
  if (!action) throw new Error("Действие не найдено.");
  if (!isValidRange(action.start, endDate)) throw new Error("Дата завершения не может быть раньше даты начала.");
  return saveAction(data, { ...action, end: endDate });
}

export function deleteAction(data: ProgressData, actionId: string): ProgressData {
  if (!data.actions.some((action) => action.id === actionId)) throw new Error("Действие не найдено.");
  return {
    actions: data.actions.filter((action) => action.id !== actionId),
    entries: data.entries.filter((entry) => entry.actionId !== actionId)
  };
}
