import { describe, it, expect, vi, beforeEach } from "vitest";
import { windDirectionToCompass } from "./weather";

// ─── windDirectionToCompass ───────────────────────────────────────────────────

describe("windDirectionToCompass", () => {
  it("returns N for 0°", () => {
    expect(windDirectionToCompass(0)).toBe("N");
  });

  it("returns N for 360°", () => {
    expect(windDirectionToCompass(360)).toBe("N");
  });

  it("returns E for 90°", () => {
    expect(windDirectionToCompass(90)).toBe("E");
  });

  it("returns S for 180°", () => {
    expect(windDirectionToCompass(180)).toBe("S");
  });

  it("returns W for 270°", () => {
    expect(windDirectionToCompass(270)).toBe("W");
  });

  it("returns NE for 45°", () => {
    expect(windDirectionToCompass(45)).toBe("NE");
  });

  it("returns SW for 225°", () => {
    expect(windDirectionToCompass(225)).toBe("SW");
  });

  it("handles negative degrees correctly", () => {
    // -90° == 270° == W
    expect(windDirectionToCompass(-90)).toBe("W");
  });

  it("handles values > 360°", () => {
    // 450° == 90° == E
    expect(windDirectionToCompass(450)).toBe("E");
  });
});

// ─── fetchWeatherAtPosition (mocked) ─────────────────────────────────────────

describe("fetchWeatherAtPosition", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns structured weather data on successful API response", async () => {
    const mockHourly = {
      time: ["2026-05-16T04:00", "2026-05-16T05:00"],
      "windspeed_250hPa": [85.2, 90.1],
      "winddirection_250hPa": [270, 280],
      "temperature_250hPa": [-55.3, -56.1],
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        latitude: 47.5,
        longitude: 55.2,
        hourly: mockHourly,
      }),
    }));

    const { fetchWeatherAtPosition } = await import("./weather");
    const result = await fetchWeatherAtPosition(47.5, 55.2, 35000);

    expect(result).not.toBeNull();
    expect(result?.windSpeedKmh).toBe(85);
    expect(result?.windDirectionDeg).toBe(270);
    expect(result?.temperatureCelsius).toBe(-55.3);
    expect(result?.pressureLevel).toBe("250 hPa");
    expect(result?.altitudeFt).toBe(34000);
  });

  it("returns null when API returns non-ok status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    }));

    const { fetchWeatherAtPosition } = await import("./weather");
    const result = await fetchWeatherAtPosition(47.5, 55.2, 35000);
    expect(result).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const { fetchWeatherAtPosition } = await import("./weather");
    const result = await fetchWeatherAtPosition(47.5, 55.2, 35000);
    expect(result).toBeNull();
  });
});
