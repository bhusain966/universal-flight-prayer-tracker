# Universal Flight Prayer Tracker

A real-time, dark-themed aviation dashboard that lets you track any live flight by IATA flight number and calculates Islamic prayer times based on the aircraft's current GPS position.

![Stack](https://img.shields.io/badge/Stack-React%2019%20%2B%20Express%204%20%2B%20tRPC%2011-blue?style=flat-square)
![Node](https://img.shields.io/badge/Node.js-22-green?style=flat-square)
![MySQL](https://img.shields.io/badge/Database-MySQL%208-orange?style=flat-square)
![Tests](https://img.shields.io/badge/Tests-73%20passing-brightgreen?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)

---

## Features

Enter any IATA flight number (e.g. `QR726`, `EK202`, `BA117`) to load a full live dashboard.

### Flight Data Panels

| Panel | Data Shown |
|---|---|
| **Identity Bar** | Airline, flight number, origin to destination, status badge, route progress % |
| **Flight Times** | Elapsed time, remaining time, ETA, total duration, local time at aircraft |
| **Live Map** | Dark Leaflet map with geodesic great-circle arc (cyan = flown, amber = remaining) |
| **Live Position** | Latitude, longitude, altitude (ft), ground speed (km/h), heading, vertical speed |
| **Atmosphere** | Wind speed, wind direction, temperature at cruise altitude |
| **Schedule** | Scheduled vs actual times in **local airport time**, UTC sub-labels, delay, terminal, gate |
| **Aircraft** | Registration, model, manufacturer, engine type, year built, airline codes |
| **Operations (FR24)** | Squawk, callsign, ICAO hex, ADS-B source, runway, distance flown |

### Prayer Times Module

- Live countdown to the next prayer
- All six daily times: Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha
- Five calculation methods: MWL, ISNA, Egypt, Makkah (Umm Al-Qura), Karachi
- Selected method persisted in localStorage

### Local Time at Aircraft

- Live ticking clock (HH:MM:SS) at the plane's current GPS position
- Uses the **Google Maps Timezone API** for DST-aware exact timezone resolution (e.g. UTC+5:30 for India)
- Timezone name shown as sub-label (e.g. "Asia/Kolkata")
- Position cached — API only re-queried when aircraft moves more than 0.5 degrees

### Correct Local Airport Times

- All departure and arrival times displayed in the **airport's local timezone** (not UTC)
- UTC times shown as secondary sub-labels for reference
- AirLabs local fields (`dep_time`, `arr_time`) used as primary display

### Smart Position Fallback

When ADS-B is unavailable, position is estimated via great-circle interpolation. All panels remain active with a clear "Est. Position" badge.

### FR24 Full Tracking Mode (AirLabs Quota Exhausted)

When the AirLabs monthly quota is exhausted, the app automatically switches to FR24 as the **complete replacement data source** — not just a summary fallback. The `fr24FullTracking` tRPC procedure combines:

- **Live ADS-B position** from FR24's `/live/flight-positions/full` endpoint (lat, lng, altitude, ground speed, heading, vertical speed, squawk, ICAO hex)
- **Flight summary** from FR24's `/flight-summary/full` endpoint (takeoff/landing times, duration, distance, runway, aircraft registration)
- **Weather data** from Open-Meteo at the aircraft's current altitude
- **Airport coordinates** from a local offline dataset (zero API quota consumed)

The full tracking view renders identically to the AirLabs path: identity bar, live map with great-circle arc, telemetry panel, weather panel, prayer times panel, and operations panel. A yellow banner indicates FR24 mode is active. Live position polling continues every 15 minutes until landing is detected.

**Smart date selection:** When FR24 returns multiple results for a flight number (e.g. yesterday's landed flight + today's scheduled departure), the app prioritises the not-yet-departed (predeparture) entry, then today's UTC-dated entry, then falls back to the most recent result.

When a landed flight is detected, prayer times are computed using the great-circle midpoint of the route and the record is saved to the history database. Once the AirLabs quota resets on the 1st of each month, normal dual-source tracking resumes automatically.

### Upcoming Trips

- Add any future flight to the **Upcoming Trips** panel on the home screen
- Each trip shows a live countdown to departure (days, hours, minutes)
- Flights within 5 minutes of departure show an **IMMINENT** badge
- Tracking activates automatically when the departure time arrives
- Trips can be deleted individually; the list persists in the database
- When AirLabs quota is exhausted or a flight is not yet active, a shortcut button appears to add it directly to Upcoming Trips

### Arrival Detection and Arrival Summary

- Landing detected from AirLabs (`status = "landed"`) or FR24 (`flight_ended = true`)
- All API polling stops immediately on landing
- Green **Arrival Banner** shows: actual arrival time (local + UTC), baggage belt, terminal, gate, runway
- Full **Arrival Summary** card shows: scheduled vs actual times, delays, duration, distance, prayers during flight
- Prayer count and names computed server-side from the actual departure-to-arrival UTC window
- Polling resumes only when a new flight number is entered

### Flight History and Prayer Log

- All completed flights saved permanently to MySQL
- Dedicated **/history page** with a paginated, sortable table of all tracked flights
- Sortable by: date, departure airport, arrival airport, prayer count, arrival delay, distance, duration
- Configurable page size: 10 / 20 / 50 rows
- Each row shows: flight, route, prayers (with names on hover), times, delay badge, duration, distance, aircraft, baggage belt
- Click any row to re-open that flight in the tracker
- Recent flights chips (last 10) on the home screen for quick access

### API Quota Display

- AirLabs: calls used this month / monthly limit / hourly limit shown in the footer
- FR24: credits remaining and credits consumed per call shown in the footer

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7, Tailwind CSS 4, shadcn/ui |
| Backend | Node.js 22, Express 4, tRPC 11 |
| Database | MySQL 8 via Drizzle ORM |
| Map | Leaflet + react-leaflet (CartoDB Dark Matter tiles) |
| Flight Data | AirLabs REST API (primary), Flightradar24 REST API (secondary) |
| Weather | Open-Meteo pressure-level forecast API (free, no key required) |
| Timezone | Google Maps Timezone API (DST-aware, via Manus proxy) |
| Prayer Calc | Custom astronomical algorithm (MWL / ISNA / Egypt / Makkah / Karachi) |
| Testing | Vitest (73 tests) |
| Container | Docker (multi-stage build), Docker Compose |

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Docker >= 24 and Docker Compose >= 2.20 | For the recommended containerised setup |
| Node.js >= 22 and pnpm >= 10 | For local development without Docker |
| AirLabs API key | Required. Sign up free at airlabs.co. Free tier: 1,000 requests/month. |
| FR24 API key | Optional. Enables the FR24 Operations panel. |

---

## Quick Start with Docker Compose (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/bhusain966/universal-flight-prayer-tracker.git
cd universal-flight-prayer-tracker

# 2. Copy the environment template and fill in your values
cp .env.example .env
# Edit .env and set at minimum:
#   AIRLABS_API_KEY   your AirLabs key
#   JWT_SECRET        a long random string (min 32 chars)

# 3. Build and start all services (app + MySQL database)
docker compose up --build

# 4. Open the tracker
open http://localhost:3000
```

Run in the background:

```bash
docker compose up --build -d
docker compose logs -f app
```

Stop:

```bash
docker compose down          # keep database volume
docker compose down -v       # also delete database volume
```

---

## Local Development (without Docker)

```bash
# 1. Install Node.js 22 and pnpm

# 2. Clone and install dependencies
git clone https://github.com/bhusain966/universal-flight-prayer-tracker.git
cd universal-flight-prayer-tracker
pnpm install

# 3. Start a MySQL 8 database
docker run -d --name flight_db \
  -e MYSQL_ROOT_PASSWORD=rootpassword \
  -e MYSQL_DATABASE=flighttracker \
  -e MYSQL_USER=flightuser \
  -e MYSQL_PASSWORD=flightpassword \
  -p 3306:3306 mysql:8.0

# 4. Configure environment variables
cp .env.example .env
# Edit .env with DATABASE_URL, AIRLABS_API_KEY, JWT_SECRET

# 5. Apply the database schema
pnpm drizzle-kit generate
# Apply the generated SQL via your MySQL client

# 6. Start the development server
pnpm dev
open http://localhost:3000
```

---

## Environment Variables

Copy `.env.example` to `.env` and configure the following.

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | MySQL connection string: `mysql://USER:PASSWORD@HOST:PORT/DATABASE` |
| `JWT_SECRET` | Random string for session cookie signing (min 32 chars) |
| `AIRLABS_API_KEY` | AirLabs API key |

### Optional but Recommended

| Variable | Description |
|---|---|
| `FR24_API_KEY` | Flightradar24 API key — enables the FR24 Operations panel |

### Docker Compose Database Variables

| Variable | Default | Description |
|---|---|---|
| `MYSQL_ROOT_PASSWORD` | `rootpassword` | MySQL root password |
| `MYSQL_DATABASE` | `flighttracker` | Database name |
| `MYSQL_USER` | `flightuser` | Application user |
| `MYSQL_PASSWORD` | `flightpassword` | Application password |

### Manus Platform Variables (leave blank for self-hosted)

| Variable | Description |
|---|---|
| `VITE_APP_ID` | Manus OAuth application ID |
| `OAUTH_SERVER_URL` | Manus OAuth backend base URL |
| `VITE_OAUTH_PORTAL_URL` | Manus login portal URL |
| `OWNER_OPEN_ID` | Owner's Manus Open ID |
| `OWNER_NAME` | Owner's display name |
| `BUILT_IN_FORGE_API_URL` | Manus built-in API URL (server-side; includes maps/timezone proxy) |
| `BUILT_IN_FORGE_API_KEY` | Manus built-in API key (server-side) |
| `VITE_FRONTEND_FORGE_API_KEY` | Manus built-in API key (frontend) |
| `VITE_FRONTEND_FORGE_API_URL` | Manus built-in API URL (frontend) |

---

## Database Schema

Two tables are used. `users` is created automatically by Manus OAuth. `flight_history` stores the permanent flight log:

```sql
CREATE TABLE flight_history (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  flightIata        VARCHAR(16) NOT NULL,
  flightIcao        VARCHAR(16),
  airlineName       VARCHAR(128),
  airlineIata       VARCHAR(8),
  aircraft          VARCHAR(64),
  regNumber         VARCHAR(16),
  depIata           VARCHAR(8),
  depCity           VARCHAR(64),
  arrIata           VARCHAR(8),
  arrCity           VARCHAR(64),
  scheduledDepUtc   VARCHAR(32),
  actualDepUtc      VARCHAR(32),
  scheduledArrUtc   VARCHAR(32),
  actualArrUtc      VARCHAR(32),
  scheduledDepLocal VARCHAR(32),
  actualDepLocal    VARCHAR(32),
  scheduledArrLocal VARCHAR(32),
  actualArrLocal    VARCHAR(32),
  depDelayMin       INT,
  arrDelayMin       INT,
  durationMin       INT,
  actualDurationMin INT,
  distanceKm        INT,
  baggageBelt       VARCHAR(16),
  arrTerminal       VARCHAR(16),
  arrGate           VARCHAR(16),
  runwayLanded      VARCHAR(16),
  prayerCount       INT DEFAULT 0,
  prayerNames       TEXT,
  prayerDetails     TEXT,
  trackedAt         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

---

## API Rate Limits

Auto-refresh fires every 15 minutes and stops completely once the flight lands.

| API | Calls per lookup | Notes |
|---|---|---|
| AirLabs /flight | 1 | Schedule, aircraft metadata, local times |
| AirLabs /flights | 1 | Live ADS-B telemetry |
| AirLabs /airports | 0-2 | Fallback only when coords missing |
| FR24 `/flight-summary/full` | 1 | Summary data; used in both primary and fallback modes |
| FR24 `/live/flight-positions/full` | 1 | Live ADS-B position; used in FR24 full tracking mode |
| Open-Meteo | 1 | Free, no key, no rate limit |
| Google Maps Timezone | 0-1 | Only when aircraft moves > 0.5 degrees |

Tracking one 14-hour long-haul flight end-to-end consumes approximately 112 AirLabs calls.

---

## Project Structure

```
client/
  src/
    components/
      FlightMap.tsx        Leaflet map with geodesic route arc
      PrayerPanel.tsx      Prayer times + method selector
    pages/
      Home.tsx             Main flight tracker page
      History.tsx          /history paginated flight log
server/
  airlabs.ts               AirLabs API service
  fr24.ts                  Flightradar24 API service
  weather.ts               Open-Meteo weather service
  prayer.ts                Islamic prayer time calculations
  db.ts                    Drizzle query helpers (incl. paginated history)
  routers/
    flight.ts              tRPC procedures: lookup, saveHistory, historyList,
                           recentFlights, flightPrayerSummary, timezone, prayerTimes,
                           fr24Lookup, fr24FullTracking, backfillHistory
drizzle/
  schema.ts                Database tables (users, flight_history)
  migrations/              Generated SQL migrations
Dockerfile                 Multi-stage production build
docker-compose.yml         App + MySQL services
```

---

## Running Tests

```bash
pnpm test
```

The test suite (73 tests) covers prayer calculation for all 5 methods, flight router response shape and datetime normalisation, great-circle geometry and antimeridian unwrapping, weather pressure-level selection, arrival detection logic, AirLabs/FR24 quota field extraction, FR24 multi-result date selection strategy (predeparture vs today vs fallback), FR24 full-tracking airport coordinate enrichment, midpoint computation, and authentication logout.

---

## Deployment

### Manus (recommended)

Click the Publish button in the Manus Management UI after creating a checkpoint. Custom domains are supported.

### Docker (Self-hosted)

```bash
docker build -t flight-prayer-tracker .
docker run -d -p 3000:3000 --env-file .env --name flight_tracker flight-prayer-tracker
```

### Cloud Platforms

| Platform | Notes |
|---|---|
| Railway | Connect the GitHub repo; add env vars in the dashboard. MySQL addon available. |
| Render | Create a Web Service; point at the repo; set env vars. Use Render's managed MySQL. |
| Fly.io | `fly launch` auto-detects the Dockerfile. `fly postgres create` for the database. |
| AWS ECS | Push image to ECR; deploy as Fargate task. Use RDS MySQL. |
| Google Cloud Run | Push to Artifact Registry; deploy as Cloud Run service. Use Cloud SQL MySQL. |

---

## Prayer Calculation Methods

| Method | Fajr Angle | Isha Rule | Primary Region |
|---|---|---|---|
| MWL - Muslim World League | 18 degrees | 17 degrees | Europe, Far East, parts of Americas |
| ISNA - Islamic Society of North America | 15 degrees | 15 degrees | North America |
| Egypt - Egyptian General Authority | 19.5 degrees | 17.5 degrees | Africa, Syria, Lebanon, Malaysia |
| Makkah - Umm Al-Qura University | 18.5 degrees | 90 min after Maghrib | Arabian Peninsula |
| Karachi - University of Islamic Sciences | 18 degrees | 18 degrees | Pakistan, Afghanistan, Bangladesh, India |

---

## Contributing

Contributions are welcome. Please open an issue first to discuss significant changes.

```bash
git checkout -b feature/your-feature-name
pnpm install
pnpm dev
pnpm test   # run before submitting a pull request
```

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

## Acknowledgements

- Flight data: [AirLabs](https://airlabs.co) and [Flightradar24](https://www.flightradar24.com)
- Weather data: [Open-Meteo](https://open-meteo.com)
- Map tiles: [CartoDB Dark Matter](https://carto.com/basemaps/)
- Timezone data: [Google Maps Timezone API](https://developers.google.com/maps/documentation/timezone)
- Prayer time algorithm: based on [PrayTimes.org](http://praytimes.org/calculation)
