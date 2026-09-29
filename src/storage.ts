import { normalizePath, TFile, type Vault } from "obsidian";
import { completeAction, deleteAction, saveAction } from "./actions";
import { EMPTY_DOCUMENT, parseProgressData, serializeProgressData } from "./markdown";
import type { DailyAction, DayStatus, ProgressData } from "./model";

export class ProgressStore {
  public constructor(private readonly vault: Vault) {}

  public async ensure(path: string): Promise<TFile> {
    const normalized = normalizePath(path);
    const existing = this.vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFile) return existing;
    if (existing) throw new Error(`${normalized} exists but is not a file.`);
    await this.ensureParentFolders(normalized);
    return this.vault.create(normalized, EMPTY_DOCUMENT);
  }

  public async read(path: string): Promise<{ file: TFile; data: ProgressData }> {
    const file = await this.ensure(path);
    return { file, data: parseProgressData(await this.vault.read(file)) };
  }

  public async saveAction(path: string, action: DailyAction): Promise<void> {
    await this.update(path, (data) => saveAction(data, action));
  }

  public async completeAction(path: string, actionId: string, endDate: string): Promise<void> {
    await this.update(path, (data) => completeAction(data, actionId, endDate));
  }

  public async deleteAction(path: string, actionId: string): Promise<void> {
    await this.update(path, (data) => deleteAction(data, actionId));
  }

  public async setStatus(path: string, actionId: string, date: string, status: DayStatus | null): Promise<void> {
    await this.update(path, (data) => {
      const entries = data.entries.filter((entry) => !(entry.actionId === actionId && entry.date === date));
      if (status) entries.push({ actionId, date, status });
      return { ...data, entries };
    });
  }

  private async update(path: string, change: (data: ProgressData) => ProgressData): Promise<void> {
    const file = await this.ensure(path);
    await this.vault.process(file, (source) => serializeProgressData(source, change(parseProgressData(source))));
  }

  private async ensureParentFolders(filePath: string): Promise<void> {
    const parts = filePath.split("/").slice(0, -1);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!this.vault.getAbstractFileByPath(current)) await this.vault.createFolder(current);
    }
  }
}
