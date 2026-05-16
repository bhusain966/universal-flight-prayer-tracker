import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { fetchFlightData } from "../airlabs";
import { fetchFr24FlightData, fetchFr24FlightByIata } from "../fr24";
import { getPrayerTimesResult, calculatePrayerTimes } from "../prayer";
import { fetchWeatherAtPosition } from "../weather";
import { saveFlightHistory, getRecentFlights, getFlightHistoryByIata, getFlightHistoryPaginated, addUpcomingTrip, getUpcomingTrips, deleteUpcomingTrip } from "../db";
import { makeRequest } from "../_core/map";

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

        // Determine if flight has arrived:
        // Primary: AirLabs status === 'landed'
        // Secondary: FR24 flight_ended === true
        const isLanded =
          data?.flight?.status?.toLowerCase() === "landed" ||
          fr24?.summary?.flight_ended === true;

        return {
          success: true as const,
          data,
          weather,
          positionIsEstimated,
          isLanded,
          apiQuota: {
            airlabs: data?.airlabsQuota ?? null,
            fr24: fr24?.quota ?? null,
          },
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
        if (message.startsWith('AIRLABS_QUOTA_EXCEEDED')) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: 'AirLabs API monthly quota has been exceeded. Quota resets on the 1st of next month. You can still add this flight to Upcoming Trips and tracking will resume when the quota resets.',
          });
        }
        if (message.startsWith('FLIGHT_NOT_YET_ACTIVE')) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: message.replace('FLIGHT_NOT_YET_ACTIVE: ', ''),
          });
        }
        throw new TRPCError({
          code: "NOT_FOUND",
          message,
        });
      }
    }),

  /**
   * Save a completed flight to the permanent history database.
   * Called from the frontend when isLanded becomes true.
   */
  saveHistory: publicProcedure
    .input(
      z.object({
        flightIata:        z.string(),
        flightIcao:        z.string().optional(),
        airlineName:       z.string().optional(),
        airlineIata:       z.string().optional(),
        aircraft:          z.string().optional(),
        regNumber:         z.string().optional(),
        depIata:           z.string().optional(),
        depCity:           z.string().optional(),
        arrIata:           z.string().optional(),
        arrCity:           z.string().optional(),
        scheduledDepUtc:   z.string().optional(),
        actualDepUtc:      z.string().optional(),
        scheduledArrUtc:   z.string().optional(),
        actualArrUtc:      z.string().optional(),
        scheduledDepLocal: z.string().optional(),
        actualDepLocal:    z.string().optional(),
        scheduledArrLocal: z.string().optional(),
        actualArrLocal:    z.string().optional(),
        depDelayMin:       z.number().int().optional(),
        arrDelayMin:       z.number().int().optional(),
        durationMin:       z.number().int().optional(),
        actualDurationMin: z.number().int().optional(),
        distanceKm:        z.number().int().optional(),
        baggageBelt:       z.string().optional(),
        arrTerminal:       z.string().optional(),
        arrGate:           z.string().optional(),
        runwayLanded:      z.string().optional(),
        prayerCount:       z.number().int().optional(),
        prayerNames:       z.string().optional(), // JSON string
        prayerDetails:     z.string().optional(), // JSON string
      })
    )
    .mutation(async ({ input }) => {
      try {
        const id = await saveFlightHistory(input);
        return { success: true, id };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Failed to save flight history";
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
      }
    }),

  /**
   * Return the most recent N tracked flights (for chips + history panel).
   */
  recentFlights: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ input }) => {
      const rows = await getRecentFlights(input.limit);
      return rows;
    }),

  /**
   * Return the most recent history record for a specific flight IATA.
   * Used to show a previous arrival summary when the user re-opens a flight.
   */
  flightHistoryByIata: publicProcedure
    .input(z.object({ flightIata: z.string() }))
    .query(async ({ input }) => {
      const row = await getFlightHistoryByIata(input.flightIata.trim().toUpperCase());
      return row ?? null;
    }),

  /**
   * Resolve the exact DST-aware timezone for a lat/lng using the Google Maps
   * Timezone API (proxied through the Manus map helper).
   * Returns { timeZoneId, timeZoneName, rawOffset, dstOffset, totalOffsetSec }.
   */
  timezone: publicProcedure
    .input(z.object({ lat: z.number(), lng: z.number() }))
    .query(async ({ input }) => {
      try {
        const timestamp = Math.floor(Date.now() / 1000);
        // Use the Manus Maps proxy: makeRequest(endpoint, params)
        const res = await makeRequest<{
          status: string;
          timeZoneId: string;
          timeZoneName: string;
          rawOffset: number;
          dstOffset: number;
          errorMessage?: string;
        }>("/maps/api/timezone/json", {
          location: `${input.lat},${input.lng}`,
          timestamp,
        });
        if (res.status !== "OK") {
          throw new Error(res.errorMessage ?? `Timezone API error: ${res.status}`);
        }
        return {
          timeZoneId:     res.timeZoneId,
          timeZoneName:   res.timeZoneName,
          rawOffset:      res.rawOffset,
          dstOffset:      res.dstOffset,
          totalOffsetSec: res.rawOffset + res.dstOffset,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Timezone lookup failed";
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: msg });
      }
    }),

  /**
   * Compute which prayers occurred during a flight window.
   * Takes dep/arr UTC ISO strings + a representative lat/lng (e.g. midpoint).
   * Returns prayerCount, prayerNames (JSON array), and prayerDetails (JSON array of {name, utc}).
   */
  flightPrayerSummary: publicProcedure
    .input(
      z.object({
        depUtc:  z.string(),
        arrUtc:  z.string(),
        lat:     z.number().min(-90).max(90),
        lng:     z.number().min(-180).max(180),
        method:  z.enum(["MWL", "ISNA", "Egypt", "Makkah", "Karachi"]).optional().default("MWL"),
      })
    )
    .query(({ input }) => {
      const depMs = new Date(input.depUtc).getTime();
      const arrMs = new Date(input.arrUtc).getTime();
      if (isNaN(depMs) || isNaN(arrMs) || arrMs <= depMs) {
        return { prayerCount: 0, prayerNames: "[]", prayerDetails: "[]" };
      }

      const PRAYER_KEYS = ["fajr", "sunrise", "dhuhr", "asr", "maghrib", "isha"] as const;
      const PRAYER_LABELS: Record<string, string> = {
        fajr: "Fajr", sunrise: "Sunrise", dhuhr: "Dhuhr", asr: "Asr", maghrib: "Maghrib", isha: "Isha",
      };

      // Cover all UTC days that overlap with the flight window
      const dayStart = new Date(depMs);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(arrMs);
      dayEnd.setUTCHours(0, 0, 0, 0);

      const prayersDuring: { name: string; utc: string }[] = [];
      const cursor = new Date(dayStart);
      while (cursor.getTime() <= dayEnd.getTime()) {
        const times = calculatePrayerTimes(cursor, input.lat, input.lng, input.method);
        for (const key of PRAYER_KEYS) {
          const t = times[key].getTime();
          if (t >= depMs && t <= arrMs) {
            prayersDuring.push({ name: PRAYER_LABELS[key] ?? key, utc: times[key].toISOString() });
          }
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }

      return {
        prayerCount:   prayersDuring.length,
        prayerNames:   JSON.stringify(prayersDuring.map(p => p.name)),
        prayerDetails: JSON.stringify(prayersDuring),
      };
    }),

  /**
   * Return a paginated, sortable list of all tracked flights.
   */
  historyList: publicProcedure
    .input(
      z.object({
        page:     z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(20),
        sortBy:   z.enum(["trackedAt", "depIata", "arrIata", "prayerCount", "arrDelayMin", "distanceKm", "actualDurationMin"]).default("trackedAt"),
        order:    z.enum(["asc", "desc"]).default("desc"),
      })
    )
    .query(async ({ input }) => {
      const { rows, total } = await getFlightHistoryPaginated(
        input.page,
        input.pageSize,
        input.sortBy,
        input.order,
      );
      return { rows, total, page: input.page, pageSize: input.pageSize };
    }),

  /**
   * Add a new upcoming trip.
   */
  addTrip: publicProcedure
    .input(
      z.object({
        flightIata:        z.string().min(2).max(16),
        airlineName:       z.string().optional(),
        depIata:           z.string().optional(),
        depCity:           z.string().optional(),
        arrIata:           z.string().optional(),
        arrCity:           z.string().optional(),
        scheduledDepUtc:   z.string(),   // ISO UTC string
        scheduledDepLocal: z.string().optional(),
        scheduledArrLocal: z.string().optional(),
        notes:             z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const id = await addUpcomingTrip({
        flightIata:        input.flightIata.toUpperCase().trim(),
        airlineName:       input.airlineName ?? null,
        depIata:           input.depIata ?? null,
        depCity:           input.depCity ?? null,
        arrIata:           input.arrIata ?? null,
        arrCity:           input.arrCity ?? null,
        scheduledDepUtc:   input.scheduledDepUtc,
        scheduledDepLocal: input.scheduledDepLocal ?? null,
        scheduledArrLocal: input.scheduledArrLocal ?? null,
        notes:             input.notes ?? null,
      });
      return { id };
    }),

  /**
   * List all upcoming trips ordered by scheduled departure.
   */
  listTrips: publicProcedure
    .query(async () => {
      return await getUpcomingTrips();
    }),

  /**
   * Delete an upcoming trip by id.
   */
  deleteTrip: publicProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input }) => {
      await deleteUpcomingTrip(input.id);
      return { success: true };
    }),

  /**
   * Fetch flight data directly from FR24 (no AirLabs dependency).
   * Used as a fallback when AirLabs quota is exhausted.
   * Searches the last 24 hours for the given flight IATA.
   */
  fr24Lookup: publicProcedure
    .input(z.object({
      flightIata: z.string().min(2).max(8),
      hoursBack: z.number().int().min(1).max(72).optional().default(24),
    }))
    .query(async ({ input }) => {
      const result = await fetchFr24FlightByIata(input.flightIata, input.hoursBack);
      if (!result) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Flight ${input.flightIata.toUpperCase()} not found in FR24 within the last ${input.hoursBack} hours.`,
        });
      }
      const { summary, quota } = result;
      const isLanded = !!summary.datetime_landed || summary.flight_ended === true;
      return {
        flightIata: summary.flight ?? input.flightIata.toUpperCase(),
        callsign: summary.callsign,
        airline: summary.operating_as,
        aircraft: summary.type,
        registration: summary.reg,
        depIata: summary.orig_iata,
        arrIata: summary.dest_iata_actual ?? summary.dest_iata,
        depIcao: summary.orig_icao,
        arrIcao: summary.dest_icao_actual ?? summary.dest_icao,
        datetimeTakeoff: summary.datetime_takeoff ?? null,
        datetimeLanded: summary.datetime_landed ?? null,
        runwayTakeoff: summary.runway_takeoff ?? null,
        runwayLanded: summary.runway_landed ?? null,
        flightTimeMinutes: summary.flight_time ?? null,
        actualDistanceKm: summary.actual_distance ? Math.round(summary.actual_distance) : null,
        circleDistanceKm: summary.circle_distance ? Math.round(summary.circle_distance) : null,
        category: summary.category,
        firstSeen: summary.first_seen ?? null,
        lastSeen: summary.last_seen ?? null,
        flightEnded: summary.flight_ended ?? false,
        isLanded,
        fr24Quota: quota,
      };
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
