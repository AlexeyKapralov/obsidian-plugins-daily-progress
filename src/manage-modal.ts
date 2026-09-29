import { App, Modal, Notice, Setting } from "obsidian";
import { createActionDraft } from "./actions";
import { formatIsoDate } from "./dates";
import { ActionModal } from "./modals";
import type { DailyAction } from "./model";
import { ProgressStore } from "./storage";

export class ManageActionsModal extends Modal {
  public constructor(app: App, private readonly store: ProgressStore, private readonly dataPath: string) {
    super(app);
  }

  public onOpen(): void {
    this.setTitle("Управление действиями");
    void this.render();
  }

  public onClose(): void {
    this.contentEl.empty();
  }

  private async render(): Promise<void> {
    this.contentEl.empty();
    try {
      const { data } = await this.store.read(this.dataPath);
      new Setting(this.contentEl)
        .setName("Ежедневные действия")
        .setDesc(`Файл данных: ${this.dataPath}`)
        .addButton((button) => button.setCta().setButtonText("Добавить действие").onClick(() => this.openCreate()));

      if (data.actions.length === 0) {
        this.contentEl.createDiv({ cls: "daily-progress-manage-empty", text: "Пока нет действий." });
        return;
      }

      const list = this.contentEl.createDiv({ cls: "daily-progress-manage-list" });
      for (const action of data.actions.slice().sort((left, right) => left.name.localeCompare(right.name))) {
        new Setting(list)
          .setName(action.name)
          .setDesc(`${action.start} – ${action.end}`)
          .addButton((button) => button.setButtonText("Изменить").onClick(() => this.openEdit(action)))
          .addButton((button) => button.setButtonText("Завершить").onClick(() => this.openComplete(action)))
          .addButton((button) =>
            button.setWarning().setButtonText("Удалить").onClick(() => this.openDelete(action))
          );
      }
    } catch (error) {
      this.contentEl.createDiv({
        cls: "daily-progress-error",
        text: error instanceof Error ? error.message : "Не удалось прочитать данные Daily Progress."
      });
    }
  }

  private openCreate(): void {
    this.openEdit(createActionDraft(formatIsoDate(new Date())));
  }

  private openEdit(action: DailyAction): void {
    new ActionModal(this.app, action, async (updated) => {
      await this.store.saveAction(this.dataPath, updated);
      await this.render();
    }).open();
  }

  private openComplete(action: DailyAction): void {
    new CompleteActionModal(this.app, action, async (endDate) => {
      await this.store.completeAction(this.dataPath, action.id, endDate);
      await this.render();
    }).open();
  }

  private openDelete(action: DailyAction): void {
    new ConfirmDeleteModal(this.app, action, async () => {
      await this.store.deleteAction(this.dataPath, action.id);
      await this.render();
    }).open();
  }
}

class CompleteActionModal extends Modal {
  private endDate: string;

  public constructor(
    app: App,
    private readonly action: DailyAction,
    private readonly complete: (endDate: string) => Promise<void>
  ) {
    super(app);
    const today = formatIsoDate(new Date());
    this.endDate = today < action.start ? action.start : today;
  }

  public onOpen(): void {
    this.setTitle(`Завершить «${this.action.name}»`);
    new Setting(this.contentEl).setName("Дата окончания").addText((text) => {
      text.inputEl.type = "date";
      text.setValue(this.endDate).onChange((value) => (this.endDate = value));
    });
    new Setting(this.contentEl).addButton((button) =>
      button.setCta().setButtonText("Завершить").onClick(() => void this.submit())
    );
  }

  private async submit(): Promise<void> {
    try {
      await this.complete(this.endDate);
      this.close();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Не удалось завершить действие.");
    }
  }
}

class ConfirmDeleteModal extends Modal {
  public constructor(app: App, private readonly action: DailyAction, private readonly confirm: () => Promise<void>) {
    super(app);
  }

  public onOpen(): void {
    this.setTitle("Удалить действие?");
    this.contentEl.createEl("p", {
      text: `«${this.action.name}» и вся его история отметок будут удалены. Остальные данные не изменятся.`
    });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Отмена").onClick(() => this.close()))
      .addButton((button) => button.setWarning().setButtonText("Удалить").onClick(() => void this.submit()));
  }

  private async submit(): Promise<void> {
    try {
      await this.confirm();
      this.close();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Не удалось удалить действие.");
    }
  }
}
