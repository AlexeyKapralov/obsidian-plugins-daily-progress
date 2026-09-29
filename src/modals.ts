import { App, FuzzySuggestModal, Modal, Notice, Setting } from "obsidian";
import { isValidRange } from "./dates";
import { isMissedReason, MISSED_REASON_LABELS, MISSED_REASONS, type DailyAction, type MissedReason } from "./model";

export class ActionModal extends Modal {
  private name: string;
  private start: string;
  private end: string;

  public constructor(
    app: App,
    private readonly action: DailyAction,
    private readonly onSave: (action: DailyAction) => Promise<void>
  ) {
    super(app);
    this.name = action.name;
    this.start = action.start;
    this.end = action.end;
  }

  public onOpen(): void {
    this.setTitle(this.action.name ? "Редактировать действие" : "Добавить действие");
    new Setting(this.contentEl).setName("Действие").addText((text) =>
      text.setPlaceholder("Читать 20 минут").setValue(this.name).onChange((value) => (this.name = value))
    );
    new Setting(this.contentEl).setName("Дата начала").addText((text) => {
      text.inputEl.type = "date";
      text.setValue(this.start).onChange((value) => (this.start = value));
    });
    new Setting(this.contentEl).setName("Дата окончания").addText((text) => {
      text.inputEl.type = "date";
      text.setValue(this.end).onChange((value) => (this.end = value));
    });
    new Setting(this.contentEl).addButton((button) =>
      button.setCta().setButtonText("Сохранить").onClick(() => void this.submit())
    );
  }

  public onClose(): void {
    this.contentEl.empty();
  }

  private async submit(): Promise<void> {
    const name = this.name.trim();
    if (!name) {
      new Notice("Введите название действия.");
      return;
    }
    if (!isValidRange(this.start, this.end)) {
      new Notice("Проверьте даты: дата окончания не может быть раньше даты начала.");
      return;
    }
    try {
      await this.onSave({ ...this.action, name, start: this.start, end: this.end });
      this.close();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Не удалось сохранить действие.");
    }
  }
}

export class MissedDetailsModal extends Modal {
  private reason: MissedReason | undefined;
  private comment = "";

  public constructor(
    app: App,
    private readonly actionName: string,
    private readonly date: string,
    private readonly save: (reason?: MissedReason, comment?: string) => Promise<void>
  ) {
    super(app);
  }

  public onOpen(): void {
    this.setTitle("Отметить как missed");
    this.contentEl.createEl("p", { text: `${this.actionName} · ${this.date}` });
    new Setting(this.contentEl).setName("Причина (необязательно)").addDropdown((dropdown) => {
      dropdown.addOption("", "Не указывать");
      for (const reason of MISSED_REASONS) dropdown.addOption(reason, MISSED_REASON_LABELS[reason]);
      dropdown.onChange((value) => (this.reason = isMissedReason(value) ? value : undefined));
    });
    new Setting(this.contentEl).setName("Короткий комментарий (необязательно)").addText((text) => {
      text.setPlaceholder("До 160 символов").onChange((value) => (this.comment = value.slice(0, 160)));
      text.inputEl.maxLength = 160;
    });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Отмена").onClick(() => this.close()))
      .addButton((button) => button.setCta().setButtonText("Сохранить missed").onClick(() => void this.submit()));
  }

  public onClose(): void {
    this.contentEl.empty();
  }

  private async submit(): Promise<void> {
    try {
      await this.save(this.reason, this.comment.trim() || undefined);
      this.close();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Не удалось сохранить missed.");
    }
  }
}

export class ActionPickerModal extends FuzzySuggestModal<DailyAction> {
  public constructor(app: App, private readonly actions: DailyAction[], private readonly choose: (action: DailyAction) => void) {
    super(app);
    this.setPlaceholder("Выберите действие для редактирования");
  }

  public getItems(): DailyAction[] {
    return this.actions;
  }

  public getItemText(action: DailyAction): string {
    return `${action.name} (${action.start} – ${action.end})`;
  }

  public onChooseItem(action: DailyAction): void {
    this.choose(action);
  }
}
