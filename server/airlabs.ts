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
  // Calculated
  percent?: number;
  eta?: string;
  eta_utc?: string;
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

export interface FlightFullData {
  flight: AirlabsFlightData;
  depAirport?: AirlabsAirportData;
  arrAirport?: AirlabsAirportData;
}

async function airlabsGet<T>(endpoint: string, params: Record<string, string>): Promise<T> {
  const url = `${BASE_URL}/${endpoint}`;
  const response = await axios.get<{ response: T; error?: { message: string } }>(url, {
    params: {
      api_key: ENV.airlabsApiKey,
      ...params,
    },
    timeout: 15000,
  });
  if (response.data.error) {
    throw new Error(response.data.error.message);
  }
  return response.data.response;
}

/**
 * Fetch live flight data by IATA flight number.
 * Uses the /flights endpoint for live telemetry (position, speed, altitude, heading).
 * Falls back to /flight endpoint for schedule/status data if not airborne.
 */
export async function fetchFlightData(flightIata: string): Promise<FlightFullData> {
  const normalized = flightIata.toUpperCase().trim();

  // Try live flights endpoint first (returns live telemetry)
  let liveData: AirlabsFlightData | undefined;
  try {
    const liveResults = await airlabsGet<AirlabsFlightData[]>("flights", {
      flight_iata: normalized,
    });
    if (liveResults && liveResults.length > 0) {
      liveData = liveResults[0];
    }
  } catch {
    // Live data not available, continue to schedule endpoint
  }

  // Always fetch schedule/status data from /flight endpoint
  let scheduleData: AirlabsFlightData | undefined;
  try {
    const schedResults = await airlabsGet<AirlabsFlightData[]>("flight", {
      flight_iata: normalized,
    });
    if (schedResults && schedResults.length > 0) {
      scheduleData = schedResults[0];
    }
  } catch {
    // Schedule data not available
  }

  if (!liveData && !scheduleData) {
    throw new Error(`Flight ${normalized} not found. Please check the flight number and try again.`);
  }

  // Merge: prefer live data for telemetry, schedule data for times/status
  const merged: AirlabsFlightData = {
    flight_iata: normalized,
    ...(scheduleData ?? {}),
    ...(liveData ?? {}),
    // Preserve schedule times from scheduleData even if liveData exists
    dep_time: scheduleData?.dep_time ?? liveData?.dep_time,
    dep_time_utc: scheduleData?.dep_time_utc ?? liveData?.dep_time_utc,
    dep_actual: scheduleData?.dep_actual ?? liveData?.dep_actual,
    dep_actual_utc: scheduleData?.dep_actual_utc ?? liveData?.dep_actual_utc,
    dep_estimated: scheduleData?.dep_estimated ?? liveData?.dep_estimated,
    dep_delay: scheduleData?.dep_delay ?? liveData?.dep_delay,
    arr_time: scheduleData?.arr_time ?? liveData?.arr_time,
    arr_time_utc: scheduleData?.arr_time_utc ?? liveData?.arr_time_utc,
    arr_actual: scheduleData?.arr_actual ?? liveData?.arr_actual,
    arr_actual_utc: scheduleData?.arr_actual_utc ?? liveData?.arr_actual_utc,
    arr_estimated: scheduleData?.arr_estimated ?? liveData?.arr_estimated,
    arr_delay: scheduleData?.arr_delay ?? liveData?.arr_delay,
    status: scheduleData?.status ?? liveData?.status,
    dep_terminal: scheduleData?.dep_terminal ?? liveData?.dep_terminal,
    dep_gate: scheduleData?.dep_gate ?? liveData?.dep_gate,
    arr_terminal: scheduleData?.arr_terminal ?? liveData?.arr_terminal,
    arr_gate: scheduleData?.arr_gate ?? liveData?.arr_gate,
    // Live telemetry from liveData
    lat: liveData?.lat,
    lng: liveData?.lng,
    alt: liveData?.alt,
    speed: liveData?.speed,
    dir: liveData?.dir,
    v_speed: liveData?.v_speed,
    percent: liveData?.percent,
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

  return { flight: merged, depAirport, arrAirport };
}
