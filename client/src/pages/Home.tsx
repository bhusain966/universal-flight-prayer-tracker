import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import FlightMap from "@/components/FlightMap";
import PrayerPanel from "@/components/PrayerPanel";
import {
  Plane,
  Search,
  RefreshCw,
  Clock,
  MapPin,
  Info,
  AlertTriangle,
  Activity,
  Radio,
  Timer,
  Hourglass,
  ArrowRight,
  Wind,
  Thermometer,
  Share2,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse an AirLabs UTC datetime string ('YYYY-MM-DD HH:MM' UTC or ISO 'YYYY-MM-DDTHH:MMZ').
 * Returns a Date object (UTC-based).
 */
function parseAirlabsDate(raw?: string | null): Date | null {
  if (!raw) return null;
  try {
    const iso = raw.includes("T") ? raw : raw.replace(" ", "T") + (raw.endsWith("Z") ? "" : "Z");
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

/**
 * Format a UTC ISO timestamp (FR24 fields, ETA) — always shows UTC time.
 */
function formatTime(raw?: string | null): string {
  if (!raw) return "—";
  const d = parseAirlabsDate(raw);
  if (!d) return raw;
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm} UTC`;
}

/**
 * Format an AirLabs LOCAL time field (dep_time / arr_time — NOT the _utc variants).
 * AirLabs returns these as 'YYYY-MM-DD HH:MM' in the airport's local timezone.
 * We extract HH:MM directly — no conversion needed.
 * Appends the UTC equivalent in muted text when utcRaw is provided.
 */
function formatLocalTime(localRaw?: string | null, utcRaw?: string | null): { local: string; utc: string | null } {
  if (!localRaw) return { local: "—", utc: null };
  const match = localRaw.match(/(\d{2}:\d{2})/);
  const localStr = match ? match[1] : localRaw;
  let utcStr: string | null = null;
  if (utcRaw) {
    const utcDate = parseAirlabsDate(utcRaw);
    if (utcDate) {
      const hh = String(utcDate.getUTCHours()).padStart(2, "0");
      const mm = String(utcDate.getUTCMinutes()).padStart(2, "0");
      utcStr = `${hh}:${mm} UTC`;
    }
  }
  return { local: localStr, utc: utcStr };
}

/** Render a local time with optional UTC sub-label */
function LocalTimeDisplay({ localRaw, utcRaw }: { localRaw?: string | null; utcRaw?: string | null }) {
  const { local, utc } = formatLocalTime(localRaw, utcRaw);
  return (
    <div>
      <span className="avi-value text-sm">{local}</span>
      {utc && <span className="block text-[10px] text-muted-foreground/60 font-mono">{utc}</span>}
    </div>
  );
}

/**
 * Derive the approximate UTC offset (in whole hours) from a longitude.
 * Uses the standard solar-time formula: offset = round(lng / 15).
 * This matches the same approach used in server/prayer.ts for prayer calculations.
 */
function lngToUtcOffsetHours(lng: number): number {
  return Math.round(lng / 15);
}

/**
 * Live clock hook: returns the current local time string (HH:MM:SS) and UTC offset label
 * at the given longitude. Ticks every second. Returns null when lng is unavailable.
 */
function useLocalAircraftTime(lng?: number | null): { time: string; offsetLabel: string } | null {
  const offsetHours = useMemo(() => (lng != null ? lngToUtcOffsetHours(lng) : null), [lng]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (offsetHours == null) return null;

  const now = new Date();
  const localMs = now.getTime() + offsetHours * 3600 * 1000;
  const local = new Date(localMs);
  const hh = String(local.getUTCHours()).padStart(2, "0");
  const mm = String(local.getUTCMinutes()).padStart(2, "0");
  const ss = String(local.getUTCSeconds()).padStart(2, "0");
  const sign = offsetHours >= 0 ? "+" : "";
  // Suppress lint warning — tick is intentionally used to force re-render each second
  void tick;
  return { time: `${hh}:${mm}:${ss}`, offsetLabel: `UTC${sign}${offsetHours}` };
}

function formatDuration(mins?: number | null): string {
  if (mins == null || mins < 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function elapsedMinutes(depIso?: string | null): number | null {
  if (!depIso) return null;
  const dep = parseAirlabsDate(depIso);
  if (!dep) return null;
  const diff = Math.floor((Date.now() - dep.getTime()) / 60000);
  return diff > 0 ? diff : null;
}

function formatDelay(mins?: number | null): string {
  if (mins == null || mins === 0) return "On time";
  if (mins > 0) return `+${mins} min`;
  return `${mins} min`;
}

function formatDistance(km?: number | null): string {
  if (km == null) return "—";
  return `${Math.round(km).toLocaleString()} km`;
}

function windDirectionToCompass(deg: number): string {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  const idx = Math.round(((deg % 360) + 360) % 360 / 22.5) % 16;
  return dirs[idx];
}

function getStatusClass(status?: string): string {
  const s = (status ?? "").toLowerCase();
  if (s === "en-route" || s === "active") return "status-active";
  if (s === "landed") return "status-landed";
  if (s === "cancelled") return "status-cancelled";
  return "status-scheduled";
}

function getStatusLabel(status?: string): string {
  const s = (status ?? "").toLowerCase();
  if (s === "en-route" || s === "active") return "En Route";
  if (s === "landed") return "Landed";
  if (s === "cancelled") return "Cancelled";
  if (s === "scheduled") return "Scheduled";
  return status ?? "Unknown";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function PanelHeader({
  icon,
  title,
  extra,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  extra?: React.ReactNode;
  badge?: string;
}) {
  return (
    <div className="avi-panel-header">
      <span className="text-primary">{icon}</span>
      <span className="avi-panel-header-title">{title}</span>
      {badge && (
        <span className="ml-2 text-[10px] font-mono px-1.5 py-0.5 rounded border border-primary/30 text-primary/70 bg-primary/5">
          {badge}
        </span>
      )}
      {extra && <span className="ml-auto">{extra}</span>}
    </div>
  );
}

/** A single large time metric card used in the Flight Times strip */
function TimeCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "cyan" | "amber" | "primary" | "green";
}) {
  const colorMap = {
    cyan: "text-cyan-400",
    amber: "text-amber-400",
    primary: "text-primary",
    green: "text-green-400",
  };
  const color = accent ? colorMap[accent] : "text-foreground";
  return (
    <div className="time-strip-cell">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1 whitespace-nowrap">
        {label}
      </span>
      <span className={`font-mono text-2xl font-bold tabular-nums leading-none ${color}`}>
        {value}
      </span>
      {sub && (
        <span className="text-[10px] text-muted-foreground mt-1 whitespace-nowrap">
          {sub}
        </span>
      )}
    </div>
  );
}

function TelemCell({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: string | number | undefined | null;
  unit?: string;
  highlight?: boolean;
}) {
  return (
    <div className="telem-cell">
      <span className="avi-label">{label}</span>
      <span className={`avi-value text-base font-semibold ${highlight ? "text-primary" : ""}`}>
        {value != null && value !== "" ? (
          <>
            {value}
            {unit && (
              <span className="text-muted-foreground text-xs ml-1">{unit}</span>
            )}
          </>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        )}
      </span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0 gap-2">
      <span className="avi-label shrink-0">{label}</span>
      <span className="avi-value text-sm font-mono text-right break-all">{value ?? "—"}</span>
    </div>
  );
}

function SkeletonPanel({ rows = 4 }: { rows?: number }) {
  return (
    <div className="p-4 space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="skeleton h-8 rounded"
          style={{ width: `${60 + (i % 3) * 15}%` }}
        />
      ))}
    </div>
  );
}

function RefreshCountdown({
  lastRefresh,
  intervalMs,
  isFetching,
  onRefresh,
}: {
  lastRefresh: Date | null;
  intervalMs: number;
  isFetching: boolean;
  onRefresh: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (!lastRefresh) { setSecondsLeft(null); return; }
    const tick = () => {
      const elapsed = Date.now() - lastRefresh.getTime();
      const remaining = Math.max(0, Math.ceil((intervalMs - elapsed) / 1000));
      setSecondsLeft(remaining);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastRefresh, intervalMs]);

  const mm = secondsLeft != null ? String(Math.floor(secondsLeft / 60)).padStart(2, "0") : "--";
  const ss = secondsLeft != null ? String(secondsLeft % 60).padStart(2, "0") : "--";
  const pct = secondsLeft != null ? ((intervalMs / 1000 - secondsLeft) / (intervalMs / 1000)) * 100 : 0;

  return (
    <button
      onClick={onRefresh}
      disabled={isFetching}
      title="Click to refresh now"
      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 group"
    >
      <div className="relative w-7 h-7 flex-shrink-0">
        <svg className="w-7 h-7 -rotate-90" viewBox="0 0 28 28">
          <circle cx="14" cy="14" r="11" fill="none" stroke="currentColor" strokeWidth="2" className="text-border" />
          <circle
            cx="14" cy="14" r="11" fill="none" stroke="currentColor" strokeWidth="2"
            strokeDasharray={`${2 * Math.PI * 11}`}
            strokeDashoffset={`${2 * Math.PI * 11 * (1 - pct / 100)}`}
            className="text-primary transition-all duration-1000"
            strokeLinecap="round"
          />
        </svg>
        <RefreshCw className={`absolute inset-0 m-auto w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors ${isFetching ? "animate-spin" : ""}`} />
      </div>
      <div className="hidden sm:flex flex-col items-start leading-tight">
        <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
          {isFetching ? "Updating…" : lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Not loaded"}
        </span>
        <span className="font-mono text-xs text-foreground">
          {isFetching ? "—:——" : lastRefresh ? `Next: ${mm}:${ss}` : "—"}
        </span>
      </div>
    </button>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 15 * 60 * 1000;

export default function Home() {
  const params = useParams<{ flightIata?: string }>();
  const [, navigate] = useLocation();
  const [inputValue, setInputValue] = useState("");
  const [flightIata, setFlightIata] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // On mount: if the URL has /track/:flightIata, auto-load that flight
  useEffect(() => {
    const urlFlight = params.flightIata?.toUpperCase();
    if (urlFlight && urlFlight.length >= 2) {
      setFlightIata(urlFlight);
      setInputValue(urlFlight);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data, isLoading, error, refetch, isFetching } =
    trpc.flight.lookup.useQuery(
      { flightIata: flightIata ?? "" },
      {
        enabled: !!flightIata,
        refetchInterval: REFRESH_INTERVAL_MS,
        staleTime: 14 * 60 * 1000,
        retry: 1,
      }
    );

  useEffect(() => {
    if (data) setLastRefresh(new Date());
  }, [data]);

  const handleSearch = useCallback(() => {
    const val = inputValue.trim().toUpperCase();
    if (val.length < 2) return;
    setFlightIata(val);
    // Push to URL for deep linking / bookmarking
    navigate(`/track/${val}`);
  }, [inputValue, navigate]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const flight = data?.data?.flight;
  const depAirport = data?.data?.depAirport;
  const arrAirport = data?.data?.arrAirport;
  const fr24 = data?.fr24;
  const weather = data?.weather ?? null;
  const positionIsEstimated = data?.positionIsEstimated ?? false;
  // hasLiveTelemetry is true only when we have real ADS-B data (not estimated)
  const hasLiveTelemetry = flight?.lat != null && flight?.lng != null && !positionIsEstimated;
  const depDelay = flight?.dep_delay;
  const arrDelay = flight?.arr_delay;

  const handleShare = useCallback(async () => {
    const url = `${window.location.origin}/track/${flightIata}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: open in new tab
      window.open(url, "_blank");
    }
  }, [flightIata]);

  // Compute time metrics
  const depActual = flight?.dep_actual_utc ?? flight?.dep_estimated_utc;
  const elapsed = elapsedMinutes(depActual);
  const remaining = flight?.eta ?? null;
  const etaIso = fr24?.etaIso ?? flight?.arr_estimated_utc ?? flight?.arr_time_utc;
  const totalDuration = flight?.duration ?? null;

  // Live local time at aircraft position (ticks every second)
  const localAircraftTime = useLocalAircraftTime(flight?.lng);

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ── */}
      <header className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center gap-2 h-14">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: "oklch(0.72 0.18 55 / 0.15)", border: "1px solid oklch(0.72 0.18 55 / 0.3)" }}>
              <Plane className="w-4 h-4 text-primary" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-sm font-bold tracking-wider text-foreground uppercase leading-none">Flight Tracker</h1>
              <p className="text-[10px] text-muted-foreground">Universal Live Monitor</p>
            </div>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 flex-1 mx-2 max-w-xs">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                className="flight-search-input pr-10 text-sm py-2"
                placeholder="QR726"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value.toUpperCase())}
                onKeyDown={handleKeyDown}
                maxLength={10}
                spellCheck={false}
                autoComplete="off"
              />
              <button
                onClick={handleSearch}
                disabled={inputValue.trim().length < 2}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors disabled:opacity-30"
              >
                <Search className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Refresh + live dot */}
          <div className="flex items-center gap-3 shrink-0 ml-auto">
            {flightIata && (
              <RefreshCountdown
                lastRefresh={lastRefresh}
                intervalMs={REFRESH_INTERVAL_MS}
                isFetching={isFetching}
                onRefresh={() => refetch()}
              />
            )}
            {hasLiveTelemetry ? (
              <div className="flex items-center gap-1.5">
                <div className="pulse-dot" />
                <span className="text-xs text-muted-foreground hidden sm:inline">Live</span>
              </div>
            ) : positionIsEstimated ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-amber-400/80">⚠ Est. Position</span>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <main className="flex-1 container py-4 space-y-4">

        {/* ── Empty state ── */}
        {!flightIata && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
              style={{ background: "oklch(0.72 0.18 55 / 0.08)", border: "1px solid oklch(0.72 0.18 55 / 0.2)" }}>
              <Plane className="w-10 h-10 text-primary/60" />
            </div>
            <div className="text-center space-y-2 max-w-sm">
              <h2 className="text-xl font-semibold text-foreground">Track Any Flight</h2>
              <p className="text-muted-foreground text-sm">
                Enter an IATA flight number above (e.g.{" "}
                <span className="font-mono text-primary">QR726</span>,{" "}
                <span className="font-mono text-primary">EK202</span>,{" "}
                <span className="font-mono text-primary">BA117</span>) to load live data.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              {["QR726", "EK202", "BA117", "SQ321"].map((f) => (
                <button key={f} onClick={() => { setInputValue(f); setFlightIata(f); navigate(`/track/${f}`); }}
                  className="px-3 py-1.5 rounded-md text-xs font-mono border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors">
                  {f}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Loading ── */}
        {flightIata && isLoading && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">
                Loading <span className="font-mono text-foreground">{flightIata}</span>…
              </span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 avi-panel"><SkeletonPanel rows={5} /></div>
              <div className="avi-panel"><SkeletonPanel rows={6} /></div>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {flightIata && error && !isLoading && (
          <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-destructive/10 border border-destructive/30">
              <AlertTriangle className="w-7 h-7 text-destructive" />
            </div>
            <div className="text-center space-y-1 max-w-sm">
              <h3 className="font-semibold text-foreground">Flight Not Found</h3>
              <p className="text-sm text-muted-foreground">
                {error.message || `No data found for ${flightIata}. The flight may not be active or the number may be incorrect.`}
              </p>
            </div>
            <button onClick={() => { setFlightIata(null); setInputValue(""); inputRef.current?.focus(); }}
              className="text-sm text-primary hover:underline">
              Try another flight
            </button>
          </div>
        )}

        {/* ── Flight data ── */}
        {flightIata && data && !isLoading && (
          <>
            {/* ── 1. Identity bar ── */}
            <div className="avi-panel">
              <div className="px-4 py-3">
                {/* Top row: flight number + status + airline */}
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10 border border-primary/20 shrink-0">
                    <Plane className="w-5 h-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-2xl font-bold font-mono text-foreground">{flight?.flight_iata}</span>
                      <span className={`status-badge ${getStatusClass(flight?.status)}`}>
                        {getStatusLabel(flight?.status)}
                      </span>
                      {fr24?.callsign && (
                        <span className="text-xs font-mono text-muted-foreground border border-border/60 rounded px-1.5 py-0.5">
                          {fr24.callsign}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {flight?.airline_name ?? flight?.airline_iata ?? "—"}
                      {fr24?.category ? ` · ${fr24.category}` : ""}
                    </p>
                  </div>
                  {/* Share button */}
                  <button
                    onClick={handleShare}
                    title="Copy shareable link"
                    className="ml-auto shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border/60 text-xs text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                  >
                    <Share2 className="w-3 h-3" />
                    <span className="hidden sm:inline">{copied ? "Copied!" : "Share"}</span>
                  </button>
                </div>

                {/* Route row */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="text-center min-w-[52px]">
                    <div className="text-xl font-bold font-mono text-foreground">{flight?.dep_iata ?? "—"}</div>
                    <div className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                      {depAirport?.city ?? flight?.dep_city ?? ""}
                    </div>
                  </div>
                  <div className="flex-1 flex items-center gap-1 text-muted-foreground/30 min-w-0">
                    <div className="flex-1 h-px bg-border" />
                    <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0" />
                    <div className="flex-1 h-px bg-border" />
                  </div>
                  <div className="text-center min-w-[52px]">
                    <div className="text-xl font-bold font-mono text-foreground">{flight?.arr_iata ?? "—"}</div>
                    <div className="text-[10px] text-muted-foreground truncate max-w-[80px]">
                      {arrAirport?.city ?? flight?.arr_city ?? ""}
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                {flight?.percent != null && (
                  <div>
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                      <span>{flight.dep_iata}</span>
                      <span className="text-primary font-semibold">{flight.percent}% complete</span>
                      <span>{flight.arr_iata}</span>
                    </div>
                    <div className="h-2 bg-border rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${flight.percent}%`,
                          background: "linear-gradient(90deg, oklch(0.62 0.18 230), oklch(0.72 0.18 55))",
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ── 2. Flight Times strip — always visible, prominent ── */}
            <div className="avi-panel">
              <PanelHeader icon={<Hourglass className="w-3.5 h-3.5" />} title="Flight Times" />
              <div className="time-strip-grid">
                <TimeCard
                  label="Elapsed"
                  value={elapsed != null ? formatDuration(elapsed) : "—"}
                  sub={flight?.dep_actual ?? flight?.dep_estimated ? `Dep ${formatLocalTime(flight?.dep_actual ?? flight?.dep_estimated).local} local` : undefined}
                  accent="cyan"
                />
                <TimeCard
                  label="Remaining"
                  value={remaining != null ? formatDuration(remaining) : "—"}
                  sub="to destination"
                  accent="amber"
                />
                <TimeCard
                  label="ETA (Arrival)"
                  value={etaIso ? formatTime(etaIso) : (flight?.arr_estimated ? formatLocalTime(flight.arr_estimated).local : "—")}
                  sub={arrAirport?.name ?? flight?.arr_name ?? undefined}
                  accent="primary"
                />
                <TimeCard
                  label="Total Duration"
                  value={totalDuration != null ? formatDuration(totalDuration) : "—"}
                  sub={fr24?.actualDistance ? formatDistance(fr24.actualDistance) : undefined}
                  accent="green"
                />
                <TimeCard
                  label="Local at Aircraft"
                  value={localAircraftTime ? localAircraftTime.time : "—"}
                  sub={
                    localAircraftTime
                      ? `${localAircraftTime.offsetLabel}${positionIsEstimated ? " · est" : ""}`
                      : undefined
                  }
                  accent="cyan"
                />
              </div>
            </div>

            {/* ── 3. Map ── */}
            <div className="avi-panel">
              <PanelHeader
                icon={<MapPin className="w-3.5 h-3.5" />}
                title="Live Position"
                extra={
                  hasLiveTelemetry ? (
                    <div className="flex items-center gap-1.5">
                      <div className="pulse-dot" />
                      <span className="text-xs text-muted-foreground">Live</span>
                    </div>
                  ) : positionIsEstimated ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-amber-400/80">⚠ Estimated</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">No live position</span>
                  )
                }
              />
              <div style={{ height: 360 }}>
                <FlightMap
                  lat={flight?.lat}
                  lng={flight?.lng}
                  depLat={depAirport?.lat}
                  depLng={depAirport?.lng}
                  arrLat={arrAirport?.lat}
                  arrLng={arrAirport?.lng}
                  heading={flight?.dir}
                  depIata={flight?.dep_iata}
                  arrIata={flight?.arr_iata}
                />
              </div>
            </div>

            {/* ── 4. Telemetry ── */}
            <div className="avi-panel">
              <PanelHeader
                icon={<Activity className="w-3.5 h-3.5" />}
                title="Telemetry"
                badge={fr24?.source ? `SRC: ${fr24.source}` : undefined}
                extra={
                  !hasLiveTelemetry && (
                    <span className="text-xs text-muted-foreground italic">
                      {positionIsEstimated ? "⚠ Estimated position (route progress)" : "Not airborne / no live data"}
                    </span>
                  )
                }
              />
              <div className="telem-grid">
                <TelemCell label="Latitude" value={flight?.lat != null ? flight.lat.toFixed(4) + "°" : undefined} />
                <TelemCell label="Longitude" value={flight?.lng != null ? flight.lng.toFixed(4) + "°" : undefined} />
                <TelemCell label="Altitude" value={flight?.alt} unit="ft" />
                <TelemCell label="Ground Speed" value={flight?.speed} unit="km/h" />
                <TelemCell label="Heading" value={flight?.dir != null ? `${flight.dir}°` : undefined} />
                <TelemCell
                  label="Vertical Speed"
                  value={flight?.v_speed != null ? (flight.v_speed > 0 ? `+${flight.v_speed}` : String(flight.v_speed)) : undefined}
                  unit="ft/min"
                />
                {fr24?.squawk && <TelemCell label="Squawk" value={fr24.squawk} highlight />}
                {fr24?.hex && <TelemCell label="ICAO Hex" value={fr24.hex} />}
              </div>
            </div>

            {/* ── 5. Wind & Weather (Open-Meteo) ── */}
            {weather && (
              <div className="avi-panel">
                <PanelHeader
                  icon={<Wind className="w-3.5 h-3.5" />}
                  title="Wind & Atmosphere"
                  badge={`@ ${weather.pressureLevel} (~${weather.altitudeFt.toLocaleString()} ft)`}
                />
                <div className="telem-grid">
                  <TelemCell
                    label="Wind Speed"
                    value={weather.windSpeedKmh}
                    unit="km/h"
                    highlight
                  />
                  <TelemCell
                    label="Wind Direction"
                    value={`${weather.windDirectionDeg}° ${windDirectionToCompass(weather.windDirectionDeg)}`}
                  />
                  <TelemCell
                    label="Temperature"
                    value={`${weather.temperatureCelsius}°C`}
                    highlight
                  />
                  <TelemCell
                    label="Pressure Level"
                    value={weather.pressureLevel}
                  />
                </div>
                <div className="px-4 pb-2">
                  <p className="text-[10px] text-muted-foreground/50">
                    Source: Open-Meteo · Pressure-level forecast · Updated {new Date(weather.fetchedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} UTC
                  </p>
                </div>
              </div>
            )}

            {/* ── 6. Schedule ── */}
            <div className="avi-panel">
              <PanelHeader icon={<Clock className="w-3.5 h-3.5" />} title="Schedule" />
              <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
                {/* Departure */}
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg font-bold font-mono text-foreground">{flight?.dep_iata ?? "—"}</span>
                    <span className="text-xs text-muted-foreground truncate">{depAirport?.name ?? flight?.dep_name ?? ""}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="avi-label mb-0.5">Scheduled (local)</div>
                      <LocalTimeDisplay localRaw={flight?.dep_time} utcRaw={flight?.dep_time_utc} />
                    </div>
                    <div>
                      <div className="avi-label mb-0.5">Actual (local)</div>
                      <LocalTimeDisplay
                        localRaw={flight?.dep_actual ?? flight?.dep_estimated}
                        utcRaw={flight?.dep_actual_utc ?? flight?.dep_estimated_utc}
                      />
                    </div>
                    <div>
                      <div className="avi-label mb-0.5">Delay</div>
                      <div className={`text-sm font-semibold ${(depDelay ?? 0) > 0 ? "text-yellow-400" : "text-green-400"}`}>
                        {formatDelay(depDelay)}
                      </div>
                    </div>
                    <div>
                      <div className="avi-label mb-0.5">Terminal / Gate</div>
                      <div className="avi-value text-sm">
                        {flight?.dep_terminal ? `T${flight.dep_terminal}` : "—"}
                        {flight?.dep_gate ? ` / G${flight.dep_gate}` : ""}
                      </div>
                    </div>
                    {fr24?.runwayTakeoff && (
                      <div>
                        <div className="avi-label mb-0.5">Runway Used</div>
                        <div className="avi-value text-sm font-mono text-primary">{fr24.runwayTakeoff}</div>
                      </div>
                    )}
                    {fr24?.datetimeTakeoff && (
                      <div>
                        <div className="avi-label mb-0.5">Takeoff (actual)</div>
                        <div className="avi-value text-sm">{formatTime(fr24.datetimeTakeoff)}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Arrival */}
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg font-bold font-mono text-foreground">{flight?.arr_iata ?? "—"}</span>
                    <span className="text-xs text-muted-foreground truncate">{arrAirport?.name ?? flight?.arr_name ?? ""}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="avi-label mb-0.5">Scheduled (local)</div>
                      <LocalTimeDisplay localRaw={flight?.arr_time} utcRaw={flight?.arr_time_utc} />
                    </div>
                    <div>
                      <div className="avi-label mb-0.5">Estimated (local)</div>
                      <LocalTimeDisplay
                        localRaw={flight?.arr_estimated ?? flight?.arr_actual}
                        utcRaw={flight?.arr_estimated_utc ?? flight?.arr_actual_utc}
                      />
                    </div>
                    <div>
                      <div className="avi-label mb-0.5">Delay</div>
                      <div className={`text-sm font-semibold ${(arrDelay ?? 0) > 0 ? "text-yellow-400" : "text-green-400"}`}>
                        {formatDelay(arrDelay)}
                      </div>
                    </div>
                    {remaining != null && (
                      <div>
                        <div className="avi-label mb-0.5">Remaining</div>
                        <div className="text-sm font-semibold text-amber-400 font-mono">{formatDuration(remaining)}</div>
                      </div>
                    )}
                    <div>
                      <div className="avi-label mb-0.5">Terminal / Gate</div>
                      <div className="avi-value text-sm">
                        {flight?.arr_terminal ? `T${flight.arr_terminal}` : "—"}
                        {flight?.arr_gate ? ` / G${flight.arr_gate}` : ""}
                      </div>
                    </div>
                    {fr24?.etaIso && (
                      <div>
                        <div className="avi-label mb-0.5">Arrival ETA</div>
                        <div className="avi-value text-sm font-mono text-primary font-bold">{formatTime(fr24.etaIso)}</div>
                      </div>
                    )}
                    {fr24?.runwayLanded && (
                      <div>
                        <div className="avi-label mb-0.5">Runway Landed</div>
                        <div className="avi-value text-sm font-mono text-primary">{fr24.runwayLanded}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* ── 6. Two-column: Aircraft + Prayer ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Aircraft info */}
              <div className="avi-panel">
                <PanelHeader icon={<Info className="w-3.5 h-3.5" />} title="Aircraft" />
                <div className="p-4 space-y-0">
                  {[
                    { label: "Registration", value: flight?.reg_number ?? fr24?.hex },
                    { label: "Model", value: flight?.model },
                    { label: "Manufacturer", value: flight?.manufacturer },
                    { label: "Aircraft ICAO", value: flight?.aircraft_icao },
                    { label: "Engine", value: flight?.engine_count ? `${flight.engine_count}x ${flight.engine ?? ""}`.trim() : flight?.engine },
                    { label: "Year Built", value: flight?.built },
                    { label: "Airline", value: flight?.airline_name },
                    { label: "Airline IATA", value: flight?.airline_iata },
                    { label: "Airline ICAO", value: flight?.airline_icao },
                    { label: "Flight ICAO", value: flight?.flight_icao },
                    { label: "Country", value: flight?.flag },
                  ].map(({ label, value }) => (
                    <InfoRow key={label} label={label} value={value} />
                  ))}
                </div>
              </div>

              {/* Prayer times */}
              <div className="avi-panel">
                <PanelHeader icon={<MoonIcon className="w-3.5 h-3.5" />} title="Prayer Times" />
                <PrayerPanel lat={flight?.lat} lng={flight?.lng} positionIsEstimated={positionIsEstimated} />
              </div>
            </div>

            {/* ── 7. FR24 Operations (full width) ── */}
            {fr24 && (
              <div className="avi-panel">
                <PanelHeader icon={<Radio className="w-3.5 h-3.5" />} title="Operations" badge="FR24" />
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-px bg-border">
                  {[
                    { label: "Callsign", value: fr24.callsign },
                    { label: "Squawk", value: fr24.squawk },
                    { label: "ICAO Hex", value: fr24.hex },
                    { label: "ADS-B Source", value: fr24.source },
                    { label: "Category", value: fr24.category },
                    { label: "Distance Flown", value: fr24.actualDistance ? formatDistance(fr24.actualDistance) : null },
                    { label: "Takeoff Runway", value: fr24.runwayTakeoff },
                    { label: "Landing Runway", value: fr24.runwayLanded },
                    { label: "Takeoff Time", value: fr24.datetimeTakeoff ? formatTime(fr24.datetimeTakeoff) : null },
                    { label: "Landing Time", value: fr24.datetimeLanded ? formatTime(fr24.datetimeLanded) : null },
                    { label: "FR24 ID", value: fr24.fr24Id },
                  ].filter(r => r.value != null).map(({ label, value }) => (
                    <div key={label} className="bg-card px-4 py-3 flex flex-col gap-0.5">
                      <span className="avi-label">{label}</span>
                      <span className="avi-value text-sm font-mono font-semibold">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Footer ── */}
            <div className="flex flex-wrap items-center justify-center gap-4 py-2 text-xs text-muted-foreground/40">
              <div className="flex items-center gap-1.5">
                <Timer className="w-3 h-3" />
                <span>Data refreshes every 15 min · Last updated {lastRefresh?.toLocaleTimeString() ?? "—"}</span>
              </div>
              {flight?.utc && (
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  <span>AirLabs UTC: <span className="font-mono">{flight.utc}</span></span>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
