import { desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, flightHistory, InsertFlightHistory } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ─── Flight History helpers ───────────────────────────────────────────────────

/**
 * Upsert a flight history record.
 * Uniqueness key: flightIata + scheduledDepUtc (same leg = same record).
 * If the flight was tracked before without a scheduledDepUtc, falls back to
 * inserting a new row so we never silently drop data.
 */
export async function saveFlightHistory(record: InsertFlightHistory): Promise<number | null> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot save flight history: database not available");
    return null;
  }
  try {
    // Build the update set (all columns except id, flightIata, trackedAt)
    const updateSet: Partial<InsertFlightHistory> = { ...record };
    delete (updateSet as Record<string, unknown>).id;
    delete (updateSet as Record<string, unknown>).trackedAt;

    const result = await db
      .insert(flightHistory)
      .values(record)
      .onDuplicateKeyUpdate({ set: updateSet });

    // MySQL returns insertId for new rows; for updates it may be 0
    return (result as unknown as { insertId: number }).insertId ?? null;
  } catch (error) {
    console.error("[Database] Failed to save flight history:", error);
    throw error;
  }
}

/** Return the most recent N flight history records (newest first). */
export async function getRecentFlights(limit = 10) {
  const db = await getDb();
  if (!db) return [];
  try {
    return await db
      .select()
      .from(flightHistory)
      .orderBy(desc(flightHistory.trackedAt))
      .limit(limit);
  } catch (error) {
    console.error("[Database] Failed to fetch recent flights:", error);
    return [];
  }
}

/** Return a single flight history record by flightIata (most recent match). */
export async function getFlightHistoryByIata(flightIata: string) {
  const db = await getDb();
  if (!db) return null;
  try {
    const rows = await db
      .select()
      .from(flightHistory)
      .where(eq(flightHistory.flightIata, flightIata))
      .orderBy(desc(flightHistory.trackedAt))
      .limit(1);
    return rows[0] ?? null;
  } catch (error) {
    console.error("[Database] Failed to fetch flight history:", error);
    return null;
  }
}

/** Return total count of tracked flights. */
export async function getFlightHistoryCount(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  try {
    const rows = await db.select({ count: sql<number>`count(*)` }).from(flightHistory);
    return Number(rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}
