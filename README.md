# Daily Progress

Daily Progress is a calm daily-action tracker rendered inside any Obsidian note. The panel is configured by a `daily-progress` code block; actions and day marks remain in a separate, ordinary Markdown note that stays understandable without the plugin.

## Install and enable

This folder already has the manual-install layout expected by Obsidian:

- `manifest.json`
- `main.js`
- `styles.css`

Reload Obsidian, then enable **Daily Progress** under **Settings → Community plugins**. To rebuild from source, run `npm install` and `npm run build` in this directory.

## Use

1. Open any weekly note.
2. Run **Daily Progress: Insert weekly panel** from the command palette.
3. In the panel, select **Добавить** and enter the action name, start date, and end date.
4. In Reading view or Live Preview, activate a current or past day to cycle through **not marked → done → not done → excused skip → not marked**.
5. Select an action name to edit it, or select **Управление** to edit, complete, or delete actions from this panel's data file.

The command-palette actions remain available as an additional workflow. Panel controls are native buttons and work with mouse, Enter, and Space. Future days and dates outside an action's range are read-only. The styling uses Obsidian theme variables and follows light and dark themes.

### Week navigation

- **‹** shows the previous Monday–Sunday week.
- **›** shows the next week, including future weeks for planning and review. Future cells remain read-only.
- **Текущая** returns to the current week.

Navigation is local to the rendered panel. It does not rewrite the `week` line in the Markdown code block. Any current or past day inside an action's date range remains editable, so older marks can be corrected by moving back to the required week.

### Managing actions

- **Изменить** opens the same date/name form used when creating an action.
- **Завершить** asks for an end date and updates only the action's date range. Existing log rows remain in Markdown, including marks after the new end date.
- **Удалить** always opens a separate confirmation. Confirming removes the action and all log rows with its ID, while keeping other actions, logs, and text outside the marked sections.
- If the data tables contain an invalid or duplicate row, these operations stop with an error and do not overwrite the source note.

## Panel code block

The insertion command writes a block like this:

````markdown
```daily-progress
data: Daily Progress Data.md
week: 2026-09-21
```
````

- `data` is a vault-relative path to the Markdown data note. It defaults to `Daily Progress Data.md`; folders are created when needed.
- `week` is any date in the desired week. The panel normalizes it to Monday. If omitted or invalid, the current week is shown.

The block works wherever it is inserted; note names and templates are irrelevant. The create/edit commands use the first `daily-progress` block in the active note, falling back to the default data path.

## Markdown data format

The plugin creates the data note only after a panel or action is first created. It uses two marked Markdown tables:

```markdown
# Daily Progress Data

<!-- daily-progress:actions:start -->
| ID | Action | Start | End |
| --- | --- | --- | --- |
| action-example | Morning walk | 2026-09-21 | 2026-10-31 |
<!-- daily-progress:actions:end -->

<!-- daily-progress:log:start -->
| Date | Action ID | Status |
| --- | --- | --- |
| 2026-09-21 | action-example | done |
| 2026-09-22 | action-example | skipped |
<!-- daily-progress:log:end -->
```

Status values are `done`, `missed`, and `skipped`. Absence of a row means “not marked”. Keep action IDs unique, keep at most one log row per action and date, use dates in `YYYY-MM-DD`, and leave the marker comments intact. Text outside the marked sections is preserved when the plugin writes updates. If a row is invalid or duplicated, the plugin refuses to write and reports the problem so the original Markdown is not silently lost.

## Calculations

- **X из Y дней** uses the full action range: `Y` is every calendar day from `start` through `end`, inclusive, regardless of the week currently displayed. `X` is the number of completed elapsed days.
- **% плана** is `(completed elapsed days + excused elapsed skips) / all Y planned days`. Future days remain in the denominator, so this is explicitly progress through the entire plan rather than a claim about current consistency.
- **% наступивших** is `completed elapsed days / (all elapsed in-range days − excused skips)`. Missed and unmarked elapsed days lower this percentage; excused skips do not.
- **Current streak** counts consecutive done days backward from today (or the action's end). Excused skips are transparent; a missed or unmarked day ends the streak.
- **Overall progress** aggregates the full date ranges of actions visible in the selected week. Changing the visible week never truncates an individual action's totals.

## Development checks

```bash
npm run check
```

This runs strict TypeScript checking, unit tests for parsing/date/metric logic, and a production build. The plugin has no network calls, telemetry, external services, or runtime dependencies beyond Obsidian.

## MVP limitations

- The panel shows Monday through Sunday; custom week lengths are not supported.
- If multiple panels in one note use different data files, palette commands target the first panel; clicking an action always edits the correct file.
