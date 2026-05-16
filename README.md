# ✈️ Universal Flight Prayer Tracker

A real-time, dark-themed aviation dashboard that lets you track any live flight by IATA flight number and calculates Islamic prayer times based on the aircraft's current GPS position.

![Stack](https://img.shields.io/badge/Stack-React%2019%20%2B%20Express%204%20%2B%20tRPC%2011-blue?style=flat-square)
![Node](https://img.shields.io/badge/Node.js-22-green?style=flat-square)
![MySQL](https://img.shields.io/badge/Database-MySQL%208-orange?style=flat-square)
![Tests](https://img.shields.io/badge/Tests-54%20passing-brightgreen?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-lightgrey?style=flat-square)

---

## Features

Enter any IATA flight number (e.g. `QR726`, `EK202`, `BA117`) to load a full live dashboard.

### Flight Data Panels

| Panel | Data Shown |
|---|---|
| **Identity Bar** | Airline, flight number, origin → destination, status badge, route progress % |
| **Flight Times** | Elapsed time, remaining time, ETA (UTC), total flight duration |
| **Live Map** | Dark Leaflet map · geodesic great-circle arc (cyan = flown, amber = remaining) · aircraft marker |
| **Live Position** | Latitude, longitude, altitude (ft), ground speed (km/h), heading (°), vertical speed (ft/min) |
| **Atmosphere** | Wind speed (km/h), wind direction (° + compass), temperature (°C) at cruise altitude |
| **Schedule** | Scheduled vs actual departure/arrival, delay status, terminal, gate |
| **Aircraft** | Registration, model, manufacturer, engine count/type, year built, airline IATA/ICAO |
| **Operations (FR24)** | Squawk code, callsign, ICAO hex, ADS-B source, runway, distance flown, category |

### Prayer Times Module

Prayer times are calculated using the aircraft's live GPS coordinates (or an estimated position when ADS-B is unavailable). The panel shows:

- Live countdown to the next prayer
- All six daily times: Fajr, Sunrise, Dhuhr, Asr, Maghrib, Isha
- Five calculation methods selectable via dropdown: **MWL**, **ISNA**, **Egypt**, **Makkah (Umm Al-Qura)**, **Karachi**
- Selected method persists in `localStorage` across page refreshes

### Smart Position Fallback

When the aircraft is not broadcasting ADS-B data, the tracker automatically estimates the current position using great-circle interpolation at the known route completion percentage. All panels remain active with a clear **"⚠ Est. Position"** badge.

### Other

- Auto-refresh every **15 minutes** (rate-limit friendly — ~2 API calls per refresh)
- Circular countdown timer showing time until next refresh
- Shareable deep-link URLs: `/track/QR726`
- Share button copies the full URL to clipboard
- All API keys stored **exclusively server-side** — never exposed to the browser
- 54 unit tests covering prayer calculation, flight router, map geometry, and weather

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 7, Tailwind CSS 4, shadcn/ui |
| Backend | Node.js 22, Express 4, tRPC 11 |
| Database | MySQL 8 via Drizzle ORM |
| Map | Leaflet + react-leaflet (CartoDB Dark Matter tiles — no API key required) |
| Flight Data | AirLabs REST API (primary), Flightradar24 REST API (secondary) |
| Weather | Open-Meteo pressure-level forecast API (free, no key required) |
| Prayer Calc | Custom astronomical algorithm (MWL / ISNA / Egypt / Makkah / Karachi) |
| Testing | Vitest |
| Container | Docker (multi-stage build), Docker Compose |

---

## Prerequisites

| Requirement | Notes |
|---|---|
| **Docker ≥ 24** + **Docker Compose ≥ 2.20** | For the recommended containerised setup |
| **Node.js ≥ 22** + **pnpm ≥ 10** | For local development without Docker |
| **AirLabs API key** | **Required.** Sign up free at [airlabs.co](https://airlabs.co). Free tier: 1 000 requests/month. |
| **FR24 API key** | *Optional.* Enables the FR24 Operations panel. Contact [Flightradar24](https://www.flightradar24.com/premium/) for API access. |

---

## Quick Start — Docker Compose (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/universal-flight-prayer-tracker.git
cd universal-flight-prayer-tracker

# 2. Copy the environment template and fill in your values
cp .env.example .env
# Open .env in your editor and set at minimum:
#   AIRLABS_API_KEY   — your AirLabs key
#   JWT_SECRET        — a long random string

# 3. Build and start all services (app + MySQL database)
docker compose up --build

# 4. Open the tracker in your browser
open http://localhost:3000
```

The first build takes 2–4 minutes. Subsequent starts are fast because Docker caches the dependency layer.

**Run in the background:**

```bash
docker compose up --build -d
docker compose logs -f app     # tail application logs
docker compose logs -f db      # tail database logs
```

**Stop:**

```bash
docker compose down            # stop containers, keep database volume
docker compose down -v         # stop containers AND delete database volume
```

---

## Local Development (without Docker)

```bash
# 1. Install Node.js 22 and pnpm
#    https://nodejs.org  |  https://pnpm.io/installation

# 2. Clone and install dependencies
git clone https://github.com/YOUR_USERNAME/universal-flight-prayer-tracker.git
cd universal-flight-prayer-tracker
pnpm install

# 3. Spin up a MySQL 8 database (example using Docker for just the database)
docker run -d \
  --name flight_db \
  -e MYSQL_ROOT_PASSWORD=rootpassword \
  -e MYSQL_DATABASE=flighttracker \
  -e MYSQL_USER=flightuser \
  -e MYSQL_PASSWORD=flightpassword \
  -p 3306:3306 \
  mysql:8.0

# 4. Configure environment variables
cp .env.example .env
# Edit .env — set DATABASE_URL, AIRLABS_API_KEY, and JWT_SECRET at minimum

# 5. Apply the database schema
pnpm db:push

# 6. Start the development server
pnpm dev

# 7. Open the tracker
open http://localhost:3000
```

---

## Environment Variables

Copy `.env.example` to `.env` and configure the following.

### Required

| Variable | Description |
|---|---|
| `DATABASE_URL` | MySQL connection string. Format: `mysql://USER:PASSWORD@HOST:PORT/DATABASE` |
| `JWT_SECRET` | Long random string for session cookie signing. Generate: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` |
| `AIRLABS_API_KEY` | Your AirLabs API key. |

### Optional but Recommended

| Variable | Description |
|---|---|
| `FR24_API_KEY` | Flightradar24 API key. Enables the FR24 Operations panel. |

### Docker Compose Database Variables

These initialise the MySQL container and must match the credentials in `DATABASE_URL`.

| Variable | Default | Description |
|---|---|---|
| `MYSQL_ROOT_PASSWORD` | `rootpassword` | MySQL root password |
| `MYSQL_DATABASE` | `flighttracker` | Database name |
| `MYSQL_USER` | `flightuser` | Application database user |
| `MYSQL_PASSWORD` | `flightpassword` | Application database password |

### Manus Platform Variables (Self-hosted: leave blank)

| Variable | Description |
|---|---|
| `VITE_APP_ID` | Manus OAuth application ID |
| `OAUTH_SERVER_URL` | Manus OAuth backend base URL |
| `VITE_OAUTH_PORTAL_URL` | Manus login portal URL |
| `OWNER_OPEN_ID` | Owner's Manus Open ID |
| `OWNER_NAME` | Owner's display name |
| `BUILT_IN_FORGE_API_URL` | Manus built-in API URL (server-side) |
| `BUILT_IN_FORGE_API_KEY` | Manus built-in API key (server-side) |
| `VITE_FRONTEND_FORGE_API_KEY` | Manus built-in API key (frontend) |
| `VITE_FRONTEND_FORGE_API_URL` | Manus built-in API URL (frontend) |

---

## Database Schema

The application uses a single `users` table for authentication. The schema is applied automatically via Docker Compose or manually via `pnpm db:push`.

```sql
CREATE TABLE `users` (
  `id`            INT AUTO_INCREMENT PRIMARY KEY,
  `openId`        VARCHAR(64) NOT NULL UNIQUE,
  `name`          TEXT,
  `email`         VARCHAR(320),
  `loginMethod`   VARCHAR(64),
  `role`          ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  `createdAt`     TIMESTAMP NOT NULL DEFAULT (now()),
  `updatedAt`     TIMESTAMP NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `lastSignedIn`  TIMESTAMP NOT NULL DEFAULT (now())
);
```

---

## API Rate Limits

The tracker is designed to be rate-limit friendly. Auto-refresh fires every **15 minutes**.

| API | Calls per lookup | Notes |
|---|---|---|
| AirLabs `/flight` | 1 | Schedule, aircraft metadata |
| AirLabs `/flights` | 1 | Live ADS-B telemetry |
| AirLabs `/airports` | 0–2 | Fallback only when coords missing |
| FR24 | 1 | Optional; graceful fallback if unavailable |
| Open-Meteo | 1 | Free, no key, no rate limit |

Tracking one 14-hour long-haul flight end-to-end consumes approximately **112 AirLabs calls**.

---

## Project Structure

```
.
├── client/                        # React 19 frontend (Vite)
│   └── src/
│       ├── components/
│       │   ├── FlightMap.tsx      # Leaflet map with geodesic route arc
│       │   └── PrayerPanel.tsx    # Prayer times + method selector dropdown
│       └── pages/
│           └── Home.tsx           # Main flight tracker page
├── server/                        # Express 4 + tRPC 11 backend
│   ├── airlabs.ts                 # AirLabs API service
│   ├── fr24.ts                    # Flightradar24 API service
│   ├── weather.ts                 # Open-Meteo weather service
│   ├── prayer.ts                  # Islamic prayer time calculations
│   └── routers/
│       └── flight.ts              # tRPC flight lookup + prayer procedures
├── drizzle/                       # Database schema and migrations
├── shared/                        # Shared types and constants
├── Dockerfile                     # Multi-stage production build
├── docker-compose.yml             # App + MySQL services
└── README.md
```

---

## Running Tests

```bash
pnpm test
```

The test suite (54 tests) covers prayer calculation for all 5 methods, flight router response shape and datetime normalisation, great-circle geometry and antimeridian unwrapping, weather pressure-level selection, and authentication logout.

---

## Deployment

### Docker (Self-hosted)

The `Dockerfile` uses a three-stage build (`deps → builder → runner`) producing a lean image based on `node:22-alpine`.

```bash
# Build the image
docker build -t flight-prayer-tracker .

# Run with an environment file
docker run -d \
  -p 3000:3000 \
  --env-file .env \
  --name flight_tracker \
  flight-prayer-tracker
```

### Cloud Platforms

| Platform | Notes |
|---|---|
| **Railway** | Connect the GitHub repo; add env vars in the Railway dashboard. MySQL addon available. |
| **Render** | Create a Web Service; point at the repo; set env vars. Use Render's managed MySQL. |
| **Fly.io** | `fly launch` auto-detects the Dockerfile. `fly postgres create` for the database. |
| **AWS ECS** | Push image to ECR; deploy as Fargate task. Use RDS MySQL for the database. |
| **Google Cloud Run** | Push to Artifact Registry; deploy as a Cloud Run service. Use Cloud SQL MySQL. |

---

## Prayer Calculation Methods

| Method | Fajr Angle | Isha Rule | Primary Region |
|---|---|---|---|
| **MWL** — Muslim World League | 18° | 17° | Europe, Far East, parts of Americas |
| **ISNA** — Islamic Society of North America | 15° | 15° | North America |
| **Egypt** — Egyptian General Authority | 19.5° | 17.5° | Africa, Syria, Lebanon, Malaysia |
| **Makkah** — Umm Al-Qura University | 18.5° | 90 min after Maghrib | Arabian Peninsula |
| **Karachi** — University of Islamic Sciences | 18° | 18° | Pakistan, Afghanistan, Bangladesh, India |

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
- Weather data: [Open-Meteo](https://open-meteo.com) (free, open-source)
- Map tiles: [CartoDB Dark Matter](https://carto.com/basemaps/)
- Prayer time algorithm: based on [PrayTimes.org](http://praytimes.org/calculation)
