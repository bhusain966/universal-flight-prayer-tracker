import { useState, useEffect, useCallback, useRef } from "react";
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
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso?: string | null): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    return `${hh}:${mm} UTC`;
  } catch {
    return iso;
  }
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

function getStatusClass(status?: string): string {
  const s = (status ?? "").toLowerCase();
  if (s === "en-route" || s === "active") return "status-active";
  if (s === "landed") return "status-landed";
  if (s === "cancelled") return "status-cancelled";
  if (s === "scheduled") return "status-scheduled";
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
    <div className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
      <span className="avi-label">{label}</span>
      <span className="avi-value text-sm font-mono">{value ?? "—"}</span>
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

/** Countdown showing mm:ss until next auto-refresh */
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
    if (!lastRefresh) {
      setSecondsLeft(null);
      return;
    }
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
        {/* Circular progress ring */}
        <svg className="w-7 h-7 -rotate-90" viewBox="0 0 28 28">
          <circle
            cx="14" cy="14" r="11"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-border"
          />
          <circle
            cx="14" cy="14" r="11"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray={`${2 * Math.PI * 11}`}
            strokeDashoffset={`${2 * Math.PI * 11 * (1 - pct / 100)}`}
            className="text-primary transition-all duration-1000"
            strokeLinecap="round"
          />
        </svg>
        <RefreshCw
          className={`absolute inset-0 m-auto w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors ${isFetching ? "animate-spin" : ""}`}
        />
      </div>
      <div className="hidden sm:flex flex-col items-start leading-tight">
        <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider">
          {isFetching ? "Updating…" : lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Not yet loaded"}
        </span>
        <span className="font-mono text-xs text-foreground">
          {isFetching ? "—:——" : lastRefresh ? `Next: ${mm}:${ss}` : "—"}
        </span>
      </div>
    </button>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export default function Home() {
  const [inputValue, setInputValue] = useState("");
  const [flightIata, setFlightIata] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
  }, [inputValue]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSearch();
  };

  const flight = data?.data?.flight;
  const depAirport = data?.data?.depAirport;
  const arrAirport = data?.data?.arrAirport;
  const fr24 = data?.fr24;
  const hasLiveTelemetry = flight?.lat != null && flight?.lng != null;
  const depDelay = flight?.dep_delay;
  const arrDelay = flight?.arr_delay;

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ── */}
      <header className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{
                background: "oklch(0.72 0.18 55 / 0.15)",
                border: "1px solid oklch(0.72 0.18 55 / 0.3)",
              }}
            >
              <Plane className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-wider text-foreground uppercase">
                Flight Tracker
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                Universal Live Flight Monitor
              </p>
            </div>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 flex-1 max-w-sm mx-4">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                className="flight-search-input pr-10 text-sm py-2"
                placeholder="QR726"
                value={inputValue}
                onChange={(e) =>
                  setInputValue(e.target.value.toUpperCase())
                }
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

          {/* Refresh countdown + live indicator */}
          <div className="flex items-center gap-3">
            {flightIata && (
              <RefreshCountdown
                lastRefresh={lastRefresh}
                intervalMs={REFRESH_INTERVAL_MS}
                isFetching={isFetching}
                onRefresh={() => refetch()}
              />
            )}
            {hasLiveTelemetry && (
              <div className="flex items-center gap-1.5">
                <div className="pulse-dot" />
                <span className="text-xs text-muted-foreground hidden sm:inline">
                  Live
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <main className="flex-1 container py-4">
        {/* Empty state */}
        {!flightIata && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6">
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center"
              style={{
                background: "oklch(0.72 0.18 55 / 0.08)",
                border: "1px solid oklch(0.72 0.18 55 / 0.2)",
              }}
            >
              <Plane className="w-10 h-10 text-primary/60" />
            </div>
            <div className="text-center space-y-2 max-w-sm">
              <h2 className="text-xl font-semibold text-foreground">
                Track Any Flight
              </h2>
              <p className="text-muted-foreground text-sm">
                Enter an IATA flight number above (e.g.{" "}
                <span className="font-mono text-primary">QR726</span>,{" "}
                <span className="font-mono text-primary">EK202</span>,{" "}
                <span className="font-mono text-primary">BA117</span>) to load
                live data.
              </p>
            </div>
            <div className="flex gap-2 flex-wrap justify-center">
              {["QR726", "EK202", "BA117", "SQ321"].map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    setInputValue(f);
                    setFlightIata(f);
                  }}
                  className="px-3 py-1.5 rounded-md text-xs font-mono border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Loading */}
        {flightIata && isLoading && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <RefreshCw className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">
                Loading flight data for{" "}
                <span className="font-mono text-foreground">{flightIata}</span>
                …
              </span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 avi-panel">
                <SkeletonPanel rows={5} />
              </div>
              <div className="avi-panel">
                <SkeletonPanel rows={6} />
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {flightIata && error && !isLoading && (
          <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center bg-destructive/10 border border-destructive/30">
              <AlertTriangle className="w-7 h-7 text-destructive" />
            </div>
            <div className="text-center space-y-1 max-w-sm">
              <h3 className="font-semibold text-foreground">Flight Not Found</h3>
              <p className="text-sm text-muted-foreground">
                {error.message ||
                  `No data found for ${flightIata}. The flight may not be active or the number may be incorrect.`}
              </p>
            </div>
            <button
              onClick={() => {
                setFlightIata(null);
                setInputValue("");
                inputRef.current?.focus();
              }}
              className="text-sm text-primary hover:underline"
            >
              Try another flight
            </button>
          </div>
        )}

        {/* Flight data */}
        {flightIata && data && !isLoading && (
          <div className="space-y-4">
            {/* Identity bar */}
            <div className="avi-panel">
              <div className="px-4 py-3 flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10 border border-primary/20">
                    <Plane className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xl font-bold font-mono text-foreground">
                        {flight?.flight_iata}
                      </span>
                      <span
                        className={`status-badge ${getStatusClass(flight?.status)}`}
                      >
                        {getStatusLabel(flight?.status)}
                      </span>
                      {fr24?.callsign && (
                        <span className="text-xs font-mono text-muted-foreground border border-border/60 rounded px-1.5 py-0.5">
                          {fr24.callsign}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {flight?.airline_name ?? flight?.airline_iata ?? "—"}
                      {fr24?.category ? ` · ${fr24.category}` : ""}
                    </p>
                  </div>
                </div>

                {/* Route */}
                <div className="flex items-center gap-3 flex-1 justify-center">
                  <div className="text-center">
                    <div className="text-2xl font-bold font-mono text-foreground">
                      {flight?.dep_iata ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {depAirport?.city ?? flight?.dep_city ?? ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground/40">
                    <div className="w-8 h-px bg-border" />
                    <Plane className="w-4 h-4 text-primary" />
                    <div className="w-8 h-px bg-border" />
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold font-mono text-foreground">
                      {flight?.arr_iata ?? "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {arrAirport?.city ?? flight?.arr_city ?? ""}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1">
                  {flight?.duration && (
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">
                        Duration
                      </div>
                      <div className="font-mono text-sm text-foreground">
                        {Math.floor(flight.duration / 60)}h {flight.duration % 60}m
                      </div>
                    </div>
                  )}
                  {fr24?.actualDistance && (
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground uppercase tracking-wider">
                        Dist. flown
                      </div>
                      <div className="font-mono text-sm text-primary">
                        {formatDistance(fr24.actualDistance)}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Progress bar */}
              {flight?.percent != null && (
                <div className="px-4 pb-3">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{flight.dep_iata}</span>
                    <span className="text-primary font-semibold">
                      {flight.percent}% complete
                    </span>
                    <span>{flight.arr_iata}</span>
                  </div>
                  <div className="h-1.5 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${flight.percent}%`,
                        background:
                          "linear-gradient(90deg, oklch(0.62 0.18 230), oklch(0.72 0.18 55))",
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Main grid */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              {/* Left: Map + Telemetry + Schedule */}
              <div className="xl:col-span-2 space-y-4">
                {/* Map */}
                <div className="avi-panel">
                  <PanelHeader
                    icon={<MapPin className="w-3.5 h-3.5" />}
                    title="Live Position"
                    extra={
                      hasLiveTelemetry ? (
                        <div className="flex items-center gap-1.5">
                          <div className="pulse-dot" />
                          <span className="text-xs text-muted-foreground">
                            Live
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          No live position
                        </span>
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

                {/* Telemetry */}
                <div className="avi-panel">
                  <PanelHeader
                    icon={<Activity className="w-3.5 h-3.5" />}
                    title="Telemetry"
                    badge={fr24?.source ? `SRC: ${fr24.source}` : undefined}
                    extra={
                      !hasLiveTelemetry && (
                        <span className="text-xs text-muted-foreground italic">
                          Not airborne / no live data
                        </span>
                      )
                    }
                  />
                  <div className="telem-grid">
                    <TelemCell
                      label="Latitude"
                      value={
                        flight?.lat != null
                          ? flight.lat.toFixed(4) + "°"
                          : undefined
                      }
                    />
                    <TelemCell
                      label="Longitude"
                      value={
                        flight?.lng != null
                          ? flight.lng.toFixed(4) + "°"
                          : undefined
                      }
                    />
                    <TelemCell
                      label="Altitude"
                      value={flight?.alt}
                      unit="ft"
                    />
                    <TelemCell
                      label="Ground Speed"
                      value={flight?.speed}
                      unit="km/h"
                    />
                    <TelemCell
                      label="Heading"
                      value={
                        flight?.dir != null ? `${flight.dir}°` : undefined
                      }
                    />
                    <TelemCell
                      label="Vertical Speed"
                      value={
                        flight?.v_speed != null
                          ? flight.v_speed > 0
                            ? `+${flight.v_speed}`
                            : String(flight.v_speed)
                          : undefined
                      }
                      unit="ft/min"
                    />
                    {fr24?.squawk && (
                      <TelemCell
                        label="Squawk"
                        value={fr24.squawk}
                        highlight
                      />
                    )}
                    {fr24?.hex && (
                      <TelemCell
                        label="ICAO Hex"
                        value={fr24.hex}
                      />
                    )}
                  </div>
                </div>

                {/* Schedule */}
                <div className="avi-panel">
                  <PanelHeader
                    icon={<Clock className="w-3.5 h-3.5" />}
                    title="Schedule"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-border">
                    {/* Departure */}
                    <div className="p-4 space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg font-bold font-mono text-foreground">
                          {flight?.dep_iata ?? "—"}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          {depAirport?.name ?? flight?.dep_name ?? ""}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="avi-label mb-0.5">Scheduled</div>
                          <div className="avi-value text-sm">
                            {formatTime(flight?.dep_time_utc)}
                          </div>
                        </div>
                        <div>
                          <div className="avi-label mb-0.5">Actual</div>
                          <div className="avi-value text-sm">
                            {formatTime(
                              flight?.dep_actual_utc ??
                                flight?.dep_estimated_utc
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="avi-label mb-0.5">Delay</div>
                          <div
                            className={`text-sm font-semibold ${(depDelay ?? 0) > 0 ? "text-yellow-400" : "text-green-400"}`}
                          >
                            {formatDelay(depDelay)}
                          </div>
                        </div>
                        <div>
                          <div className="avi-label mb-0.5">Terminal / Gate</div>
                          <div className="avi-value text-sm">
                            {flight?.dep_terminal
                              ? `T${flight.dep_terminal}`
                              : "—"}
                            {flight?.dep_gate ? ` / G${flight.dep_gate}` : ""}
                          </div>
                        </div>
                        {fr24?.runwayTakeoff && (
                          <div>
                            <div className="avi-label mb-0.5">Runway Used</div>
                            <div className="avi-value text-sm font-mono text-primary">
                              {fr24.runwayTakeoff}
                            </div>
                          </div>
                        )}
                        {fr24?.datetimeTakeoff && (
                          <div>
                            <div className="avi-label mb-0.5">Takeoff (actual)</div>
                            <div className="avi-value text-sm">
                              {formatTime(fr24.datetimeTakeoff)}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Arrival */}
                    <div className="p-4 space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg font-bold font-mono text-foreground">
                          {flight?.arr_iata ?? "—"}
                        </span>
                        <span className="text-xs text-muted-foreground truncate">
                          {arrAirport?.name ?? flight?.arr_name ?? ""}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="avi-label mb-0.5">Scheduled</div>
                          <div className="avi-value text-sm">
                            {formatTime(flight?.arr_time_utc)}
                          </div>
                        </div>
                        <div>
                          <div className="avi-label mb-0.5">Estimated</div>
                          <div className="avi-value text-sm">
                            {formatTime(
                              flight?.arr_estimated_utc ??
                                flight?.arr_actual_utc
                            )}
                          </div>
                        </div>
                        <div>
                          <div className="avi-label mb-0.5">Delay</div>
                          <div
                            className={`text-sm font-semibold ${(arrDelay ?? 0) > 0 ? "text-yellow-400" : "text-green-400"}`}
                          >
                            {formatDelay(arrDelay)}
                          </div>
                        </div>
                        {flight?.eta != null && (
                          <div>
                            <div className="avi-label mb-0.5">ETA (remaining)</div>
                            <div className="avi-value text-sm font-semibold text-primary">
                              {Math.floor(flight.eta / 60)}h {flight.eta % 60}m
                            </div>
                          </div>
                        )}
                        <div>
                          <div className="avi-label mb-0.5">Terminal / Gate</div>
                          <div className="avi-value text-sm">
                            {flight?.arr_terminal
                              ? `T${flight.arr_terminal}`
                              : "—"}
                            {flight?.arr_gate ? ` / G${flight.arr_gate}` : ""}
                          </div>
                        </div>
                        {fr24?.etaIso && (
                          <div>
                            <div className="avi-label mb-0.5">FR24 ETA</div>
                            <div className="avi-value text-sm font-mono text-primary">
                              {formatTime(fr24.etaIso)}
                            </div>
                          </div>
                        )}
                        {fr24?.runwayLanded && (
                          <div>
                            <div className="avi-label mb-0.5">Runway Landed</div>
                            <div className="avi-value text-sm font-mono text-primary">
                              {fr24.runwayLanded}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Aircraft + FR24 Ops + Prayer */}
              <div className="space-y-4">
                {/* Aircraft info */}
                <div className="avi-panel">
                  <PanelHeader
                    icon={<Info className="w-3.5 h-3.5" />}
                    title="Aircraft"
                  />
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

                {/* FR24 Operational data */}
                {fr24 && (
                  <div className="avi-panel">
                    <PanelHeader
                      icon={<Radio className="w-3.5 h-3.5" />}
                      title="Operations"
                      badge="FR24"
                    />
                    <div className="p-4 space-y-0">
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
                      ].map(({ label, value }) => (
                        <InfoRow key={label} label={label} value={value} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Prayer times */}
                <div className="avi-panel">
                  <PanelHeader
                    icon={<MoonIcon className="w-3.5 h-3.5" />}
                    title="Prayer Times"
                  />
                  <PrayerPanel lat={flight?.lat} lng={flight?.lng} />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-center gap-4 py-2">
              <div className="flex items-center gap-2">
                <Timer className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-xs text-muted-foreground/40">
                  Data refreshes every 15 min · Last updated{" "}
                  {lastRefresh?.toLocaleTimeString() ?? "—"}
                </span>
              </div>
              {flight?.utc && (
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-muted-foreground/40" />
                  <span className="text-xs text-muted-foreground/40">
                    AirLabs UTC: <span className="font-mono">{flight.utc}</span>
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
