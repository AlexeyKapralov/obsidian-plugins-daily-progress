import type { ActionMetrics } from "./metrics";

export interface HeaderActions {
  previousWeek(): void;
  currentWeek(): void;
  nextWeek(): void;
  createAction(): void;
  manageActions(): void;
}

export function renderPanelHeader(
  panel: HTMLElement,
  weekStart: string,
  weekEnd: string,
  currentWeekStart: string,
  metrics: ActionMetrics,
  actions: HeaderActions
): void {
  const header = panel.createDiv({ cls: "daily-progress-header" });
  const identity = header.createDiv({ cls: "daily-progress-identity" });
  identity.createEl("strong", { text: "Daily Progress" });

  const navigation = identity.createDiv({ cls: "daily-progress-navigation" });
  const previous = navigation.createEl("button", { text: "‹", attr: { "aria-label": "Предыдущая неделя", title: "Предыдущая неделя" } });
  previous.addEventListener("click", actions.previousWeek);
  navigation.createEl("span", { text: `${weekStart} – ${weekEnd}` });
  const next = navigation.createEl("button", { text: "›", attr: { "aria-label": "Следующая неделя", title: "Следующая неделя" } });
  next.addEventListener("click", actions.nextWeek);
  const current = navigation.createEl("button", { text: "Текущая", attr: { "aria-label": "Вернуться к текущей неделе" } });
  current.disabled = weekStart === currentWeekStart;
  current.addEventListener("click", actions.currentWeek);

  const headerTools = header.createDiv({ cls: "daily-progress-header-tools" });
  const summary = headerTools.createDiv({ cls: "daily-progress-summary" });
  summary.createEl("span", { text: `${metrics.completedDays} из ${metrics.totalDays} дней` });
  summary.createEl("strong", { text: `${metrics.planPercentage}% плана` });
  summary.createEl("small", {
    text: metrics.elapsedEligibleDays === 0 ? "нет наступивших дней" : `${metrics.elapsedPercentage}% наступивших`
  });
  const progress = summary.createEl("progress", {
    attr: {
      max: "100",
      value: String(metrics.planPercentage),
      "aria-label": `Выполнено ${metrics.planPercentage}% полного плана`
    }
  });
  progress.value = metrics.planPercentage;

  const controls = headerTools.createDiv({ cls: "daily-progress-controls" });
  const add = controls.createEl("button", { text: "Добавить", attr: { "aria-label": "Добавить ежедневное действие" } });
  add.addEventListener("click", actions.createAction);
  const manage = controls.createEl("button", { text: "Управление", attr: { "aria-label": "Управление ежедневными действиями" } });
  manage.addEventListener("click", actions.manageActions);
}
