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

## Updates (Round 15 — Flight History & Exact Timezone)

### Flight History & Arrival Summary
- [x] Design flight_history DB table: flight_iata, airline, route, scheduled/actual dep+arr times, delay, distance, duration, prayer_count, prayer_names JSON, baggage_belt, terminal, gate, runway, aircraft, created_at
- [x] Generate Drizzle migration and apply via webdev_execute_sql
- [x] Add server/db helpers: saveFlightHistory(), getRecentFlights(), getFlightHistory()
- [x] Add tRPC procedures: flight.saveHistory, flight.recentFlights, flight.flightHistoryByIata
- [x] Compute arrival summary on frontend when isLanded becomes true: gather all fields, call flight.saveHistory
- [x] Show recent flight chips (last 5) below search box — click to reload flight
- [x] Show full arrival summary card immediately when flight lands (Arrival Summary panel with all stats)
- [x] Show history table on home/empty state page listing all past flights with summaries
- [x] Prevent duplicate saves for the same flight (upsert by flight_iata + dep_time_utc)

### Exact Timezone for Local at Aircraft
- [x] Add a tRPC procedure flight.timezone that calls Google Maps Timezone API with lat/lng
- [x] Update useLocalAircraftTime hook to call the procedure and use the real DST-aware offset
- [x] Cache the timezone result per lat/lng (debounced, only re-fetches when position changes significantly)
- [x] Show exact timezone name (e.g. "Asia/Kolkata") as sub-label on the card

### Tests
- [x] TypeScript compiles clean (0 errors)
- [x] All 61 tests passing

## Updates (Round 16 — Full History Page & README Update)
- [x] Add getFlightHistoryPaginated DB helper (sort by date/route/prayerCount, pagination)
- [x] Add flight.historyList tRPC procedure with sort, order, page, pageSize inputs
- [x] Build /history page: paginated table with sortable columns (date, route, prayers, delay, distance, duration)
- [x] Add navigation link to /history in the app header
- [x] Register /history route in App.tsx
- [x] Update README.md with all features (timezone fix, local-at-aircraft, arrival detection, API quota, flight history, prayer summary, exact timezone API, /history page)
- [x] Push updated README and all code to GitHub (commit ed71ff9)

## Updates (Round 17 — Export CSV & Share Buttons)
- [x] Add Export CSV button to /history page (downloads all visible rows as CSV with 24 columns)
- [x] Add Share Arrival Summary button to Arrival Summary card (Web Share API on mobile, clipboard fallback on desktop)
- [x] Update README.md with Export & Sharing section
- [x] Push to GitHub (commit 2884a9a)

## Updates (Round 18 — Flight Not Found Fix & Upcoming Trips)
- [x] Diagnose Flight Not Found: AirLabs monthly quota (1000 calls/month) exhausted during development
- [x] Fix error handling: quota-exceeded now shows amber 'API Quota Exceeded' banner with clear message and reset date guidance
- [x] Show 'Add to Upcoming Trips' shortcut button on quota-exceeded error screen
- [x] Create upcoming_trips DB table (flightIata, scheduledDepUtc, depIata, arrIata, notes, userId)
- [x] Add tRPC procedures: flight.addTrip, flight.listTrips, flight.deleteTrip
- [x] Build Upcoming Trips panel on home screen: Add Trip modal, countdown list with IMMINENT badge, Track/Delete buttons
- [x] Auto-activate live tracking 5 min before departure (client-side interval checks every 30 seconds)
- [x] Update README.md with Upcoming Trips and API Quota sections, pushed to GitHub (commit 49dd082)

## Updates (Round 19 — FR24-based Arrival Summary)
- [x] Investigate FR24 API: confirmed /flight-summary/full returns actual dep/arr times, duration, distance, status
- [x] Add flight.fr24Lookup tRPC procedure that fetches FR24 summary data by flight IATA (no AirLabs dependency)
- [x] When AirLabs quota is exceeded (TOO_MANY_REQUESTS), automatically fetch from FR24 via fr24Lookup
- [x] Build FR24-based Arrival Summary card: actual dep/arr times, duration, distance, aircraft, registration, runway, status
- [x] Prayer count computation available via flightPrayerSummary procedure (called on save)
- [x] FR24-sourced flights can be saved to history DB via the same saveHistory procedure
- [x] Update README.md with FR24 Fallback Mode and Upcoming Trips sections, pushed to GitHub (commit 91cd25f)

## Updates (Round 19b — FR24 fallback save gaps)
- [x] Wire FR24 fallback to call flightPrayerSummary and then saveHistory when fr24FallbackData shows landed
- [x] Invalidate recentFlights and historyList after FR24-sourced save
- [x] Add regression test for FR24-only quota-exhausted arrival save (9 new tests, 70 total passing)

## Bug Fixes (Round 20)
- [x] Fix Upcoming Trips countdown: datetime-local input was appending :00Z treating local time as UTC; fixed to use new Date(value).toISOString() which correctly converts local→UTC
- [x] Fix Flight History table: fall back to UTC fields when AirLabs local fields are null; FR24 path now populates actualDepLocal/actualArrLocal from datetimeTakeoff/datetimeLanded
- [x] Add backfill tRPC procedure: for each history row missing local times, fetch from FR24 and update the record
- [x] Populate depDelayMin/arrDelayMin in FR24 save path using datetimeTakeoff vs scheduled time

## Round 21 — FR24 as full AirLabs replacement
- [x] Fix FR24 date filter: fr24Lookup and fetchFr24FlightByIata now prefer today's UTC date when multiple results exist
- [x] Wire FR24 live position into main tracking view: new fr24FullTracking procedure returns live ADS-B + weather + prayer times; full tracking view rendered in FR24 mode
- [x] FR24 fallback shows full flight card: identity bar, time strip, map, telemetry, weather, prayer panel, operations panel

## Round 22 — FR24 live position fix
- [x] Fix fr24FullTracking: IATA lookup returned no live results because FR24 live endpoint needs ICAO callsign
- [x] Added deriveCallsignCandidates() with 80+ IATA→ICAO mappings; retries live lookup by callsign (e.g. QTR1188) when IATA fails
- [x] positionIsEstimated is now false when FR24 returns real ADS-B coordinates via callsign lookup

## Round 23 — ADS-B badge + callsign in Operations panel
- [x] Confirmed QR1188 live: lat 25.483, lng 51.871, alt 13050ft, gspeed 376km/h, callsign QTR1188, positionIsEstimated=false
- [x] AirLabs mode header badge updated from "Live" to "ADS-B Live"
- [x] FR24 mode: squawk, ICAO hex, ADS-B source, FR24 ID added to Operations panel and fr24FullTracking return object
