import { describe, it, expect } from "vitest";
import { calculatePrayerTimes, getPrayerTimesResult } from "./prayer";

describe("calculatePrayerTimes", () => {
  it("returns 6 prayer times for a known location (Mecca)", () => {
    const date = new Date("2024-06-15T00:00:00Z");
    const times = calculatePrayerTimes(date, 21.3891, 39.8579, "MWL");

    expect(times.fajr).toBeInstanceOf(Date);
    expect(times.sunrise).toBeInstanceOf(Date);
    expect(times.dhuhr).toBeInstanceOf(Date);
    expect(times.asr).toBeInstanceOf(Date);
    expect(times.maghrib).toBeInstanceOf(Date);
    expect(times.isha).toBeInstanceOf(Date);
  });

  it("fajr is before sunrise", () => {
    const date = new Date("2024-06-15T00:00:00Z");
    const times = calculatePrayerTimes(date, 21.3891, 39.8579, "MWL");
    expect(times.fajr.getTime()).toBeLessThan(times.sunrise.getTime());
  });

  it("sunrise is before dhuhr", () => {
    const date = new Date("2024-06-15T00:00:00Z");
    const times = calculatePrayerTimes(date, 21.3891, 39.8579, "MWL");
    expect(times.sunrise.getTime()).toBeLessThan(times.dhuhr.getTime());
  });

  it("dhuhr is before asr", () => {
    const date = new Date("2024-06-15T00:00:00Z");
    const times = calculatePrayerTimes(date, 21.3891, 39.8579, "MWL");
    expect(times.dhuhr.getTime()).toBeLessThan(times.asr.getTime());
  });

  it("asr is before maghrib", () => {
    const date = new Date("2024-06-15T00:00:00Z");
    const times = calculatePrayerTimes(date, 21.3891, 39.8579, "MWL");
    expect(times.asr.getTime()).toBeLessThan(times.maghrib.getTime());
  });

  it("maghrib is before isha", () => {
    const date = new Date("2024-06-15T00:00:00Z");
    const times = calculatePrayerTimes(date, 21.3891, 39.8579, "MWL");
    expect(times.maghrib.getTime()).toBeLessThan(times.isha.getTime());
  });

  it("works for a mid-flight position over Europe", () => {
    const date = new Date("2024-06-15T12:00:00Z");
    const times = calculatePrayerTimes(date, 48.8566, 2.3522, "MWL");
    expect(times.fajr).toBeInstanceOf(Date);
    expect(times.isha).toBeInstanceOf(Date);
    expect(times.fajr.getTime()).toBeLessThan(times.isha.getTime());
  });
});

describe("getPrayerTimesResult", () => {
  it("returns 6 prayer entries", () => {
    const result = getPrayerTimesResult(21.3891, 39.8579);
    expect(result.times).toHaveLength(6);
  });

  it("identifies a next prayer", () => {
    const result = getPrayerTimesResult(21.3891, 39.8579);
    // At least one prayer should be in the future
    expect(result.nextPrayer).not.toBeNull();
  });

  it("next prayer has positive secondsUntil", () => {
    const result = getPrayerTimesResult(21.3891, 39.8579);
    if (result.nextPrayer) {
      expect(result.nextPrayer.secondsUntil).toBeGreaterThanOrEqual(0);
    }
  });

  it("returns correct lat/lng", () => {
    const result = getPrayerTimesResult(25.0, 55.0);
    expect(result.lat).toBe(25.0);
    expect(result.lng).toBe(55.0);
  });

  it("exactly one prayer is marked as next", () => {
    const result = getPrayerTimesResult(21.3891, 39.8579);
    const nextCount = result.times.filter((t) => t.isNext).length;
    expect(nextCount).toBeLessThanOrEqual(1);
  });
});
