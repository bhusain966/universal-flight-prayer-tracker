import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { fetchFlightData } from "../airlabs";
import { getPrayerTimesResult } from "../prayer";

export const flightRouter = router({
  /**
   * Look up a live flight by IATA flight number.
   * Returns merged telemetry + schedule data + airport details.
   */
  lookup: publicProcedure
    .input(z.object({ flightIata: z.string().min(2).max(10) }))
    .query(async ({ input }) => {
      try {
        const normalized = input.flightIata.trim().toUpperCase();
        const data = await fetchFlightData(normalized);
        return { success: true as const, data };
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
   * Used by the prayer module when the aircraft has live GPS coordinates.
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
