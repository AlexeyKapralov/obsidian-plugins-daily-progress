import { App, MarkdownRenderChild, Notice, normalizePath, TFile } from "obsidian";
import { calculateAnalytics, type AnalyticsPeriod } from "./analytics";
import { renderAnalytics } from "./analytics-view";
import { addDays, formatIsoDate, mondayOf } from "./dates";
import { dayAvailability } from "./day-policy";
import { calculateMetrics, calculateOverall, entryKey, entryMap } from "./metrics";
import { MISSED_REASON_LABELS, type DailyAction, type DailyEntry, type DayStatus, type MissedReason, type PanelConfig, type ProgressData } from "./model";
import { MissedDetailsModal } from "./modals";
import { renderPanelHeader } from "./panel-header";
import { ProgressStore } from "./storage";

const STATUS_META: Record<DayStatus, { symbol: string; label: string }> = {
  done: { symbol: "✓", label: "Выполнено" },
  missed: { symbol: "×", label: "Не выполнено" },
  skipped: { symbol: "–", label: "Уважительный пропуск" }
};

const NEXT_STATUS: Record<DayStatus, DayStatus | null> = {
  done: "missed",
  missed: "skipped",
  skipped: null
};

export interface PanelActions {
  create(dataPath: string): void;
  edit(dataPath: string, action: DailyAction): void;
  manage(dataPath: string): void;
}

export class DailyProgressPanel extends MarkdownRenderChild {
  private rendering = false;
  private renderQueued = false;
  private weekStart: string;
  private observedCurrentWeek: string;
  private analyticsPeriod: AnalyticsPeriod = "30";
  private analyticsExpanded = false;

  public constructor(
    containerEl: HTMLElement,
    private readonly app: App,
    private readonly store: ProgressStore,
    private readonly config: PanelConfig,
    private readonly actions: PanelActions
  ) {
    super(containerEl);
    this.weekStart = mondayOf(new Date());
    this.observedCurrentWeek = this.weekStart;
  }

  public async onload(): Promise<void> {
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && file.path === normalizePath(this.config.dataPath)) void this.render();
      })
    );
    this.registerInterval(
      window.setInterval(() => {
        const currentWeek = mondayOf(new Date());
        if (currentWeek !== this.observedCurrentWeek) {
          this.observedCurrentWeek = currentWeek;
          this.weekStart = currentWeek;
          void this.render();
        }
      }, 60_000)
    );
    await this.render();
  }

  private async render(): Promise<void> {
    if (this.rendering) {
      this.renderQueued = true;
      return;
    }
    this.rendering = true;
    try {
      do {
        this.renderQueued = false;
        try {
          const { data } = await this.store.read(this.config.dataPath);
          this.draw(data);
        } catch (error) {
          this.containerEl.empty();
          this.containerEl.createDiv({
            cls: "daily-progress-error",
            text: error instanceof Error ? error.message : "Не удалось загрузить данные Daily Progress."
          });
        }
      } while (this.renderQueued);
    } finally {
      this.rendering = false;
    }
  }

  private draw(data: ProgressData): void {
    this.containerEl.empty();
    const today = formatIsoDate(new Date());
    const weekDays = Array.from({ length: 7 }, (_, index) => addDays(this.weekStart, index));
    const weekEnd = weekDays[6] ?? this.weekStart;
    const actions = data.actions.filter((action) => action.start <= weekEnd && action.end >= this.weekStart);
    const entries = entryMap(data.entries);
    const entryDetails = new Map(data.entries.map((entry) => [entryKey(entry.actionId, entry.date), entry]));
    const overall = calculateOverall(actions, entries, today);

    const panel = this.containerEl.createDiv({ cls: "daily-progress-panel" });
    renderPanelHeader(panel, this.weekStart, weekEnd, mondayOf(new Date()), overall, {
      previousWeek: () => this.changeWeek(-7),
      currentWeek: () => this.goToCurrentWeek(),
      nextWeek: () => this.changeWeek(7),
      createAction: () => this.actions.create(this.config.dataPath),
      manageActions: () => this.actions.manage(this.config.dataPath)
    });

    if (actions.length === 0) {
      panel.createDiv({ cls: "daily-progress-empty", text: "На выбранной неделе нет активных действий." });
      this.drawAnalytics(panel, data, today);
      return;
    }

    const scroller = panel.createDiv({ cls: "daily-progress-scroll" });
    const table = scroller.createEl("table");
    const headRow = table.createEl("thead").createEl("tr");
    headRow.createEl("th", { text: "Действие", attr: { scope: "col" } });
    for (const date of weekDays) {
      const th = headRow.createEl("th", { attr: { scope: "col" } });
      th.createEl("span", { text: this.dayLabel(date) });
      th.createEl("small", { text: date.slice(8) });
    }
    headRow.createEl("th", { text: "План", attr: { scope: "col" } });
    headRow.createEl("th", { text: "Серия", attr: { scope: "col" } });

    const body = table.createEl("tbody");
    for (const action of actions) {
      const metrics = calculateMetrics(action, entries, today);
      const row = body.createEl("tr");
      const actionCell = row.createEl("th", { attr: { scope: "row" } });
      const edit = actionCell.createEl("button", { cls: "daily-progress-action", text: action.name });
      edit.setAttribute("aria-label", `Редактировать ${action.name}`);
      edit.addEventListener("click", () => this.actions.edit(this.config.dataPath, action));
      actionCell.createEl("small", { text: `${action.start} → ${action.end} · ${metrics.totalDays} дн.` });

      for (const date of weekDays) {
        row.appendChild(this.dayCell(action, date, today, entryDetails.get(entryKey(action.id, date))));
      }

      const progressCell = row.createEl("td", { cls: "daily-progress-metric" });
      progressCell.createEl("strong", { text: `${metrics.completedDays} из ${metrics.totalDays}` });
      progressCell.createEl("small", { text: `${metrics.planPercentage}% плана` });
      progressCell.createEl("small", {
        text: metrics.elapsedEligibleDays === 0 ? "нет наступивших" : `${metrics.elapsedPercentage}% наступивших`
      });
      row.createEl("td", { cls: "daily-progress-streak", text: String(metrics.streak), attr: { title: "Текущая серия" } });
    }

    this.drawAnalytics(panel, data, today);
  }

  private drawAnalytics(panel: HTMLElement, data: ProgressData, today: string): void {
    renderAnalytics(
      panel,
      calculateAnalytics(data.actions, data.entries, today, this.analyticsPeriod),
      this.analyticsPeriod,
      this.analyticsExpanded,
      (period) => {
        this.analyticsPeriod = period;
        this.analyticsExpanded = true;
        void this.render();
      },
      (expanded) => (this.analyticsExpanded = expanded)
    );
  }

  private dayCell(action: DailyAction, date: string, today: string, entry?: DailyEntry): HTMLTableCellElement {
    const cell = this.containerEl.ownerDocument.createElement("td");
    cell.className = "daily-progress-day";
    const availability = dayAvailability(action, date, today);
    if (availability === "outside") {
      cell.classList.add("is-outside");
      cell.textContent = "·";
      cell.setAttribute("aria-label", `${date}: вне диапазона действия`);
      return cell;
    }
    if (availability === "future") {
      cell.classList.add("is-future");
      cell.textContent = "·";
      cell.setAttribute("aria-label", `${date}: будущий день`);
      return cell;
    }

    const status = entry?.status ?? null;
    const meta = status ? STATUS_META[status] : { symbol: "○", label: "Нет отметки" };
    const missedDetails = entry?.status === "missed"
      ? [entry.reason ? MISSED_REASON_LABELS[entry.reason] : "", entry.comment ?? ""].filter(Boolean).join(": ")
      : "";
    const button = cell.createEl("button", {
      cls: `daily-progress-state is-${status ?? "unmarked"}`,
      text: meta.symbol,
      attr: {
        "aria-label": `${action.name}, ${date}: ${meta.label}${missedDetails ? ` — ${missedDetails}` : ""}. Нажмите, чтобы изменить.`,
        title: `${meta.label}${missedDetails ? ` — ${missedDetails}` : ""}. Нажмите мышью, Enter или Space.`
      }
    });
    button.addEventListener("click", () => {
      const next = status ? NEXT_STATUS[status] : "done";
      if (next === "missed") {
        new MissedDetailsModal(this.app, action.name, date, (reason, comment) =>
          this.changeStatus(action.id, date, "missed", reason, comment)
        ).open();
      } else {
        void this.changeStatus(action.id, date, next);
      }
    });
    return cell;
  }

  private async changeStatus(
    actionId: string,
    date: string,
    status: DayStatus | null,
    reason?: MissedReason,
    comment?: string
  ): Promise<void> {
    try {
      await this.store.setStatus(this.config.dataPath, actionId, date, status, { reason, comment });
      await this.render();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Could not update Daily Progress.");
    }
  }

  private dayLabel(date: string): string {
    const parsed = new Date(`${date}T12:00:00`);
    return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(parsed);
  }

  private changeWeek(days: number): void {
    this.weekStart = addDays(this.weekStart, days);
    void this.render();
  }

  private goToCurrentWeek(): void {
    this.weekStart = mondayOf(new Date());
    void this.render();
  }
}
