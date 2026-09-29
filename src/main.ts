import { Notice, Plugin, type Editor } from "obsidian";
import { createActionDraft } from "./actions";
import { panelCodeBlock, parsePanelConfig } from "./config";
import { formatIsoDate } from "./dates";
import { ManageActionsModal } from "./manage-modal";
import { ActionModal, ActionPickerModal } from "./modals";
import { DEFAULT_DATA_PATH, type DailyAction } from "./model";
import { DailyProgressPanel } from "./panel";
import { ProgressStore } from "./storage";

export default class DailyProgressPlugin extends Plugin {
  private store!: ProgressStore;

  public onload(): void {
    this.store = new ProgressStore(this.app.vault);
    this.registerMarkdownCodeBlockProcessor("daily-progress", (source, element, context) => {
      const panel = new DailyProgressPanel(
        element,
        this.app,
        this.store,
        parsePanelConfig(source),
        {
          create: (path) => this.openCreateModal(path),
          edit: (path, action) => this.openActionModal(path, action),
          manage: (path) => this.openManageModal(path)
        }
      );
      context.addChild(panel);
    });

    this.addCommand({
      id: "insert-panel",
      name: "Insert weekly panel",
      editorCallback: (editor: Editor) => {
        editor.replaceSelection(`${panelCodeBlock()}\n`);
        void this.store.ensure(DEFAULT_DATA_PATH).catch((error: unknown) => this.showError(error));
      }
    });

    this.addCommand({
      id: "create-action",
      name: "Create daily action",
      callback: () => void this.withActiveDataPath((path) => this.openCreateModal(path))
    });

    this.addCommand({
      id: "edit-action",
      name: "Edit daily action",
      callback: () => void this.withActiveDataPath((path) => this.openPicker(path))
    });
  }

  private openCreateModal(path: string): void {
    const today = formatIsoDate(new Date());
    this.openActionModal(path, createActionDraft(today));
  }

  private openActionModal(path: string, action: DailyAction): void {
    new ActionModal(this.app, action, (updated) => this.store.saveAction(path, updated)).open();
  }

  private openManageModal(path: string): void {
    new ManageActionsModal(this.app, this.store, path).open();
  }

  private async openPicker(path: string): Promise<void> {
    try {
      const { data } = await this.store.read(path);
      if (data.actions.length === 0) {
        new Notice("There are no daily actions to edit.");
        return;
      }
      new ActionPickerModal(this.app, data.actions, (action) => this.openActionModal(path, action)).open();
    } catch (error) {
      this.showError(error);
    }
  }

  private async withActiveDataPath(action: (path: string) => void | Promise<void>): Promise<void> {
    try {
      const file = this.app.workspace.getActiveFile();
      if (!file) {
        await action(DEFAULT_DATA_PATH);
        return;
      }
      const source = await this.app.vault.cachedRead(file);
      const match = /```daily-progress\s*\n([\s\S]*?)```/.exec(source);
      await action(match?.[1] ? parsePanelConfig(match[1]).dataPath : DEFAULT_DATA_PATH);
    } catch (error) {
      this.showError(error);
    }
  }

  private showError(error: unknown): void {
    new Notice(error instanceof Error ? error.message : "Daily Progress encountered an error.");
  }
}
