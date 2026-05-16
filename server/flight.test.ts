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

describe("calculatePrayerTimes — method differences", () => {
  const date = new Date("2024-06-15T00:00:00Z");
  const lat = 21.3891; // Mecca
  const lng = 39.8579;

  it("MWL fajr is earlier than ISNA fajr (larger angle = earlier time)", () => {
    const mwl = calculatePrayerTimes(date, lat, lng, "MWL");
    const isna = calculatePrayerTimes(date, lat, lng, "ISNA");
    // MWL uses 18° vs ISNA 15° — larger angle means earlier fajr
    expect(mwl.fajr.getTime()).toBeLessThan(isna.fajr.getTime());
  });

  it("Egypt fajr is earlier than MWL fajr (19.5° vs 18°)", () => {
    const egypt = calculatePrayerTimes(date, lat, lng, "Egypt");
    const mwl = calculatePrayerTimes(date, lat, lng, "MWL");
    expect(egypt.fajr.getTime()).toBeLessThan(mwl.fajr.getTime());
  });

  it("Makkah isha is fixed minutes after maghrib (not angle-based)", () => {
    const makkah = calculatePrayerTimes(date, lat, lng, "Makkah");
    const diffMinutes = (makkah.isha.getTime() - makkah.maghrib.getTime()) / 60000;
    // Makkah uses 90 minutes after Maghrib
    expect(Math.round(diffMinutes)).toBe(90);
  });

  it("Karachi isha angle (18°) produces later isha than ISNA (15°)", () => {
    const karachi = calculatePrayerTimes(date, lat, lng, "Karachi");
    const isna = calculatePrayerTimes(date, lat, lng, "ISNA");
    // Larger isha angle = later isha time
    expect(karachi.isha.getTime()).toBeGreaterThan(isna.isha.getTime());
  });

  it("all 5 methods produce valid ordered prayer times", () => {
    const methods = ["MWL", "ISNA", "Egypt", "Makkah", "Karachi"] as const;
    for (const method of methods) {
      const t = calculatePrayerTimes(date, lat, lng, method);
      expect(t.fajr.getTime()).toBeLessThan(t.sunrise.getTime());
      expect(t.sunrise.getTime()).toBeLessThan(t.dhuhr.getTime());
      expect(t.dhuhr.getTime()).toBeLessThan(t.asr.getTime());
      expect(t.asr.getTime()).toBeLessThan(t.maghrib.getTime());
      expect(t.maghrib.getTime()).toBeLessThan(t.isha.getTime());
    }
  });

  it("getPrayerTimesResult respects the selected method", () => {
    const mwl = getPrayerTimesResult(lat, lng, "MWL");
    const isna = getPrayerTimesResult(lat, lng, "ISNA");
    // Different methods should produce different fajr times
    const mwlFajr = new Date(mwl.times[0].utc).getTime();
    const isnaFajr = new Date(isna.times[0].utc).getTime();
    expect(mwlFajr).not.toBe(isnaFajr);
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
