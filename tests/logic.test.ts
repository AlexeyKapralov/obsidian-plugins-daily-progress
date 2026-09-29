import { describe, expect, it } from "vitest";
import { completeAction, deleteAction } from "../src/actions";
import { parsePanelConfig } from "../src/config";
import { addDays, countDaysInclusive, mondayOf, parseIsoDate } from "../src/dates";
import { dayAvailability } from "../src/day-policy";
import { EMPTY_DOCUMENT, parseProgressData, serializeProgressData } from "../src/markdown";
import { calculateMetrics, calculateOverall, entryMap } from "../src/metrics";
import type { DailyAction, DailyEntry } from "../src/model";

const action: DailyAction = { id: "read", name: "Read | reflect", start: "2026-09-21", end: "2026-09-27" };

describe("date logic", () => {
  it("validates calendar dates and finds Monday", () => {
    expect(parseIsoDate("2026-02-29")).toBeNull();
    expect(mondayOf(new Date(2026, 8, 27, 12))).toBe("2026-09-21");
    expect(addDays("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDays("2026-12-28", 7)).toBe("2027-01-04");
    expect(countDaysInclusive("2026-12-30", "2027-01-02")).toBe(4);
  });
});

describe("panel config", () => {
  it("normalizes a requested week and accepts a custom data path", () => {
    expect(parsePanelConfig("data: Tracking/Daily.md\nweek: 2026-09-27")).toEqual({
      dataPath: "Tracking/Daily.md",
      weekStart: "2026-09-21"
    });
  });
});

describe("Markdown persistence", () => {
  it("round-trips actions, escaped cells, and entries while preserving surrounding text", () => {
    const entries: DailyEntry[] = [{ actionId: "read", date: "2026-09-21", status: "done" }];
    const source = `${EMPTY_DOCUMENT}\nPersonal note that must stay.\n`;
    const serialized = serializeProgressData(source, { actions: [action], entries });
    expect(serialized).toContain("Personal note that must stay.");
    expect(parseProgressData(serialized)).toEqual({ actions: [action], entries });
  });

  it("rejects orphaned log rows instead of silently deleting them on the next write", () => {
    const source = serializeProgressData("", {
      actions: [action],
      entries: [
        { actionId: "read", date: "2026-09-21", status: "done" },
        { actionId: "missing", date: "2026-09-21", status: "missed" }
      ]
    });
    expect(() => parseProgressData(source)).toThrow("invalid log row");
  });
});

describe("progress metrics", () => {
  it("excludes skips from completion and lets them pass through a streak", () => {
    const entries = entryMap([
      { actionId: "read", date: "2026-09-21", status: "done" },
      { actionId: "read", date: "2026-09-22", status: "skipped" },
      { actionId: "read", date: "2026-09-23", status: "done" }
    ]);
    expect(calculateMetrics(action, entries, "2026-09-23")).toEqual({
      completedDays: 2,
      skippedDays: 1,
      totalDays: 7,
      planPercentage: 43,
      elapsedEligibleDays: 2,
      elapsedPercentage: 100,
      streak: 2
    });
  });

  it("counts elapsed unmarked days as incomplete and stops the streak", () => {
    const entries = entryMap([{ actionId: "read", date: "2026-09-21", status: "done" }]);
    expect(calculateMetrics(action, entries, "2026-09-23")).toEqual({
      completedDays: 1,
      skippedDays: 0,
      totalDays: 7,
      planPercentage: 14,
      elapsedEligibleDays: 3,
      elapsedPercentage: 33,
      streak: 0
    });
  });

  it("uses the complete inclusive action range regardless of which week is displayed", () => {
    const longAction = { ...action, end: "2026-10-11" };
    const metrics = calculateMetrics(longAction, entryMap([]), "2026-09-27");
    expect(metrics.totalDays).toBe(21);
    expect(metrics.planPercentage).toBe(0);
    expect(metrics.elapsedEligibleDays).toBe(7);
  });

  it("keeps skips neutral while unmarked elapsed days lower elapsed quality", () => {
    const entries = entryMap([
      { actionId: "read", date: "2026-09-21", status: "done" },
      { actionId: "read", date: "2026-09-22", status: "skipped" }
    ]);
    const metrics = calculateMetrics(action, entries, "2026-09-23");
    expect(metrics.planPercentage).toBe(29);
    expect(metrics.elapsedEligibleDays).toBe(2);
    expect(metrics.elapsedPercentage).toBe(50);
  });

  it("aggregates complete action ranges without reconstructing skipped counts from rounded percentages", () => {
    const second = { id: "walk", name: "Walk", start: "2026-09-21", end: "2026-09-23" };
    const entries = entryMap([
      { actionId: "read", date: "2026-09-21", status: "done" },
      { actionId: "read", date: "2026-09-22", status: "skipped" },
      { actionId: "walk", date: "2026-09-21", status: "done" }
    ]);
    expect(calculateOverall([action, second], entries, "2026-09-23")).toEqual({
      completedDays: 2,
      skippedDays: 1,
      totalDays: 10,
      planPercentage: 30,
      elapsedEligibleDays: 5,
      elapsedPercentage: 40,
      streak: 0
    });
  });
});

describe("day editability", () => {
  it("allows past in-range dates and keeps future and out-of-range dates read-only", () => {
    expect(dayAvailability(action, "2026-09-21", "2026-09-24")).toBe("editable");
    expect(dayAvailability(action, "2026-09-25", "2026-09-24")).toBe("future");
    expect(dayAvailability(action, "2026-09-20", "2026-09-24")).toBe("outside");
  });
});

describe("action management", () => {
  const secondAction: DailyAction = { id: "walk", name: "Walk", start: "2026-09-20", end: "2026-10-01" };
  const entries: DailyEntry[] = [
    { actionId: "read", date: "2026-09-21", status: "done" },
    { actionId: "read", date: "2026-09-25", status: "missed" },
    { actionId: "walk", date: "2026-09-21", status: "skipped" }
  ];

  it("completes an action by changing only its end date and preserves all history", () => {
    const result = completeAction({ actions: [action, secondAction], entries }, "read", "2026-09-23");
    expect(result.actions.find((item) => item.id === "read")?.end).toBe("2026-09-23");
    expect(result.entries).toEqual(entries);
  });

  it("rejects a completion date before the action starts", () => {
    expect(() => completeAction({ actions: [action], entries }, "read", "2026-09-20")).toThrow("раньше даты начала");
  });

  it("deletes only the selected action and its history", () => {
    const result = deleteAction({ actions: [action, secondAction], entries }, "read");
    expect(result.actions).toEqual([secondAction]);
    expect(result.entries).toEqual([{ actionId: "walk", date: "2026-09-21", status: "skipped" }]);
  });

  it("keeps unrelated Markdown text when deletion is serialized", () => {
    const source = `${serializeProgressData("", { actions: [action, secondAction], entries })}\n## Мои пояснения\nНе удалять.\n`;
    const updated = serializeProgressData(source, deleteAction(parseProgressData(source), "read"));
    expect(updated).toContain("## Мои пояснения\nНе удалять.");
    expect(parseProgressData(updated)).toEqual({
      actions: [secondAction],
      entries: [{ actionId: "walk", date: "2026-09-21", status: "skipped" }]
    });
  });
});
