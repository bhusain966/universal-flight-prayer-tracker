import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { fetchFlightData } from "../airlabs";
import { fetchFr24FlightData } from "../fr24";
import { getPrayerTimesResult } from "../prayer";
import { fetchWeatherAtPosition } from "../weather";

/**
 * Interpolate a position along the great-circle arc between two points.
 * fraction = 0 → departure, fraction = 1 → arrival.
 * Uses spherical linear interpolation (slerp) on the unit sphere.
 */
function interpolateGreatCircle(
  depLat: number, depLng: number,
  arrLat: number, arrLng: number,
  fraction: number,
): { lat: number; lng: number } {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;

  const lat1 = toRad(depLat), lng1 = toRad(depLng);
  const lat2 = toRad(arrLat), lng2 = toRad(arrLng);

  // Convert to Cartesian unit vectors
  const x1 = Math.cos(lat1) * Math.cos(lng1);
  const y1 = Math.cos(lat1) * Math.sin(lng1);
  const z1 = Math.sin(lat1);
  const x2 = Math.cos(lat2) * Math.cos(lng2);
  const y2 = Math.cos(lat2) * Math.sin(lng2);
  const z2 = Math.sin(lat2);

  // Angle between the two vectors
  const dot = Math.min(1, Math.max(-1, x1 * x2 + y1 * y2 + z1 * z2));
  const omega = Math.acos(dot);

  let xi: number, yi: number, zi: number;
  if (Math.abs(omega) < 1e-10) {
    // Points are coincident
    xi = x1; yi = y1; zi = z1;
  } else {
    const sinOmega = Math.sin(omega);
    const a = Math.sin((1 - fraction) * omega) / sinOmega;
    const b = Math.sin(fraction * omega) / sinOmega;
    xi = a * x1 + b * x2;
    yi = a * y1 + b * y2;
    zi = a * z1 + b * z2;
  }

  return {
    lat: Math.round(toDeg(Math.asin(zi)) * 10000) / 10000,
    lng: Math.round(toDeg(Math.atan2(yi, xi)) * 10000) / 10000,
  };
}

/**
 * Normalise an AirLabs UTC datetime string to ISO 8601 with Z suffix.
 * Only for _utc fields.
 */
function normDt(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  if (raw.includes("T")) return raw; // already ISO
  const n = raw.replace(" ", "T") + "Z";
  return isNaN(new Date(n).getTime()) ? raw : n;
}

/**
 * Preserve an AirLabs LOCAL datetime string (dep_time, arr_time, etc.).
 * Converts space to T for consistent regex extraction but does NOT append Z.
 */
function normLocal(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  if (raw.includes(" ")) return raw.replace(" ", "T");
  return raw;
}

export const flightRouter = router({
  /**
   * Look up a live flight by IATA flight number.
   * Returns merged telemetry + schedule data from AirLabs + FR24 enrichment.
   */
  lookup: publicProcedure
    .input(z.object({ flightIata: z.string().min(2).max(10) }))
    .query(async ({ input }) => {
      try {
        const normalized = input.flightIata.trim().toUpperCase();

        // Fetch AirLabs (primary), FR24 (enrichment) in parallel
        const [airlabsData, fr24Data] = await Promise.allSettled([
          fetchFlightData(normalized),
          fetchFr24FlightData(normalized),
        ]);

        if (airlabsData.status === "rejected") {
          throw airlabsData.reason;
        }

        const data = airlabsData.value;
        const fr24 = fr24Data.status === "fulfilled" ? fr24Data.value : null;

        const flight = data?.flight;
        const depAirport = data?.depAirport;
        const arrAirport = data?.arrAirport;

        // Determine best available position:
        // 1. Live ADS-B from /flights (most accurate)
        // 2. Estimated position via great-circle interpolation using route % progress
        let effectiveLat = flight?.lat;
        let effectiveLng = flight?.lng;
        let positionIsEstimated = false;

        if (
          (effectiveLat == null || effectiveLng == null) &&
          depAirport?.lat != null && depAirport?.lng != null &&
          arrAirport?.lat != null && arrAirport?.lng != null &&
          flight?.percent != null && flight.percent > 0 && flight.percent < 100
        ) {
          const est = interpolateGreatCircle(
            depAirport.lat!, depAirport.lng!,
            arrAirport.lat!, arrAirport.lng!,
            flight.percent / 100,
          );
          effectiveLat = est.lat;
          effectiveLng = est.lng;
          positionIsEstimated = true;
          // Inject estimated position into flight object so frontend can use it
          flight.lat = est.lat;
          flight.lng = est.lng;
        }

        // Fetch weather using best available position (live or estimated)
        const weather =
          effectiveLat != null && effectiveLng != null
            ? await fetchWeatherAtPosition(
                effectiveLat,
                effectiveLng,
                flight?.alt ?? 35000,
              ).catch(() => null)
            : null;

        // Normalise datetime strings in the router response.
        // UTC fields get Z suffix; local fields are kept as local time strings.
        if (data?.flight) {
          const f = data.flight;
          // UTC fields — normalise to ISO 8601 with Z
          f.dep_time_utc = normDt(f.dep_time_utc);
          f.dep_actual_utc = normDt(f.dep_actual_utc);
          f.dep_estimated_utc = normDt(f.dep_estimated_utc);
          f.arr_time_utc = normDt(f.arr_time_utc);
          f.arr_actual_utc = normDt(f.arr_actual_utc);
          f.arr_estimated_utc = normDt(f.arr_estimated_utc);
          // Local fields — preserve as local time (no Z suffix)
          f.dep_time = normLocal(f.dep_time);
          f.dep_actual = normLocal(f.dep_actual);
          f.dep_estimated = normLocal(f.dep_estimated);
          f.arr_time = normLocal(f.arr_time);
          f.arr_actual = normLocal(f.arr_actual);
          f.arr_estimated = normLocal(f.arr_estimated);
        }

        return {
          success: true as const,
          data,
          weather,
          positionIsEstimated,
          fr24: fr24
            ? {
                callsign: fr24.live?.callsign,
                squawk: fr24.live?.squawk,
                source: fr24.live?.source,
                hex: fr24.live?.hex,
                etaIso: fr24.live?.eta,
                runwayTakeoff: fr24.summary?.runway_takeoff,
                runwayLanded: fr24.summary?.runway_landed,
                datetimeTakeoff: fr24.summary?.datetime_takeoff,
                datetimeLanded: fr24.summary?.datetime_landed,
                actualDistance: fr24.summary?.actual_distance,
                category: fr24.summary?.category,
                flightEnded: fr24.summary?.flight_ended,
                fr24Id: fr24.live?.fr24_id ?? fr24.summary?.fr24_id,
              }
            : null,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to fetch flight data";
        throw new TRPCError({
          code: "NOT_FOUND",
          message,
        });
      }
    }),

  /**
   * Calculate prayer times for a given lat/lng position.
   */
  prayerTimes: publicProcedure
    .input(
      z.object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        method: z
          .enum(["MWL", "ISNA", "Egypt", "Makkah", "Karachi"])
          .optional()
          .default("MWL"),
      })
    )
    .query(({ input }) => {
      const result = getPrayerTimesResult(input.lat, input.lng, input.method);
      return result;
    }),
});
