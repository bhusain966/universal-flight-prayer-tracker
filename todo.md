# Universal Flight Prayer Tracker — TODO

## Core Features
- [x] Store AirLabs API key as server-side secret (never exposed to browser)
- [x] Server-side tRPC router: fetch live flight data from AirLabs API
- [x] Server-side prayer calculation logic using aircraft GPS coordinates
- [x] Flight number search input (IATA format, e.g. QR726)
- [x] Real-time flight status panel (scheduled vs actual times, delay, origin/destination, terminal/gate)
- [x] Live map with aircraft position marker and route arc (origin → destination)
- [x] Telemetry panel (lat/lng, altitude, ground speed, heading, vertical speed)
- [x] Aircraft info panel (type/model, registration, airline, IATA/ICAO codes, engine, year built)
- [x] Prayer times module (countdown to next prayer + all 5 prayer times based on live GPS)
- [x] Auto-refresh every 30 seconds in background
- [x] Graceful error states (flight not found, not departed, data unavailable)
- [x] Loading skeletons during data fetch
- [x] Dark-themed aviation-style UI with professional dashboard layout

## Design
- [x] Dark theme with aviation-style color palette (deep navy, amber accents, green status indicators)
- [x] Responsive grid layout for all panels
- [x] Consistent typography and spacing

## Testing
- [x] Vitest unit tests for prayer calculation logic (12 tests passing)
- [x] Vitest unit test for auth logout (1 test passing)

## Updates (Round 2)
- [x] Replace Google Maps with Leaflet + dark tile layer (no Google Maps dependency)
- [x] Change auto-refresh interval from 30 seconds to 15 minutes (rate limit protection)
- [x] Display ETA field (minutes remaining) from AirLabs in the schedule panel
- [x] Display UTC server time from AirLabs response

## Updates (Round 3)
- [x] Store FR24 API key as server-side secret
- [x] Explore FR24 API endpoints and identify available fields (squawk, callsign, runway, distance, category, ETA, ADS-B source, hex)
- [x] Integrate FR24 as secondary data source for richer telemetry
- [x] Display squawk, callsign, ICAO hex, ADS-B source, runway, distance flown, category from FR24 (wind/temp not available in FR24 API)
- [x] Add refresh countdown timer (circular ring + mm:ss) + last-refreshed indicator to header

## Updates (Round 4)
- [x] Make flight route arc clearly visible on Leaflet dark map (bright color, thick stroke, dashed completed portion vs remaining)

## Updates (Round 5)
- [x] Fix geodesic route arc — no sharp turns, correct antimeridian wrapping (longitude unwrapping, 2 new tests)
- [x] Add elapsed flight time (time since actual departure)
- [x] Add remaining flight time (ETA minus now)
- [x] Add estimated arrival time (ETA) prominently in schedule panel (34 tests total, all passing)

## Updates (Round 6)
- [x] Create a dedicated, clearly visible "Flight Times" section with Elapsed, Remaining, ETA, Total duration as large prominent cards
- [x] Full mobile-first layout rewrite — all panels readable on phone screen, no overflow, no hidden data
- [x] Fix route arc trace — fitBounds now uses full arc points array (not just 3 endpoints), aircraft insertion point uses unwrapped longitude

## Updates (Round 7)
- [x] Add Open-Meteo wind/temperature server-side integration (wind speed, wind direction, temperature at altitude)
- [x] Display wind & temperature panel in the flight dashboard
- [x] Add URL deep linking: /track/:flightIata route that auto-loads the flight on open
- [x] Update search to push URL when flight is searched
- [x] Shareable URL works on direct open (bookmarkable)
