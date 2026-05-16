import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { fetchFlightData } from "../airlabs";
import { fetchFr24FlightData } from "../fr24";
import { getPrayerTimesResult } from "../prayer";
import { fetchWeatherAtPosition } from "../weather";

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

        // Fetch weather only if we have a live position
        const flight = data?.flight;
        const weather =
          flight?.lat != null && flight?.lng != null
            ? await fetchWeatherAtPosition(
                flight.lat,
                flight.lng,
                flight.alt ?? 35000,
              ).catch(() => null)
            : null;

        return {
          success: true as const,
          data,
          weather,
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
          .enum(["MWL", "ISNA", "Egypt", "Makkah", "Karachi", "Tehran", "Jafari"])
          .optional()
          .default("MWL"),
      })
    )
    .query(({ input }) => {
      const result = getPrayerTimesResult(input.lat, input.lng, input.method);
      return result;
    }),
});
