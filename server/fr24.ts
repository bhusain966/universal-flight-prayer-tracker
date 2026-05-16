import { ENV } from "./_core/env";

const FR24_BASE = "https://fr24api.flightradar24.com/api";

const FR24_HEADERS = {
  Accept: "application/json",
  "Accept-Version": "v1",
  Authorization: `Bearer ${ENV.fr24ApiKey}`,
};

export interface Fr24LivePosition {
  fr24_id: string;
  flight: string;
  callsign?: string;
  lat: number;
  lon: number;
  track: number;
  alt: number;
  gspeed: number;
  vspeed: number;
  squawk?: string;
  timestamp: string;
  source?: string;
  hex?: string;
  type?: string;
  reg?: string;
  painted_as?: string;
  operating_as?: string;
  orig_iata?: string;
  orig_icao?: string;
  dest_iata?: string;
  dest_icao?: string;
  eta?: string; // ISO timestamp
}

export interface Fr24FlightSummary {
  fr24_id: string;
  flight: string;
  callsign?: string;
  operating_as?: string;
  painted_as?: string;
  type?: string;
  reg?: string;
  orig_icao?: string;
  orig_iata?: string;
  dest_icao?: string;
  dest_iata?: string;
  dest_icao_actual?: string;
  dest_iata_actual?: string;
  datetime_takeoff?: string;
  runway_takeoff?: string;
  datetime_landed?: string | null;
  runway_landed?: string | null;
  flight_time?: number | null;
  actual_distance?: number;
  circle_distance?: number;
  category?: string;
  hex?: string;
  first_seen?: string;
  last_seen?: string;
  flight_ended?: boolean;
}

export interface Fr24CombinedData {
  live?: Fr24LivePosition;
  summary?: Fr24FlightSummary;
}

async function fr24Get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${FR24_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { headers: FR24_HEADERS });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`FR24 API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Fetch live position + flight summary for a given IATA flight number.
 * Returns null if the flight is not found in FR24 (not an error — it may just not be airborne).
 */
export async function fetchFr24FlightData(flightIata: string): Promise<Fr24CombinedData | null> {
  let live: Fr24LivePosition | undefined;
  let fr24Id: string | undefined;

  // Step 1: Get live position
  try {
    const liveRes = await fr24Get<{ data: Fr24LivePosition[] }>(
      "/live/flight-positions/full",
      { flights: flightIata }
    );
    if (liveRes.data && liveRes.data.length > 0) {
      live = liveRes.data[0];
      fr24Id = live.fr24_id;
    }
  } catch {
    // FR24 live data unavailable — non-fatal
  }

  // Step 2: Get flight summary (richer metadata: runway, distance, category, takeoff time)
  let summary: Fr24FlightSummary | undefined;
  if (fr24Id) {
    try {
      const summaryRes = await fr24Get<{ data: Fr24FlightSummary[] }>(
        "/flight-summary/full",
        { flight_ids: fr24Id }
      );
      if (summaryRes.data && summaryRes.data.length > 0) {
        summary = summaryRes.data[0];
      }
    } catch {
      // Summary unavailable — non-fatal
    }
  }

  if (!live && !summary) return null;
  return { live, summary };
}
