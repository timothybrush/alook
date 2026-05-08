import { describe, it, expect } from "vitest";
import { getOccurrencesPerDay } from "../src/db/queries/calendar-event";

describe("getOccurrencesPerDay", () => {
  it("5min returns 288", () => {
    expect(getOccurrencesPerDay("5min")).toBe(288);
  });

  it("4hour returns 6 (>5, should collapse)", () => {
    expect(getOccurrencesPerDay("4hour")).toBe(6);
  });

  it("6hour returns 4 (≤5, no collapse)", () => {
    expect(getOccurrencesPerDay("6hour")).toBe(4);
  });

  it("1day returns 1 (never collapses)", () => {
    expect(getOccurrencesPerDay("1day")).toBe(1);
  });

  it("1week returns 1 (never collapses)", () => {
    expect(getOccurrencesPerDay("1week")).toBe(1);
  });

  it("30min returns 48 (>5, should collapse)", () => {
    expect(getOccurrencesPerDay("30min")).toBe(48);
  });

  it("1hour returns 24 (>5, should collapse)", () => {
    expect(getOccurrencesPerDay("1hour")).toBe(24);
  });

  it("1month returns 1 (never collapses)", () => {
    expect(getOccurrencesPerDay("1month")).toBe(1);
  });

  it("invalid format returns 1", () => {
    expect(getOccurrencesPerDay("bogus")).toBe(1);
  });
});
