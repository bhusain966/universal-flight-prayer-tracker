import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the airlabs module so tests don't make real HTTP calls
vi.mock("./airlabs", () => ({
  fetchFlightData: vi.fn(),
}));

import { fetchFlightData } from "./airlabs";
const mockFetchFlightData = vi.mocked(fetchFlightData);

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

describe("flight.lookup procedure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns flight data for a valid flight number", async () => {
    mockFetchFlightData.mockResolvedValueOnce(MOCK_FLIGHT_DATA);

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.flight.lookup({ flightIata: "QR726" });

    expect(result.success).toBe(true);
    expect(result.data?.flight.flight_iata).toBe("QR726");
    expect(result.data?.flight.airline_name).toBe("Qatar Airways");
    expect(result.data?.flight.lat).toBe(46.71);
  });

  it("normalises lowercase flight number to uppercase", async () => {
    mockFetchFlightData.mockResolvedValueOnce(MOCK_FLIGHT_DATA);

    const caller = appRouter.createCaller(createPublicContext());
    const result = await caller.flight.lookup({ flightIata: "qr726" });

    expect(mockFetchFlightData).toHaveBeenCalledWith("QR726");
    expect(result.success).toBe(true);
  });

  it("returns error when flight is not found", async () => {
    mockFetchFlightData.mockRejectedValueOnce(
      new Error("Flight QR999 not found. Please check the flight number and try again.")
    );

    const caller = appRouter.createCaller(createPublicContext());
    await expect(caller.flight.lookup({ flightIata: "QR999" })).rejects.toThrow(
      "not found"
    );
  });

  it("throws on empty flight number", async () => {
    const caller = appRouter.createCaller(createPublicContext());
    await expect(caller.flight.lookup({ flightIata: "" })).rejects.toThrow();
  });

  it("returns dep and arr airport data", async () => {
    mockFetchFlightData.mockResolvedValueOnce(MOCK_FLIGHT_DATA);

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
