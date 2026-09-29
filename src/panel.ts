import { App, MarkdownRenderChild, Notice, normalizePath, TFile } from "obsidian";
import { addDays, formatIsoDate, mondayOf } from "./dates";
import { dayAvailability } from "./day-policy";
import { calculateMetrics, calculateOverall, entryMap, statusFor } from "./metrics";
import type { DailyAction, DayStatus, PanelConfig, ProgressData } from "./model";
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

  public constructor(
    containerEl: HTMLElement,
    private readonly app: App,
    private readonly store: ProgressStore,
    private readonly config: PanelConfig,
    private readonly actions: PanelActions
  ) {
    super(containerEl);
    this.weekStart = config.weekStart;
  }

  public async onload(): Promise<void> {
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile && file.path === normalizePath(this.config.dataPath)) void this.render();
      })
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

      for (const date of weekDays) row.appendChild(this.dayCell(action, date, today, statusFor(entries, action.id, date)));

      const progressCell = row.createEl("td", { cls: "daily-progress-metric" });
      progressCell.createEl("strong", { text: `${metrics.completedDays} из ${metrics.totalDays}` });
      progressCell.createEl("small", { text: `${metrics.planPercentage}% плана` });
      progressCell.createEl("small", {
        text: metrics.elapsedEligibleDays === 0 ? "нет наступивших" : `${metrics.elapsedPercentage}% наступивших`
      });
      row.createEl("td", { cls: "daily-progress-streak", text: String(metrics.streak), attr: { title: "Текущая серия" } });
    }
  }

  private dayCell(action: DailyAction, date: string, today: string, status: DayStatus | null): HTMLTableCellElement {
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

    const meta = status ? STATUS_META[status] : { symbol: "○", label: "Нет отметки" };
    const button = cell.createEl("button", {
      cls: `daily-progress-state is-${status ?? "unmarked"}`,
      text: meta.symbol,
      attr: {
        "aria-label": `${action.name}, ${date}: ${meta.label}. Нажмите, чтобы изменить.`,
        title: `${meta.label}. Нажмите мышью, Enter или Space.`
      }
    });
    button.addEventListener("click", () => void this.changeStatus(action.id, date, status ? NEXT_STATUS[status] : "done"));
    return cell;
  }

  private async changeStatus(actionId: string, date: string, status: DayStatus | null): Promise<void> {
    try {
      await this.store.setStatus(this.config.dataPath, actionId, date, status);
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
