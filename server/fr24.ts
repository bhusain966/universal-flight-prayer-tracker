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
  // Scheduled times (may be present in some FR24 API responses)
  scheduled_departure?: string;
  scheduled_arrival?: string;
}

export interface Fr24Quota {
  /** Credits remaining this billing period */
  creditsRemaining?: number;
  /** Credits consumed in this request */
  creditsConsumed?: number;
}

export interface Fr24CombinedData {
  live?: Fr24LivePosition;
  summary?: Fr24FlightSummary;
  quota?: Fr24Quota;
}

async function fr24Get<T>(path: string, params: Record<string, string> = {}): Promise<{ data: T; quota?: Fr24Quota }> {
  const url = new URL(`${FR24_BASE}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url.toString(), { headers: FR24_HEADERS });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`FR24 API error ${res.status}: ${text}`);
  }

  // Extract quota from response headers
  const remaining = res.headers.get("x-fr24-credits-remaining");
  const consumed = res.headers.get("x-fr24-credits-consumed");
  const quota: Fr24Quota | undefined =
    remaining != null || consumed != null
      ? {
          creditsRemaining: remaining != null ? parseInt(remaining, 10) : undefined,
          creditsConsumed: consumed != null ? parseInt(consumed, 10) : undefined,
        }
      : undefined;

  return { data: (await res.json()) as T, quota };
}

/**
 * Fetch flight summary by IATA flight number using a date-range search.
 * This works even when the flight is not currently live (e.g. just landed, or AirLabs quota exhausted).
 * Searches the last 24 hours by default.
 */
export async function fetchFr24FlightByIata(
  flightIata: string,
  hoursBack = 24,
): Promise<{ summary: Fr24FlightSummary; quota?: Fr24Quota } | null> {
  const now = new Date();
  const from = new Date(now.getTime() - hoursBack * 60 * 60 * 1000);
  const to = new Date(now.getTime() + 2 * 60 * 60 * 1000); // +2h for flights still airborne

  const fmt = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

  try {
    const { data: res, quota } = await fr24Get<{ data: Fr24FlightSummary[] }>(
      '/flight-summary/full',
      {
        flight_datetime_from: fmt(from),
        flight_datetime_to: fmt(to),
        flights: flightIata.toUpperCase(),
      },
    );
    if (!res.data || res.data.length === 0) return null;

    // Selection strategy (priority order):
    // 1. A not-yet-departed entry (no first_seen AND no datetime_takeoff) — this is a
    //    scheduled/predeparture record for today's flight.
    // 2. An entry whose first_seen or datetime_takeoff is today (UTC).
    // 3. The most recent entry (last in array) as a final fallback.
    const todayUtc = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'

    // Priority 1: scheduled but not yet airborne (no timestamps at all)
    const predepartureEntry = res.data.find(s => !s.first_seen && !s.datetime_takeoff);

    // Priority 2: has timestamps and they are from today
    const todayEntry = res.data.find(s => {
      const seen = s.first_seen ?? s.datetime_takeoff;
      return seen && seen.slice(0, 10) === todayUtc;
    });

    const summary = predepartureEntry ?? todayEntry ?? res.data[res.data.length - 1];
    return { summary, quota };
  } catch {
    return null;
  }
}

/**
 * Fetch live position + flight summary for a given IATA flight number.
 * Returns null if the flight is not found in FR24 (not an error — it may just not be airborne).
 */
export async function fetchFr24FlightData(flightIata: string): Promise<Fr24CombinedData | null> {
  let live: Fr24LivePosition | undefined;
  let fr24Id: string | undefined;
  let fr24Quota: Fr24Quota | undefined;

  // Step 1a: Try live position by IATA flight number
  try {
    const { data: liveRes, quota } = await fr24Get<{ data: Fr24LivePosition[] }>(
      "/live/flight-positions/full",
      { flights: flightIata }
    );
    if (quota) fr24Quota = quota;
    if (liveRes.data && liveRes.data.length > 0) {
      live = liveRes.data[0];
      fr24Id = live.fr24_id;
    }
  } catch {
    // FR24 live data unavailable — non-fatal
  }

  // Step 1b: If IATA lookup returned nothing, try by callsign.
  // The FR24 live endpoint uses ICAO callsigns (e.g. QTR1188) not IATA (QR1188).
  // Derive the likely callsign by replacing the 2-letter IATA airline prefix with
  // the 3-letter ICAO prefix. We attempt common mappings and also try the raw IATA
  // number as-is (some carriers use the same code for both).
  if (!live) {
    const callsignCandidates = deriveCallsignCandidates(flightIata);
    for (const callsign of callsignCandidates) {
      try {
        const { data: liveRes, quota } = await fr24Get<{ data: Fr24LivePosition[] }>(
          "/live/flight-positions/full",
          { callsigns: callsign }
        );
        if (quota) fr24Quota = { ...fr24Quota, ...quota };
        if (liveRes.data && liveRes.data.length > 0) {
          live = liveRes.data[0];
          fr24Id = live.fr24_id;
          break;
        }
      } catch {
        // try next candidate
      }
    }
  }

  // Step 2: Get flight summary using fr24_id (richer metadata: runway, distance, category, takeoff time)
  let summary: Fr24FlightSummary | undefined;
  if (fr24Id) {
    try {
      const { data: summaryRes, quota } = await fr24Get<{ data: Fr24FlightSummary[] }>(
        "/flight-summary/full",
        { flight_ids: fr24Id }
      );
      if (quota) fr24Quota = { ...fr24Quota, ...quota };
      if (summaryRes.data && summaryRes.data.length > 0) {
        summary = summaryRes.data[0];
      }
    } catch {
      // Summary unavailable — non-fatal
    }
  }

  if (!live && !summary) return null;
  return { live, summary, quota: fr24Quota };
}

/**
 * Derive likely ICAO callsign candidates from an IATA flight number.
 * E.g. "QR1188" → ["QTR1188", "QR1188"]
 * The IATA→ICAO mapping covers the most common airlines tracked.
 */
function deriveCallsignCandidates(flightIata: string): string[] {
  // Common IATA (2-letter) → ICAO (3-letter) airline prefix mappings
  const IATA_TO_ICAO: Record<string, string> = {
    QR: 'QTR', EK: 'UAE', EY: 'ETD', SQ: 'SIA', BA: 'BAW',
    AA: 'AAL', UA: 'UAL', DL: 'DAL', LH: 'DLH', AF: 'AFR',
    KL: 'KLM', TK: 'THY', MH: 'MAS', AI: 'AIC', CX: 'CPA',
    JL: 'JAL', NH: 'ANA', OZ: 'AAR', KE: 'KAL', CI: 'CAL',
    MS: 'MSR', RJ: 'RJA', PK: 'PIA', WY: 'OMA', GF: 'GFA',
    ET: 'ETH', SA: 'SAA', KQ: 'KQA', SV: 'SVA', IR: 'IRA',
    FZ: 'FDB', WB: 'RBA', G9: 'ABY', XY: 'NAS', PC: 'PGT',
    FR: 'RYR', U2: 'EZY', W6: 'WZZ', VY: 'VLG', IB: 'IBE',
    AZ: 'AZA', SK: 'SAS', AY: 'FIN', LX: 'SWR', OS: 'AUA',
    AC: 'ACA', WS: 'WJA', TS: 'TSC', B6: 'JBU', WN: 'SWA',
    AS: 'ASA', F9: 'FFT', NK: 'NKS', G4: 'AAY', SY: 'SCX',
    CZ: 'CSN', MU: 'CES', CA: 'CCA', HU: 'CHH', '3U': 'CSC',
    MF: 'CXA', ZH: 'CSZ', SC: 'CDG', FM: 'CSH', KN: 'CUA',
    BI: 'RBA', MI: 'SLK', TR: 'TGW', IT: 'TAO', Z2: 'PAL',
    PR: 'PAL', GA: 'GIA', JQ: 'JST', VA: 'VOZ', QF: 'QFA',
    NZ: 'ANZ', TG: 'THA', VN: 'HVN', OD: 'MXD', MK: 'MAU',
    AT: 'RAM', CM: 'CMP', AV: 'AVA', LA: 'LAN', JJ: 'TAM',
    G3: 'GLO', AD: 'AZU', O6: 'ONE',
  };

  // Extract the 2-letter IATA prefix and numeric suffix
  const match = flightIata.match(/^([A-Z0-9]{2})([0-9]{1,4}[A-Z]?)$/);
  if (!match) return [flightIata];

  const [, iataPrefix, suffix] = match;
  const icaoPrefix = IATA_TO_ICAO[iataPrefix];

  const candidates: string[] = [];
  if (icaoPrefix) candidates.push(`${icaoPrefix}${suffix}`);
  // Also try the raw IATA number (some carriers use same code)
  candidates.push(flightIata);
  return candidates;
}
