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
