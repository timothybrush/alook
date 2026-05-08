import { describe, it, expect } from "vitest";
import { getOccurrencesPerDay, expandOccurrences } from "../src/db/queries/calendar-event";

describe("calendar collapse integration", () => {
  const COLLAPSE_THRESHOLD = 5;

  it("5min recurring event collapses (not expanded individually)", () => {
    const interval = "5min";
    const perDay = getOccurrencesPerDay(interval);
    expect(perDay).toBeGreaterThan(COLLAPSE_THRESHOLD);
    expect(perDay).toBe(288);
  });

  it("6hour recurring event does NOT collapse and expands to 4 occurrences", () => {
    const interval = "6hour";
    const perDay = getOccurrencesPerDay(interval);
    expect(perDay).toBeLessThanOrEqual(COLLAPSE_THRESHOLD);

    const from = "2026-05-08T00:00:00.000Z";
    const to = "2026-05-08T23:59:59.999Z";
    const scheduledAt = "2026-05-08T00:00:00.000Z";
    const occurrences = expandOccurrences(scheduledAt, interval, null, [], from, to);
    expect(occurrences).toHaveLength(4);
  });

  it("mixed events: 5min collapses, 8hour does not", () => {
    const fiveMin = getOccurrencesPerDay("5min");
    const eightHour = getOccurrencesPerDay("8hour");
    expect(fiveMin).toBeGreaterThan(COLLAPSE_THRESHOLD);
    expect(eightHour).toBeLessThanOrEqual(COLLAPSE_THRESHOLD);
    expect(eightHour).toBe(3);

    const from = "2026-05-08T00:00:00.000Z";
    const to = "2026-05-08T23:59:59.999Z";
    const occurrences = expandOccurrences("2026-05-08T00:00:00.000Z", "8hour", null, [], from, to);
    expect(occurrences).toHaveLength(3);
  });

  it("collapsed event produces one row per day across multi-day range", () => {
    const interval = "5min";
    const perDay = getOccurrencesPerDay(interval);
    expect(perDay).toBe(288);

    // Simulating what the API route does: for a 3-day range, emit 3 collapsed rows
    const from = new Date("2026-05-08T00:00:00.000Z");
    const to = new Date("2026-05-10T23:59:59.999Z");
    const scheduledAt = new Date("2026-05-08T09:00:00.000Z");

    const collapsedRows: { date: string; collapsed_count: number }[] = [];
    const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
    const endDay = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
    while (cursor <= endDay) {
      if (cursor >= new Date(Date.UTC(scheduledAt.getUTCFullYear(), scheduledAt.getUTCMonth(), scheduledAt.getUTCDate()))) {
        collapsedRows.push({
          date: cursor.toISOString().slice(0, 10),
          collapsed_count: perDay,
        });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    expect(collapsedRows).toHaveLength(3);
    expect(collapsedRows[0]!.collapsed_count).toBe(288);
    expect(collapsedRows[0]!.date).toBe("2026-05-08");
    expect(collapsedRows[2]!.date).toBe("2026-05-10");
  });
});
