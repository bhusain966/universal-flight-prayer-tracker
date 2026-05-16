import axios from "axios";
import { ENV } from "./_core/env";

const BASE_URL = "https://airlabs.co/api/v9";

export interface AirlabsFlightResponse {
  response: AirlabsFlightData;
}

export interface AirlabsFlightData {
  flight_iata: string;
  flight_icao?: string;
  flight_number?: string;
  airline_iata?: string;
  airline_icao?: string;
  airline_name?: string;
  dep_iata?: string;
  dep_icao?: string;
  dep_name?: string;
  dep_city?: string;
  dep_country?: string;
  dep_terminal?: string;
  dep_gate?: string;
  dep_time?: string;
  dep_time_utc?: string;
  dep_actual?: string;
  dep_actual_utc?: string;
  dep_estimated?: string;
  dep_estimated_utc?: string;
  dep_delay?: number;
  arr_iata?: string;
  arr_icao?: string;
  arr_name?: string;
  arr_city?: string;
  arr_country?: string;
  arr_terminal?: string;
  arr_gate?: string;
  arr_baggage?: string | number;
  arr_time?: string;
  arr_time_utc?: string;
  arr_actual?: string;
  arr_actual_utc?: string;
  arr_estimated?: string;
  arr_estimated_utc?: string;
  arr_delay?: number;
  status?: string;
  duration?: number;
  // Live telemetry (from flights endpoint)
  lat?: number;
  lng?: number;
  alt?: number;
  speed?: number;
  dir?: number;
  v_speed?: number;
  // Aircraft info
  aircraft_icao?: string;
  reg_number?: string;
  flag?: string;
  model?: string;
  manufacturer?: string;
  engine?: string;
  engine_count?: string;
  built?: number;
  age?: number;
  type?: string;
  msn?: string;
  hex?: string;
  // Calculated / returned by /flight
  percent?: number;
  eta?: number;   // minutes remaining to arrival
  eta_utc?: string;
  utc?: string;   // current UTC time from AirLabs server
}

export interface AirlabsAirportData {
  iata_code?: string;
  icao_code?: string;
  name?: string;
  city?: string;
  country_code?: string;
  lat?: number;
  lng?: number;
  timezone?: string;
}

export interface AirlabsAircraftData {
  reg_number?: string;
  model_code?: string;
  model_name?: string;
  airline_iata?: string;
  flag?: string;
}

export interface AirlabsQuota {
  /** Total API calls consumed so far (from request.key.limits_total) */
  usedTotal?: number;
  /** Monthly call limit */
  limitByMonth?: number;
  /** Hourly call limit */
  limitByHour?: number;
  /** Per-minute call limit */
  limitByMinute?: number;
}

export interface FlightFullData {
  flight: AirlabsFlightData;
  depAirport?: AirlabsAirportData;
  arrAirport?: AirlabsAirportData;
  airlabsQuota?: AirlabsQuota;
}

/**
 * Normalise an AirLabs UTC datetime string ('YYYY-MM-DD HH:MM') to ISO 8601 with Z suffix.
 * Only use for _utc fields (dep_time_utc, arr_time_utc, etc.).
 */
function normaliseUtcDatetime(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  if (raw.includes("T")) return raw; // already ISO
  // '2026-05-16 00:19' → '2026-05-16T00:19Z'
  const normalised = raw.replace(" ", "T") + "Z";
  return isNaN(new Date(normalised).getTime()) ? raw : normalised;
}

/**
 * Keep an AirLabs LOCAL datetime string ('YYYY-MM-DD HH:MM') as-is.
 * These fields (dep_time, arr_time, dep_actual, arr_actual, dep_estimated, arr_estimated)
 * are in the airport's local timezone. We preserve the raw string so the frontend
 * can extract HH:MM directly without any UTC conversion.
 */
function normaliseLocalDatetime(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  // Normalise space to T for consistent HH:MM regex extraction, but do NOT append Z
  if (raw.includes(" ")) return raw.replace(" ", "T");
  return raw;
}

interface AirlabsRawResponse<T> {
  response: T;
  error?: { message: string };
  request?: {
    key?: {
      limits_total?: number;
      limits_by_month?: number;
      limits_by_hour?: number;
      limits_by_minute?: number;
    };
  };
}

async function airlabsGetRaw<T>(
  endpoint: string,
  params: Record<string, string>
): Promise<{ data: T; quota?: AirlabsQuota }> {
  const url = `${BASE_URL}/${endpoint}`;
  const response = await axios.get<AirlabsRawResponse<T>>(url, {
    params: { api_key: ENV.airlabsApiKey, ...params },
    timeout: 15000,
  });
  if (response.data.error) {
    const code: string = (response.data.error as { code?: string }).code ?? '';
    const msg: string = response.data.error.message ?? 'AirLabs API error';
    if (code === 'month_limit_exceeded' || code === 'day_limit_exceeded' || code === 'hour_limit_exceeded' || code === 'minute_limit_exceeded') {
      throw new Error(`AIRLABS_QUOTA_EXCEEDED: ${msg}`);
    }
    throw new Error(msg);
  }
  const key = response.data.request?.key;
  const quota: AirlabsQuota | undefined = key
    ? {
        usedTotal: key.limits_total,
        limitByMonth: key.limits_by_month,
        limitByHour: key.limits_by_hour,
        limitByMinute: key.limits_by_minute,
      }
    : undefined;
  return { data: response.data.response, quota };
}

async function airlabsGet<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const { data } = await airlabsGetRaw<T>(endpoint, params);
  return data;
}

/**
 * Fetch live flight data by IATA flight number.
 * Uses the /flights endpoint for live telemetry (position, speed, altitude, heading).
 * Falls back to /flight endpoint for schedule/status data if not airborne.
 */
export async function fetchFlightData(flightIata: string): Promise<FlightFullData> {
  const normalized = flightIata.toUpperCase().trim();

  // Try live flights endpoint first (returns live telemetry as an ARRAY)
  let liveData: AirlabsFlightData | undefined;
  try {
    const liveResults = await airlabsGet<AirlabsFlightData[]>("flights", {
      flight_iata: normalized,
    });
    // /flights always returns an array; may be empty if aircraft not broadcasting
    if (Array.isArray(liveResults) && liveResults.length > 0) {
      liveData = liveResults[0];
    }
  } catch (e: unknown) {
    // Re-throw quota errors immediately — no point trying the schedule endpoint
    if (e instanceof Error && e.message.startsWith('AIRLABS_QUOTA_EXCEEDED')) throw e;
    // Live data not available, continue to schedule endpoint
  }

  // Always fetch schedule/status data from /flight endpoint
  // NOTE: /flight returns a SINGLE OBJECT (not an array) unlike /flights
  let scheduleData: AirlabsFlightData | undefined;
  let airlabsQuota: AirlabsQuota | undefined;
  try {
    // The generic helper wraps response — /flight returns a single object, not array
    const { data: raw, quota } = await airlabsGetRaw<AirlabsFlightData | AirlabsFlightData[]>("flight", {
      flight_iata: normalized,
    });
    airlabsQuota = quota;
    if (Array.isArray(raw)) {
      // Defensive: if API ever returns array, take first element
      if (raw.length > 0) scheduleData = raw[0];
    } else if (raw && typeof raw === "object" && "flight_iata" in raw) {
      // Normal case: single object
      scheduleData = raw as AirlabsFlightData;
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.message.startsWith('AIRLABS_QUOTA_EXCEEDED')) throw e;
    // Schedule data not available
  }

  if (!liveData && !scheduleData) {
    // Distinguish between an invalid flight number and a valid flight that is not yet
    // in the AirLabs active window (i.e. future scheduled flight).
    // AirLabs returns an empty response body (null / empty object) for future flights,
    // whereas a truly invalid IATA code also returns empty. We surface a distinct error
    // so the frontend can suggest "Add to Upcoming Trips" for valid-looking numbers.
    const iataPattern = /^[A-Z0-9]{2,3}\d{1,4}[A-Z]?$/i;
    if (iataPattern.test(normalized)) {
      throw new Error(`FLIGHT_NOT_YET_ACTIVE: Flight ${normalized} is not currently active. It may be a future flight not yet in the AirLabs tracking window. Add it to Upcoming Trips and tracking will activate automatically at departure time.`);
    }
    throw new Error(`Flight ${normalized} not found. Please check the flight number and try again.`);
  }

  // Merge: prefer live data for telemetry, schedule data for times/status
  const merged: AirlabsFlightData = {
    flight_iata: normalized,
    ...(scheduleData ?? {}),
    ...(liveData ?? {}),
    // Preserve schedule times from scheduleData even if liveData exists.
    // LOCAL fields (dep_time, arr_time, etc.) are in airport local timezone — keep as-is.
    // UTC fields (dep_time_utc, arr_time_utc, etc.) are normalised to ISO 8601 with Z suffix.
    dep_time: normaliseLocalDatetime(scheduleData?.dep_time ?? liveData?.dep_time),
    dep_time_utc: normaliseUtcDatetime(scheduleData?.dep_time_utc ?? liveData?.dep_time_utc),
    dep_actual: normaliseLocalDatetime(scheduleData?.dep_actual ?? liveData?.dep_actual),
    dep_actual_utc: normaliseUtcDatetime(scheduleData?.dep_actual_utc ?? liveData?.dep_actual_utc),
    dep_estimated: normaliseLocalDatetime(scheduleData?.dep_estimated ?? liveData?.dep_estimated),
    dep_estimated_utc: normaliseUtcDatetime(scheduleData?.dep_estimated_utc ?? liveData?.dep_estimated_utc),
    dep_delay: scheduleData?.dep_delay ?? liveData?.dep_delay,
    arr_time: normaliseLocalDatetime(scheduleData?.arr_time ?? liveData?.arr_time),
    arr_time_utc: normaliseUtcDatetime(scheduleData?.arr_time_utc ?? liveData?.arr_time_utc),
    arr_actual: normaliseLocalDatetime(scheduleData?.arr_actual ?? liveData?.arr_actual),
    arr_actual_utc: normaliseUtcDatetime(scheduleData?.arr_actual_utc ?? liveData?.arr_actual_utc),
    arr_estimated: normaliseLocalDatetime(scheduleData?.arr_estimated ?? liveData?.arr_estimated),
    arr_estimated_utc: normaliseUtcDatetime(scheduleData?.arr_estimated_utc ?? liveData?.arr_estimated_utc),
    arr_delay: scheduleData?.arr_delay ?? liveData?.arr_delay,
    status: scheduleData?.status ?? liveData?.status,
    dep_terminal: scheduleData?.dep_terminal ?? liveData?.dep_terminal,
    dep_gate: scheduleData?.dep_gate ?? liveData?.dep_gate,
    arr_terminal: scheduleData?.arr_terminal ?? liveData?.arr_terminal,
    arr_gate: scheduleData?.arr_gate ?? liveData?.arr_gate,
    arr_baggage: scheduleData?.arr_baggage ?? liveData?.arr_baggage,
    // Live telemetry from liveData (prefer liveData, fallback to scheduleData)
    lat: liveData?.lat ?? scheduleData?.lat,
    lng: liveData?.lng ?? scheduleData?.lng,
    alt: liveData?.alt ?? scheduleData?.alt,
    speed: liveData?.speed ?? scheduleData?.speed,
    dir: liveData?.dir ?? scheduleData?.dir,
    v_speed: liveData?.v_speed ?? scheduleData?.v_speed,
    percent: liveData?.percent ?? scheduleData?.percent,
    // ETA and server UTC from /flight endpoint
    eta: scheduleData?.eta ?? liveData?.eta,
    utc: scheduleData?.utc ?? liveData?.utc,
  };

  // Fetch airport coordinates for map rendering (only if not already in flight data)
  let depAirport: AirlabsAirportData | undefined;
  let arrAirport: AirlabsAirportData | undefined;

  const depIata = merged.dep_iata;
  const arrIata = merged.arr_iata;

  // Build partial airport objects from data already in the flight response
  if (depIata) {
    depAirport = {
      iata_code: depIata,
      icao_code: merged.dep_icao,
      name: merged.dep_name,
      city: merged.dep_city,
      country_code: merged.dep_country,
    };
  }
  if (arrIata) {
    arrAirport = {
      iata_code: arrIata,
      icao_code: merged.arr_icao,
      name: merged.arr_name,
      city: merged.arr_city,
      country_code: merged.arr_country,
    };
  }

  // Fetch full airport data (including coordinates) for map rendering
  try {
    if (depIata) {
      const airports = await airlabsGet<AirlabsAirportData[]>("airports", { iata_code: depIata });
      if (airports && airports.length > 0) depAirport = { ...depAirport, ...airports[0] };
    }
  } catch { /* ignore — partial data still usable */ }

  try {
    if (arrIata) {
      const airports = await airlabsGet<AirlabsAirportData[]>("airports", { iata_code: arrIata });
      if (airports && airports.length > 0) arrAirport = { ...arrAirport, ...airports[0] };
    }
  } catch { /* ignore — partial data still usable */ }

  return { flight: merged, depAirport, arrAirport, airlabsQuota };
}
