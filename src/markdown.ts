import { isDayStatus, isMissedReason, type DailyAction, type DailyEntry, type ProgressData } from "./model";
import { isValidRange, parseIsoDate } from "./dates";

const ACTIONS_START = "<!-- daily-progress:actions:start -->";
const ACTIONS_END = "<!-- daily-progress:actions:end -->";
const LOG_START = "<!-- daily-progress:log:start -->";
const LOG_END = "<!-- daily-progress:log:end -->";

export const EMPTY_DOCUMENT = `# Daily Progress Data

This Markdown note is the readable source of truth for the Daily Progress plugin. You may edit it manually, but keep the marker comments and table columns intact.

${ACTIONS_START}
| ID | Action | Start | End |
| --- | --- | --- | --- |
${ACTIONS_END}

${LOG_START}
| Date | Action ID | Status | Reason | Comment |
| --- | --- | --- | --- | --- |
${LOG_END}
`;

function escapeCell(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function splitRow(line: string): string[] {
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  let escaped = false;
  for (const character of body) {
    if (escaped) {
      current += character;
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  cells.push(current.trim());
  return cells;
}

function section(source: string, start: string, end: string): string | null {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) return null;
  return source.slice(startIndex + start.length, endIndex);
}

function dataRows(markdown: string | null): string[][] {
  if (!markdown) return [];
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !/^\|\s*:?-+/.test(line))
    .slice(1)
    .map(splitRow);
}

export function parseProgressData(source: string): ProgressData {
  const actions = dataRows(section(source, ACTIONS_START, ACTIONS_END)).map((cells): DailyAction => {
    const [id, name, start, end] = cells;
    if (!id || !name || !start || !end || !isValidRange(start, end)) {
      throw new Error("Daily Progress has an invalid action row. Check ID, name, and YYYY-MM-DD date range.");
    }
    return { id, name, start, end };
  });
  const validIds = new Set(actions.map((action) => action.id));
  if (validIds.size !== actions.length) throw new Error("Daily Progress action IDs must be unique.");

  const entryKeys = new Set<string>();
  const entries = dataRows(section(source, LOG_START, LOG_END)).map((cells): DailyEntry => {
    const [date, actionId, status, rawReason = "", rawComment = ""] = cells;
    if (!date || !actionId || !status || !parseIsoDate(date) || !validIds.has(actionId) || !isDayStatus(status)) {
      throw new Error("Daily Progress has an invalid log row. Check date, action ID, and status.");
    }
    if ((rawReason || rawComment) && status !== "missed") {
      throw new Error("Daily Progress reason and comment are only valid for missed rows.");
    }
    if (rawReason && !isMissedReason(rawReason)) {
      throw new Error("Daily Progress has an invalid missed reason.");
    }
    const reason = rawReason && isMissedReason(rawReason) ? rawReason : undefined;
    const key = `${actionId}\u0000${date}`;
    if (entryKeys.has(key)) throw new Error(`Daily Progress has more than one mark for ${actionId} on ${date}.`);
    entryKeys.add(key);
    return {
      date,
      actionId,
      status,
      ...(reason ? { reason } : {}),
      ...(rawComment ? { comment: rawComment } : {})
    };
  });
  return { actions, entries };
}

function actionsBlock(actions: DailyAction[]): string {
  const rows = actions
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((action) => `| ${escapeCell(action.id)} | ${escapeCell(action.name)} | ${action.start} | ${action.end} |`);
  return [ACTIONS_START, "| ID | Action | Start | End |", "| --- | --- | --- | --- |", ...rows, ACTIONS_END].join("\n");
}

function logBlock(entries: DailyEntry[]): string {
  const rows = entries
    .slice()
    .sort((left, right) => left.date.localeCompare(right.date) || left.actionId.localeCompare(right.actionId))
    .map((entry) =>
      `| ${entry.date} | ${escapeCell(entry.actionId)} | ${entry.status} | ${escapeCell(entry.reason ?? "")} | ${escapeCell(entry.comment ?? "")} |`
    );
  return [
    LOG_START,
    "| Date | Action ID | Status | Reason | Comment |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    LOG_END
  ].join("\n");
}

function replaceSection(source: string, start: string, end: string, replacement: string): string | null {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) return null;
  return source.slice(0, startIndex) + replacement + source.slice(endIndex + end.length);
}

export function serializeProgressData(source: string, data: ProgressData): string {
  const base = source.trim() ? source : EMPTY_DOCUMENT;
  const withActions = replaceSection(base, ACTIONS_START, ACTIONS_END, actionsBlock(data.actions));
  if (withActions === null) return `${base.trimEnd()}\n\n${actionsBlock(data.actions)}\n\n${logBlock(data.entries)}\n`;
  const withLog = replaceSection(withActions, LOG_START, LOG_END, logBlock(data.entries));
  return `${(withLog ?? `${withActions.trimEnd()}\n\n${logBlock(data.entries)}`).trimEnd()}\n`;
}
