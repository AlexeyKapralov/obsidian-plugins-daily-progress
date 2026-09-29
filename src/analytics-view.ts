import { type AnalyticsPeriod, type ProgressAnalytics, weekdayName } from "./analytics";

const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  "30": "30 дней",
  "90": "90 дней",
  all: "Вся история"
};

const SHORT_WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

export function renderAnalytics(
  panel: HTMLElement,
  analytics: ProgressAnalytics,
  period: AnalyticsPeriod,
  expanded: boolean,
  onPeriodChange: (period: AnalyticsPeriod) => void,
  onExpandedChange: (expanded: boolean) => void
): void {
  const details = panel.createEl("details", { cls: "daily-progress-analytics" });
  details.open = expanded;
  details.addEventListener("toggle", () => onExpandedChange(details.open));
  const summary = details.createEl("summary");
  summary.createEl("span", { text: "Аналитика" });
  summary.createEl("small", { text: `${analytics.percentage}% · ${PERIOD_LABELS[period].toLowerCase()}` });

  const content = details.createDiv({ cls: "daily-progress-analytics-content" });
  const toolbar = content.createDiv({ cls: "daily-progress-periods", attr: { "aria-label": "Период аналитики" } });
  for (const value of ["30", "90", "all"] as const) {
    const button = toolbar.createEl("button", {
      text: PERIOD_LABELS[value],
      cls: value === period ? "is-active" : "",
      attr: { "aria-pressed": String(value === period) }
    });
    button.addEventListener("click", () => onPeriodChange(value));
  }

  const cards = content.createDiv({ cls: "daily-progress-analytics-cards" });
  metricCard(cards, `${analytics.percentage}%`, "выполнено");
  metricCard(cards, String(analytics.done), "done");
  metricCard(cards, String(analytics.missed), "missed");
  metricCard(cards, String(analytics.skipped), "skipped");
  metricCard(cards, String(analytics.unmarked), "без отметки");

  if (analytics.eligible === 0 && analytics.skipped === 0) {
    content.createDiv({ cls: "daily-progress-empty", text: "В выбранном периоде пока нет наступивших дней действий." });
    return;
  }

  const trend = section(content, "Динамика по неделям");
  const trendChart = trend.createDiv({ cls: "daily-progress-bars" });
  for (const week of analytics.weekly) {
    const bar = trendChart.createDiv({ cls: "daily-progress-bar" });
    bar.createDiv({
      cls: "daily-progress-bar-fill",
      attr: { style: `height: ${week.percentage}%` }
    });
    bar.createEl("span", { text: week.weekStart.slice(5), attr: { title: `${week.weekStart}: ${week.percentage}%` } });
  }

  const weekdaySection = section(content, "По дням недели");
  const weekdays = weekdaySection.createDiv({ cls: "daily-progress-weekdays" });
  for (const day of analytics.weekdays) {
    const item = weekdays.createDiv();
    item.createEl("strong", { text: day.eligible === 0 ? "—" : `${day.percentage}%` });
    item.createEl("span", { text: SHORT_WEEKDAYS[day.weekday] ?? weekdayName(day.weekday) });
    item.setAttribute("title", `${day.done} done, ${day.missed} missed, ${day.skipped} skipped, ${day.unmarked} без отметки`);
  }

  const heatmapSection = section(content, "Календарь");
  const heatmap = heatmapSection.createDiv({ cls: "daily-progress-heatmap", attr: { role: "img", "aria-label": "Календарная карта выполнения" } });
  for (const [index, day] of analytics.heatmap.entries()) {
    const level = day.eligible === 0 ? 0 : Math.max(1, Math.ceil(day.percentage / 25));
    heatmap.createDiv({
      cls: `daily-progress-heatmap-day level-${level}`,
      attr: {
        ...(index === 0 ? { style: `grid-row: ${(new Date(`${day.date}T12:00:00`).getDay() + 6) % 7 + 1}` } : {}),
        title: `${day.date}: ${day.percentage}% (${day.done} done, ${day.missed} missed, ${day.skipped} skipped, ${day.unmarked} без отметки)`,
        "aria-label": `${day.date}: ${day.percentage}%`
      }
    });
  }

  const actionSection = section(content, "По действиям и серии");
  const actionScroller = actionSection.createDiv({ cls: "daily-progress-analytics-table-wrap" });
  const table = actionScroller.createEl("table", { cls: "daily-progress-analytics-table" });
  const header = table.createEl("thead").createEl("tr");
  for (const label of ["Действие", "Результат", "Текущая", "Лучшая", "Между missed"]) {
    header.createEl("th", { text: label, attr: { scope: "col" } });
  }
  const body = table.createEl("tbody");
  for (const action of analytics.actions) {
    const row = body.createEl("tr");
    row.createEl("th", { text: action.name, attr: { scope: "row" } });
    row.createEl("td", { text: action.eligible === 0 ? "—" : `${action.percentage}%` });
    row.createEl("td", { text: String(action.currentStreak) });
    row.createEl("td", { text: String(action.bestStreak) });
    row.createEl("td", { text: action.averageMissInterval === null ? "—" : `${action.averageMissInterval} дн.` });
  }

  const reasonSection = section(content, "Причины missed");
  if (analytics.reasons.length === 0) {
    reasonSection.createDiv({ cls: "daily-progress-muted", text: "Причины пока не указаны." });
  } else {
    const list = reasonSection.createEl("ul", { cls: "daily-progress-reasons" });
    for (const reason of analytics.reasons) list.createEl("li", { text: `${reason.label}: ${reason.count}` });
  }

  if (analytics.observations.length > 0) {
    const insightSection = section(content, "Наблюдения");
    const list = insightSection.createEl("ul", { cls: "daily-progress-observations" });
    for (const observation of analytics.observations) list.createEl("li", { text: observation });
  }
}

function metricCard(container: HTMLElement, value: string, label: string): void {
  const card = container.createDiv();
  card.createEl("strong", { text: value });
  card.createEl("span", { text: label });
}

function section(container: HTMLElement, title: string): HTMLDivElement {
  const element = container.createDiv({ cls: "daily-progress-analytics-section" });
  element.createEl("h4", { text: title });
  return element;
}
