import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Stores a permanent record of every tracked flight once it lands.
 * One row per unique flight leg (flight_iata + scheduled departure UTC).
 * Upserted on save so re-tracking the same flight does not create duplicates.
 */
export const flightHistory = mysqlTable("flight_history", {
  id: int("id").autoincrement().primaryKey(),

  // Flight identification
  flightIata:   varchar("flightIata",   { length: 16 }).notNull(),
  flightIcao:   varchar("flightIcao",   { length: 16 }),
  airlineName:  varchar("airlineName",  { length: 128 }),
  airlineIata:  varchar("airlineIata",  { length: 8 }),
  aircraft:     varchar("aircraft",     { length: 64 }),  // e.g. "Airbus A350-1000"
  regNumber:    varchar("regNumber",    { length: 16 }),

  // Route
  depIata:      varchar("depIata",      { length: 8 }),
  depCity:      varchar("depCity",      { length: 64 }),
  arrIata:      varchar("arrIata",      { length: 8 }),
  arrCity:      varchar("arrCity",      { length: 64 }),

  // Schedule vs actual times (stored as UTC ISO strings for portability)
  scheduledDepUtc:  varchar("scheduledDepUtc",  { length: 32 }),
  actualDepUtc:     varchar("actualDepUtc",     { length: 32 }),
  scheduledArrUtc:  varchar("scheduledArrUtc",  { length: 32 }),
  actualArrUtc:     varchar("actualArrUtc",     { length: 32 }),

  // Local display times (airport local timezone, no Z)
  scheduledDepLocal: varchar("scheduledDepLocal", { length: 32 }),
  actualDepLocal:    varchar("actualDepLocal",    { length: 32 }),
  scheduledArrLocal: varchar("scheduledArrLocal", { length: 32 }),
  actualArrLocal:    varchar("actualArrLocal",    { length: 32 }),

  // Delays (positive = late, negative = early, in minutes)
  depDelayMin:  int("depDelayMin"),
  arrDelayMin:  int("arrDelayMin"),

  // Flight metrics
  durationMin:      int("durationMin"),       // scheduled duration in minutes
  actualDurationMin: int("actualDurationMin"), // actual flight time in minutes
  distanceKm:       int("distanceKm"),         // great-circle distance in km

  // Arrival info
  baggageBelt:  varchar("baggageBelt",  { length: 16 }),
  arrTerminal:  varchar("arrTerminal",  { length: 16 }),
  arrGate:      varchar("arrGate",      { length: 16 }),
  runwayLanded: varchar("runwayLanded", { length: 16 }),

  // Prayer summary (JSON array of { name, timeUtc } objects)
  prayerCount:  int("prayerCount").default(0),
  prayerNames:  text("prayerNames"),   // JSON: ["Fajr", "Dhuhr", ...]
  prayerDetails: text("prayerDetails"), // JSON: full prayer times array

  // Metadata
  trackedAt:    timestamp("trackedAt").defaultNow().notNull(),
  updatedAt:    timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type FlightHistory = typeof flightHistory.$inferSelect;
export type InsertFlightHistory = typeof flightHistory.$inferInsert;