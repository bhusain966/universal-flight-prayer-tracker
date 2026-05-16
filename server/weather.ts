/**
 * Open-Meteo weather service
 * Fetches wind speed, wind direction, and temperature at cruise altitude
 * using pressure-level data (250 hPa ≈ 34,000 ft, typical cruise level).
 * No API key required — Open-Meteo is a free, open-source weather API.
 */

export interface WeatherAtAltitude {
  windSpeedKmh: number;
  windDirectionDeg: number;
  temperatureCelsius: number;
  pressureLevel: string;
  altitudeFt: number;
  fetchedAt: string;
}

/**
 * Map aircraft altitude (ft) to the nearest Open-Meteo pressure level.
 * Pressure levels available: 1000, 975, 950, 925, 900, 850, 800, 700,
 * 600, 500, 400, 300, 250, 200, 150, 100, 70, 50, 30 hPa
 */
function altitudeToPressureLevel(altFt: number): { hPa: number; approxFt: number } {
  // Standard atmosphere approximate altitudes
  const levels = [
    { hPa: 1000, approxFt: 364 },
    { hPa: 925, approxFt: 2500 },
    { hPa: 850, approxFt: 5000 },
    { hPa: 700, approxFt: 10000 },
    { hPa: 600, approxFt: 14000 },
    { hPa: 500, approxFt: 18000 },
    { hPa: 400, approxFt: 23500 },
    { hPa: 300, approxFt: 30000 },
    { hPa: 250, approxFt: 34000 },
    { hPa: 200, approxFt: 38700 },
    { hPa: 150, approxFt: 44600 },
    { hPa: 100, approxFt: 53100 },
  ];

  let best = levels[8]; // default 250 hPa
  let minDiff = Infinity;
  for (const level of levels) {
    const diff = Math.abs(level.approxFt - altFt);
    if (diff < minDiff) {
      minDiff = diff;
      best = level;
    }
  }
  return best;
}

/**
 * Convert wind direction degrees to compass bearing string.
 */
export function windDirectionToCompass(deg: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const idx = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return dirs[idx];
}

/**
 * Fetch wind speed, wind direction, and temperature at the given
 * lat/lng and altitude from Open-Meteo's pressure-level forecast API.
 */
export async function fetchWeatherAtPosition(
  lat: number,
  lng: number,
  altFt = 35000,
): Promise<WeatherAtAltitude | null> {
  try {
    const { hPa, approxFt } = altitudeToPressureLevel(altFt);
    const params = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lng.toFixed(4),
      hourly: [
        `windspeed_${hPa}hPa`,
        `winddirection_${hPa}hPa`,
        `temperature_${hPa}hPa`,
      ].join(","),
      wind_speed_unit: "kmh",
      forecast_days: "1",
      timezone: "UTC",
    });

    const url = `https://api.open-meteo.com/v1/forecast?${params}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });

    if (!res.ok) {
      console.warn(`[Weather] Open-Meteo returned ${res.status}`);
      return null;
    }

    const json = (await res.json()) as {
      hourly?: {
        time?: string[];
        [key: string]: unknown;
      };
    };

    const hourly = json.hourly;
    if (!hourly?.time?.length) return null;

    // Find the index of the hour closest to now (UTC)
    const nowIso = new Date().toISOString().slice(0, 13); // "2026-05-16T04"
    let idx = 0;
    for (let i = 0; i < hourly.time.length; i++) {
      if ((hourly.time[i] as string).startsWith(nowIso)) {
        idx = i;
        break;
      }
    }

    const windSpeedKey = `windspeed_${hPa}hPa`;
    const windDirKey = `winddirection_${hPa}hPa`;
    const tempKey = `temperature_${hPa}hPa`;

    const windSpeedArr = hourly[windSpeedKey] as number[] | undefined;
    const windDirArr = hourly[windDirKey] as number[] | undefined;
    const tempArr = hourly[tempKey] as number[] | undefined;

    if (!windSpeedArr || !windDirArr || !tempArr) return null;

    return {
      windSpeedKmh: Math.round(windSpeedArr[idx] ?? 0),
      windDirectionDeg: Math.round(windDirArr[idx] ?? 0),
      temperatureCelsius: Math.round((tempArr[idx] ?? 0) * 10) / 10,
      pressureLevel: `${hPa} hPa`,
      altitudeFt: approxFt,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn("[Weather] Failed to fetch Open-Meteo data:", err);
    return null;
  }
}
