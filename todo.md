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

## Updates (Round 8)
- [x] Fix date parsing: AirLabs returns space-separated datetimes ('2026-05-16 00:19') not ISO format — fixed in router with normDt() helper, 2 regression tests added
- [x] Verify Elapsed, Remaining, ETA UTC, Total Duration all populate correctly with live QR726 data (48 tests passing)

## Updates (Round 9)
- [x] Add prayer method selector dropdown (MWL, ISNA, Makkah, Egypt, Karachi) to the prayer panel
- [x] Persist selected method in localStorage so it survives page refresh
- [x] Pass selected method to the prayerTimes tRPC query
- [x] Add vitest tests for each calculation method (6 new tests, 54 total passing)

## Updates (Round 10)
- [x] Diagnose why live telemetry is not showing: ADS-B not broadcasting + /flight returns single object not array
- [x] Add estimated position fallback: great-circle interpolation using route % progress when no live ADS-B
- [x] Prayer times and weather now activate using estimated position when live GPS unavailable
- [x] Show estimated position badge in telemetry and prayer panels (54 tests passing)

## Updates (Round 11)
- [x] Create multi-stage Dockerfile (build + production Node image)
- [x] Create docker-compose.yml with app + MySQL services
- [x] Create .dockerignore
- [x] Create .env.example with all required environment variables documented
- [x] Write comprehensive README.md with full installation, Docker, and env var instructions
- [x] Initialize private GitHub repository and push all code

## Updates (Round 12 — Timezone Fix)
- [x] Investigate AirLabs time fields: AirLabs returns both dep_time (local) and dep_time_utc (UTC) fields
- [x] Confirmed AirLabs dep_time/arr_time are local airport time — no server-side conversion needed
- [x] Fixed normalisation: local fields use normaliseLocalDatetime() (no Z), UTC fields use normaliseUtcDatetime() (Z suffix)
- [x] Update schedule panel UI: show local time as primary, UTC as secondary label via LocalTimeDisplay component
- [x] Update identity bar / flight times strip to show correct local departure time
- [x] Add regression test: 'preserves local time fields without Z suffix' (55 tests passing)

## Updates (Round 13 — Local Time at Aircraft)
- [x] Add "Local Time at Aircraft" card to Flight Times panel using plane's longitude to compute UTC offset
- [x] Card ticks every second (live clock), shows timezone offset label (e.g. UTC+3)
- [x] Handles estimated position gracefully (shows UTC offset with '· est' suffix when position is estimated)

## Updates (Round 14 — Arrival Detection & API Quota)
- [x] Detect landed/arrived status from AirLabs (status === 'landed') and FR24 (flight_ended === true)
- [x] Stop all auto-refresh polling immediately when flight is detected as arrived
- [x] Show prominent arrival banner: "Flight Landed" with actual arrival time and baggage belt number
- [x] Freeze all panels in arrived state (no more refresh button activity)
- [x] Only restart polling when a new flight number is entered and searched
- [x] Extract AirLabs API quota fields from response body (request.key: limits_total, limits_by_month, limits_by_hour, limits_by_minute)
- [x] Extract FR24 API quota fields from response headers (x-fr24-credits-remaining, x-fr24-credits-consumed)
- [x] Display API quota (used / remaining calls) for AirLabs and FR24 in the UI footer
- [x] Add vitest tests for arrival detection logic (6 new tests, 61 total passing)
