/**
 * Islamic prayer time calculation using the Umm al-Qura / MWL method.
 * Calculations are based on astronomical algorithms adapted from the
 * PrayTimes.org reference implementation (MIT-licensed).
 *
 * All times are returned as UTC Date objects.
 */

export type PrayerMethod = "MWL" | "ISNA" | "Egypt" | "Makkah" | "Karachi" | "Tehran" | "Jafari";

interface MethodParams {
  fajrAngle: number;
  ishaAngle?: number;
  ishaMins?: number; // minutes after Maghrib (Makkah method)
}

const METHODS: Record<PrayerMethod, MethodParams> = {
  MWL:     { fajrAngle: 18, ishaAngle: 17 },
  ISNA:    { fajrAngle: 15, ishaAngle: 15 },
  Egypt:   { fajrAngle: 19.5, ishaAngle: 17.5 },
  Makkah:  { fajrAngle: 18.5, ishaMins: 90 },
  Karachi: { fajrAngle: 18, ishaAngle: 18 },
  Tehran:  { fajrAngle: 17.7, ishaAngle: 14 },
  Jafari:  { fajrAngle: 16, ishaAngle: 14 },
};

function toRad(d: number) { return (d * Math.PI) / 180; }
function toDeg(r: number) { return (r * 180) / Math.PI; }
function fixAngle(a: number) { return a - 360 * Math.floor(a / 360); }
function fixHour(h: number) { return h - 24 * Math.floor(h / 24); }

/** Julian Day Number from a UTC date */
function julianDay(date: Date): number {
  const Y = date.getUTCFullYear();
  const M = date.getUTCMonth() + 1;
  const D = date.getUTCDate();
  if (M <= 2) {
    return julianDay(new Date(Date.UTC(Y - 1, M + 11 - 1, D)));
  }
  const A = Math.floor(Y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + D + B - 1524.5;
}

/** Sun's declination and equation of time (in hours) */
function sunPosition(jd: number): { declination: number; equationOfTime: number } {
  const D = jd - 2451545.0;
  const g = fixAngle(357.529 + 0.98560028 * D);
  const q = fixAngle(280.459 + 0.98564736 * D);
  const L = fixAngle(q + 1.915 * Math.sin(toRad(g)) + 0.02 * Math.sin(toRad(2 * g)));
  const e = 23.439 - 0.00000036 * D;
  const RA = toDeg(Math.atan2(Math.cos(toRad(e)) * Math.sin(toRad(L)), Math.cos(toRad(L)))) / 15;
  const declination = toDeg(Math.asin(Math.sin(toRad(e)) * Math.sin(toRad(L))));
  const equationOfTime = q / 15 - fixHour(RA);
  return { declination, equationOfTime };
}

/** Hour angle for a given altitude */
function hourAngle(lat: number, dec: number, altitude: number): number {
  const cosH =
    (Math.sin(toRad(altitude)) - Math.sin(toRad(lat)) * Math.sin(toRad(dec))) /
    (Math.cos(toRad(lat)) * Math.cos(toRad(dec)));
  if (cosH > 1) return 0;
  if (cosH < -1) return 12;
  return toDeg(Math.acos(cosH)) / 15;
}

/** Asr shadow factor: Shafi = 1, Hanafi = 2 */
function asrAltitude(shadowFactor: number, lat: number, dec: number): number {
  return toDeg(Math.atan(1 / (shadowFactor + Math.tan(toRad(Math.abs(lat - dec))))));
}

export interface PrayerTimes {
  fajr: Date;
  sunrise: Date;
  dhuhr: Date;
  asr: Date;
  maghrib: Date;
  isha: Date;
}

/**
 * Calculate prayer times for a given UTC date, latitude, and longitude.
 * Returns UTC Date objects for each prayer.
 */
export function calculatePrayerTimes(
  utcDate: Date,
  lat: number,
  lng: number,
  method: PrayerMethod = "MWL",
  asrFactor: 1 | 2 = 1
): PrayerTimes {
  const params = METHODS[method];
  const jd = julianDay(utcDate);
  const { declination, equationOfTime } = sunPosition(jd);

  // Timezone offset in hours (lng / 15)
  const tz = lng / 15;

  // Solar noon (Dhuhr) in UTC hours
  const dhuhrHour = 12 - equationOfTime - tz;

  // Sunrise / Sunset (altitude = -0.8333 for atmospheric refraction)
  const sunriseHA = hourAngle(lat, declination, -0.8333);
  const sunriseHour = dhuhrHour - sunriseHA;
  const sunsetHour = dhuhrHour + sunriseHA;

  // Fajr
  const fajrHA = hourAngle(lat, declination, -params.fajrAngle);
  const fajrHour = dhuhrHour - fajrHA;

  // Asr
  const asrAlt = asrAltitude(asrFactor, lat, declination);
  const asrHA = hourAngle(lat, declination, asrAlt);
  const asrHour = dhuhrHour + asrHA;

  // Maghrib = sunset
  const maghribHour = sunsetHour;

  // Isha
  let ishaHour: number;
  if (params.ishaMins !== undefined) {
    ishaHour = maghribHour + params.ishaMins / 60;
  } else {
    const ishaHA = hourAngle(lat, declination, -(params.ishaAngle ?? 17));
    ishaHour = dhuhrHour + ishaHA;
  }

  const toUTCDate = (hours: number): Date => {
    const base = new Date(
      Date.UTC(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate())
    );
    const totalMs = hours * 3600 * 1000;
    return new Date(base.getTime() + totalMs);
  };

  return {
    fajr: toUTCDate(fajrHour),
    sunrise: toUTCDate(sunriseHour),
    dhuhr: toUTCDate(dhuhrHour),
    asr: toUTCDate(asrHour),
    maghrib: toUTCDate(maghribHour),
    isha: toUTCDate(ishaHour),
  };
}

export interface PrayerTimesResult {
  times: {
    name: string;
    key: string;
    utc: string; // ISO string
    isPast: boolean;
    isNext: boolean;
  }[];
  nextPrayer: {
    name: string;
    key: string;
    utc: string;
    secondsUntil: number;
  } | null;
  calculatedAt: string;
  lat: number;
  lng: number;
}

const PRAYER_NAMES: Record<string, string> = {
  fajr: "Fajr",
  sunrise: "Sunrise",
  dhuhr: "Dhuhr",
  asr: "Asr",
  maghrib: "Maghrib",
  isha: "Isha",
};

export function getPrayerTimesResult(lat: number, lng: number, method: PrayerMethod = "MWL"): PrayerTimesResult {
  const now = new Date();
  const todayTimes = calculatePrayerTimes(now, lat, lng, method);

  // Also compute tomorrow's times for wrapping (if all today's prayers are past)
  const tomorrow = new Date(now);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const tomorrowTimes = calculatePrayerTimes(tomorrow, lat, lng, method);

  const prayerKeys: (keyof PrayerTimes)[] = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"];

  const allTimes = [
    ...prayerKeys.map((k) => ({ key: k, time: todayTimes[k], day: "today" as const })),
    ...prayerKeys.map((k) => ({ key: k, time: tomorrowTimes[k], day: "tomorrow" as const })),
  ];

  // Find next prayer (first one that is in the future)
  const nowMs = now.getTime();
  const nextEntry = allTimes.find((e) => e.time.getTime() > nowMs);

  const todayEntries = prayerKeys.map((k) => {
    const t = todayTimes[k];
    const isPast = t.getTime() <= nowMs;
    const isNext = nextEntry?.key === k && nextEntry?.day === "today";
    return {
      name: PRAYER_NAMES[k] ?? k,
      key: k,
      utc: t.toISOString(),
      isPast,
      isNext,
    };
  });

  let nextPrayer: PrayerTimesResult["nextPrayer"] = null;
  if (nextEntry) {
    const secondsUntil = Math.max(0, Math.floor((nextEntry.time.getTime() - nowMs) / 1000));
    nextPrayer = {
      name: PRAYER_NAMES[nextEntry.key] ?? nextEntry.key,
      key: nextEntry.key,
      utc: nextEntry.time.toISOString(),
      secondsUntil,
    };
  }

  return {
    times: todayEntries,
    nextPrayer,
    calculatedAt: now.toISOString(),
    lat,
    lng,
  };
}
