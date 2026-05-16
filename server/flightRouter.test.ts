import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock AirLabs — no real HTTP calls
vi.mock("./airlabs", () => ({
  fetchFlightData: vi.fn(),
}));

// Mock FR24 — no real HTTP calls
vi.mock("./fr24", () => ({
  fetchFr24FlightData: vi.fn(),
}));

import { fetchFlightData } from "./airlabs";
import { fetchFr24FlightData } from "./fr24";

const mockFetchFlightData = vi.mocked(fetchFlightData);
const mockFetchFr24 = vi.mocked(fetchFr24FlightData);

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

const MOCK_FLIGHT_DATA = {
  flight: {
    flight_iata: "QR726",
    flight_icao: "QTR726",
    airline_iata: "QR",
    airline_icao: "QTR",
    airline_name: "Qatar Airways",
    dep_iata: "ORD",
    arr_iata: "DOH",
    dep_time_utc: "2026-05-16T00:20:00Z",
    arr_time_utc: "2026-05-16T14:15:00Z",
    status: "en-route",
    lat: 46.71,
    lng: -67.87,
    alt: 10688,
    speed: 833,
    dir: 75,
    v_speed: 0,
    reg_number: "A7-AND",
    aircraft_icao: "A35K",
    model: "Airbus A350-1000",
    manufacturer: "AIRBUS",
    flag: "QA",
  },
  depAirport: {
    iata_code: "ORD",
    name: "Chicago O'Hare International Airport",
    city: "Chicago",
    lat: 41.9742,
    lng: -87.9073,
  },
  arrAirport: {
    iata_code: "DOH",
    name: "Hamad International Airport",
    city: "Doha",
    lat: 25.2731,
    lng: 51.6081,
  },
};

const MOCK_FR24_DATA = {
  live: {
    fr24_id: "3fb72bad",
    flight: "QR726",
    callsign: "QTR87Q",
    lat: 46.71,
    lon: -67.87,
    track: 75,
    alt: 35000,
    gspeed: 468,
    vspeed: 0,
    squawk: "6521",
    timestamp: "2026-05-16T03:04:11Z",
    source: "ADSB",
    hex: "06A120",
    type: "A35K",
    reg: "A7-AND",
    eta: "2026-05-16T14:02:40Z",
  },
  summary: {
    fr24_id: "3fb72bad",
    flight: "QR726",
    callsign: "QTR87Q",
    type: "A35K",
    reg: "A7-AND",
    orig_iata: "ORD",
    dest_iata: "DOH",
    datetime_takeoff: "2026-05-16T00:46:37Z",
    runway_takeoff: "28R",
    actual_distance: 2040.65,
    category: "Passenger",
    flight_ended: false,
  },
};

describe("flight.lookup procedure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns merged AirLabs + FR24 data on success", async () => {
    mockFetchFlightData.mockResolvedValueOnce(MOCK_FLIGHT_DATA);
    mockFetchFr24.mockResolvedValueOnce(MOCK_FR24_DATA);

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.flight.lookup({ flightIata: "QR726" });

    expect(result.success).toBe(true);
    expect(result.data?.flight.flight_iata).toBe("QR726");
    expect(result.data?.flight.airline_name).toBe("Qatar Airways");
    // FR24 enrichment
    expect(result.fr24?.callsign).toBe("QTR87Q");
    expect(result.fr24?.squawk).toBe("6521");
    expect(result.fr24?.runwayTakeoff).toBe("28R");
    expect(result.fr24?.actualDistance).toBeCloseTo(2040.65);
    expect(result.fr24?.category).toBe("Passenger");
    expect(result.fr24?.etaIso).toBe("2026-05-16T14:02:40Z");
    expect(result.fr24?.fr24Id).toBe("3fb72bad");
  });

  it("normalises lowercase flight number to uppercase", async () => {
    mockFetchFlightData.mockResolvedValueOnce(MOCK_FLIGHT_DATA);
    mockFetchFr24.mockResolvedValueOnce(null);

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.flight.lookup({ flightIata: "qr726" });

    expect(mockFetchFlightData).toHaveBeenCalledWith("QR726");
    expect(result.success).toBe(true);
  });

  it("returns fr24: null when FR24 returns null (non-fatal)", async () => {
    mockFetchFlightData.mockResolvedValueOnce(MOCK_FLIGHT_DATA);
    mockFetchFr24.mockResolvedValueOnce(null);

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.flight.lookup({ flightIata: "QR726" });

    expect(result.success).toBe(true);
    expect(result.fr24).toBeNull();
  });

  it("returns fr24: null when FR24 throws (non-fatal — AirLabs is primary)", async () => {
    mockFetchFlightData.mockResolvedValueOnce(MOCK_FLIGHT_DATA);
    mockFetchFr24.mockRejectedValueOnce(new Error("FR24 network error"));

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.flight.lookup({ flightIata: "QR726" });

    expect(result.success).toBe(true);
    expect(result.fr24).toBeNull();
  });

  it("throws NOT_FOUND when AirLabs returns no data", async () => {
    mockFetchFlightData.mockRejectedValueOnce(
      new Error("Flight QR999 not found. Please check the flight number and try again.")
    );
    mockFetchFr24.mockResolvedValueOnce(null);

    const caller = appRouter.createCaller(createPublicContext());
    await expect(caller.flight.lookup({ flightIata: "QR999" })).rejects.toThrow(
      "not found"
    );
  });

  it("throws on empty flight number", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(caller.flight.lookup({ flightIata: "" })).rejects.toThrow();
  });

  it("passes airport data through correctly", async () => {
    mockFetchFlightData.mockResolvedValueOnce(MOCK_FLIGHT_DATA);
    mockFetchFr24.mockResolvedValueOnce(null);

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.flight.lookup({ flightIata: "QR726" });

    expect(result.data?.depAirport?.iata_code).toBe("ORD");
    expect(result.data?.arrAirport?.iata_code).toBe("DOH");
    expect(result.data?.depAirport?.lat).toBe(41.9742);
  });
});

describe("flight.prayerTimes procedure", () => {
  it("returns prayer times for a valid coordinate", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.flight.prayerTimes({ lat: 46.71, lng: -67.87 });

    expect(result.times).toHaveLength(6);
    expect(result.lat).toBe(46.71);
    expect(result.lng).toBe(-67.87);
  });

  it("identifies a next prayer", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.flight.prayerTimes({ lat: 21.39, lng: 39.86 });

    expect(result.nextPrayer).not.toBeNull();
  });

  it("throws on invalid coordinates", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(
      caller.flight.prayerTimes({ lat: 999, lng: 999 })
    ).rejects.toThrow();
  });
});

describe("AirLabs datetime normalisation regression", () => {
  it("passes through ISO timestamps unchanged", async () => {
    // Simulate AirLabs returning already-ISO timestamps (should not break)
    mockFetchFlightData.mockResolvedValueOnce({
      ...MOCK_FLIGHT_DATA,
      flight: {
        ...MOCK_FLIGHT_DATA.flight,
        dep_actual_utc: "2026-05-16T00:19:00Z",
        arr_estimated_utc: "2026-05-16T13:35:00Z",
      },
    });
    mockFetchFr24.mockResolvedValueOnce(null);

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.flight.lookup({ flightIata: "QR726" });

    // ISO timestamps should be preserved as-is
    expect(result.data?.flight.dep_actual_utc).toBe("2026-05-16T00:19:00Z");
    expect(result.data?.flight.arr_estimated_utc).toBe("2026-05-16T13:35:00Z");
  });

  it("normalises AirLabs space-separated UTC datetimes to ISO 8601", async () => {
    // Simulate real AirLabs response with space-separated datetimes
    mockFetchFlightData.mockResolvedValueOnce({
      ...MOCK_FLIGHT_DATA,
      flight: {
        ...MOCK_FLIGHT_DATA.flight,
        dep_actual_utc: "2026-05-16 00:19",
        dep_time_utc: "2026-05-16 00:20",
        arr_estimated_utc: "2026-05-16 13:35",
        arr_time_utc: "2026-05-16 14:15",
      },
    });
    mockFetchFr24.mockResolvedValueOnce(null);

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.flight.lookup({ flightIata: "QR726" });

    // Space-separated strings should be converted to ISO 8601
    expect(result.data?.flight.dep_actual_utc).toBe("2026-05-16T00:19Z");
    expect(result.data?.flight.dep_time_utc).toBe("2026-05-16T00:20Z");
    expect(result.data?.flight.arr_estimated_utc).toBe("2026-05-16T13:35Z");
    expect(result.data?.flight.arr_time_utc).toBe("2026-05-16T14:15Z");

    // Verify the normalised strings parse correctly as UTC dates
    const dep = new Date(result.data?.flight.dep_actual_utc!);
    expect(dep.getUTCHours()).toBe(0);
    expect(dep.getUTCMinutes()).toBe(19);

    const arr = new Date(result.data?.flight.arr_estimated_utc!);
    expect(arr.getUTCHours()).toBe(13);
    expect(arr.getUTCMinutes()).toBe(35);
  });
});
