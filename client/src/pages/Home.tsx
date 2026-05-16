import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useLocation, Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
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
  Calendar,
  Plus,
  Trash2,
  X,
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
 * Live clock hook: returns the current local time string (HH:MM:SS) and UTC offset label
 * at the given lat/lng. Uses the Google Maps Timezone API for DST-aware offsets.
 * Falls back to longitude/15 solar-time estimate while the API call is in flight.
 * Ticks every second. Returns null when position is unavailable.
 */
function useLocalAircraftTime(
  lng?: number | null,
  lat?: number | null,
): { time: string; offsetLabel: string; tzName?: string } | null {
  // Stable reference for the timezone query input
  const [tzInput, setTzInput] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (lat != null && lng != null) {
      // Only update when position changes significantly (>0.5 deg) to avoid hammering the API
      setTzInput(prev => {
        if (!prev) return { lat, lng };
        if (Math.abs(prev.lat - lat) > 0.5 || Math.abs(prev.lng - lng) > 0.5) return { lat, lng };
        return prev;
      });
    }
  }, [lat, lng]);

  const { data: tzData } = trpc.flight.timezone.useQuery(
    { lat: tzInput?.lat ?? 0, lng: tzInput?.lng ?? 0 },
    {
      enabled: tzInput != null,
      staleTime: 30 * 60 * 1000, // cache for 30 min — timezone rarely changes mid-flight
      retry: 1,
    }
  );

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (lng == null) return null;

  // Use real DST-aware offset from API; fall back to solar-time estimate
  const totalOffsetSec = tzData?.totalOffsetSec ?? Math.round(lng / 15) * 3600;
  const now = new Date();
  const localMs = now.getTime() + totalOffsetSec * 1000;
  const local = new Date(localMs);
  const hh = String(local.getUTCHours()).padStart(2, "0");
  const mm = String(local.getUTCMinutes()).padStart(2, "0");
  const ss = String(local.getUTCSeconds()).padStart(2, "0");
  const offsetHours = totalOffsetSec / 3600;
  const sign = offsetHours >= 0 ? "+" : "";
  const offsetFmt = Number.isInteger(offsetHours)
    ? `UTC${sign}${offsetHours}`
    : `UTC${sign}${Math.floor(offsetHours)}:${String(Math.round((Math.abs(offsetHours) % 1) * 60)).padStart(2, "0")}`;
  // Suppress lint warning — tick forces re-render each second
  void tick;
  return {
    time: `${hh}:${mm}:${ss}`,
    offsetLabel: offsetFmt,
    tzName: tzData?.timeZoneName,
  };
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

  // Detect landed state from previous data so we can stop polling
  const [isLandedLocked, setIsLandedLocked] = useState(false);
  // Track whether we have already saved this flight to history
  const [historySaved, setHistorySaved] = useState(false);
  // Track whether we have already saved the FR24-fallback flight to history
  const [fr24HistorySaved, setFr24HistorySaved] = useState(false);
  // Store the prayer summary after the history record is saved (for Share Arrival)
  const [lastSavedPrayers, setLastSavedPrayers] = useState<{ count: number; names: string }>({ count: 0, names: "" });

  // Upcoming Trips
  const [showAddTrip, setShowAddTrip] = useState(false);
  const [tripForm, setTripForm] = useState({ flightIata: "", scheduledDepUtc: "", notes: "" });
  const { data: upcomingTrips, refetch: refetchTrips } = trpc.flight.listTrips.useQuery();
  const addTripMutation = trpc.flight.addTrip.useMutation({
    onSuccess: () => { refetchTrips(); setShowAddTrip(false); setTripForm({ flightIata: "", scheduledDepUtc: "", notes: "" }); toast.success("Trip added to Upcoming Trips"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteTripMutation = trpc.flight.deleteTrip.useMutation({
    onSuccess: () => { refetchTrips(); toast.success("Trip removed"); },
  });

  // Auto-activate tracking when a trip's departure time arrives
  useEffect(() => {
    if (!upcomingTrips || upcomingTrips.length === 0) return;
    const interval = setInterval(() => {
      const now = Date.now();
      for (const trip of upcomingTrips) {
        const dep = new Date(trip.scheduledDepUtc).getTime();
        // Activate tracking 5 minutes before departure up to 2 hours after
        if (dep - now <= 5 * 60 * 1000 && now - dep <= 2 * 60 * 60 * 1000) {
          if (flightIata !== trip.flightIata) {
            setFlightIata(trip.flightIata);
            setInputValue(trip.flightIata);
            navigate(`/track/${trip.flightIata}`);
            toast.success(`Auto-activating tracking for ${trip.flightIata}`);
          }
          break;
        }
      }
    }, 30_000); // check every 30 seconds
    return () => clearInterval(interval);
  }, [upcomingTrips, flightIata, navigate]);

  const { data, isLoading, error, refetch, isFetching } =
    trpc.flight.lookup.useQuery(
      { flightIata: flightIata ?? "" },
      {
        enabled: !!flightIata && !isLandedLocked,
        // Stop auto-refresh once landed — no more API calls needed
        refetchInterval: isLandedLocked ? false : REFRESH_INTERVAL_MS,
        staleTime: 14 * 60 * 1000,
        retry: 1,
      }
    );

  // FR24 full tracking: when AirLabs quota is exhausted, use FR24 for live position + full data
  const isQuotaError = !!error && error.data?.code === 'TOO_MANY_REQUESTS';
  const fr24LandedLocked = useRef(false);
  const {
    data: fr24TrackingData,
    isLoading: fr24FallbackLoading,
    error: fr24TrackingError,
  } = trpc.flight.fr24FullTracking.useQuery(
    { flightIata: flightIata ?? "" },
    {
      enabled: isQuotaError && !!flightIata && !fr24LandedLocked.current,
      refetchInterval: (query) => {
        const d = query.state.data;
        if (d?.isLanded || d?.summaryOnly) return false;
        return REFRESH_INTERVAL_MS;
      },
      staleTime: 14 * 60 * 1000,
      retry: 1,
    }
  );

  // Lock FR24 polling once landed
  useEffect(() => {
    if (fr24TrackingData?.isLanded) fr24LandedLocked.current = true;
  }, [fr24TrackingData?.isLanded]);

  // Keep fr24FallbackData as alias for backward compat with auto-save useEffect
  const fr24FallbackData = fr24TrackingData;

  // Lock polling as soon as we detect a landed flight
  useEffect(() => {
    if (data?.isLanded && !isLandedLocked) {
      setIsLandedLocked(true);
    }
  }, [data?.isLanded, isLandedLocked]);

  // Reset history-saved flags when a new flight is searched
  useEffect(() => {
    setHistorySaved(false);
    setFr24HistorySaved(false);
  }, [flightIata]);

  useEffect(() => {
    if (data) setLastRefresh(new Date());
  }, [data]);

  // Auto-save mutation — called once when flight lands
  const saveHistory = trpc.flight.saveHistory.useMutation();
  const utils = trpc.useUtils();

  // Recent flights query — always loaded for chips
  const { data: recentFlights } = trpc.flight.recentFlights.useQuery({ limit: 10 });

  // Backfill mutation — patches existing history rows that have missing local-time / delay fields
  const backfillHistory = trpc.flight.backfillHistory.useMutation({
    onSuccess: (res) => {
      if (res.patched > 0) {
        utils.flight.recentFlights.invalidate();
        utils.flight.historyList.invalidate();
      }
    },
  });

  // Run backfill once per session when the history panel is visible and has rows with missing data
  const backfillRanRef = useRef(false);
  useEffect(() => {
    if (backfillRanRef.current || !recentFlights || recentFlights.length === 0) return;
    const needsBackfill = recentFlights.some(r => !r.actualDepLocal && !r.scheduledDepLocal);
    if (!needsBackfill) return;
    backfillRanRef.current = true;
    backfillHistory.mutate();
  }, [recentFlights]);

  // Auto-save flight history when landing is detected
  useEffect(() => {
    if (!data?.isLanded || historySaved || !data?.data?.flight) return;
    const f = data.data.flight;
    const fr24Data = data.fr24;

    // Compute dep/arr delay in minutes
    function diffMin(a?: string | null, b?: string | null): number | undefined {
      if (!a || !b) return undefined;
      const da = new Date(a.includes('T') ? a : a.replace(' ', 'T') + 'Z');
      const db = new Date(b.includes('T') ? b : b.replace(' ', 'T') + 'Z');
      const diff = Math.round((da.getTime() - db.getTime()) / 60000);
      return isNaN(diff) ? undefined : diff;
    }

    const depUtc = f.dep_actual_utc ?? f.dep_time_utc;
    const arrUtc = f.arr_actual_utc ?? fr24Data?.datetimeLanded ?? f.arr_estimated_utc ?? f.arr_time_utc;
    const depMs = depUtc ? new Date(depUtc.includes('T') ? depUtc : depUtc.replace(' ', 'T') + 'Z').getTime() : null;
    const arrMs = arrUtc ? new Date(arrUtc.includes('T') ? arrUtc : arrUtc.replace(' ', 'T') + 'Z').getTime() : null;

    const actualDurationMin = (depMs && arrMs && arrMs > depMs)
      ? Math.round((arrMs - depMs) / 60000)
      : undefined;

    // Use midpoint lat/lng for prayer calculation (or last known position)
    const midLat = f.lat ?? data.data.depAirport?.lat ?? null;
    const midLng = f.lng ?? data.data.depAirport?.lng ?? null;

    const buildRecord = (prayerCount = 0, prayerNames?: string, prayerDetails?: string) => ({
      flightIata: f.flight_iata ?? flightIata ?? '',
      flightIcao: f.flight_icao ?? undefined,
      airlineName: f.airline_name ?? undefined,
      airlineIata: f.airline_iata ?? undefined,
      aircraft: f.model ?? f.aircraft_icao ?? undefined,
      regNumber: f.reg_number ?? undefined,
      depIata: f.dep_iata ?? undefined,
      depCity: data.data.depAirport?.city ?? f.dep_city ?? undefined,
      arrIata: f.arr_iata ?? undefined,
      arrCity: data.data.arrAirport?.city ?? f.arr_city ?? undefined,
      scheduledDepUtc: f.dep_time_utc ?? undefined,
      actualDepUtc: f.dep_actual_utc ?? undefined,
      scheduledArrUtc: f.arr_time_utc ?? undefined,
      actualArrUtc: f.arr_actual_utc ?? fr24Data?.datetimeLanded ?? undefined,
      // AirLabs local fields are preferred; fall back to extracting HH:MM from UTC strings
      scheduledDepLocal: f.dep_time ?? (f.dep_time_utc ? f.dep_time_utc.replace(' ', 'T') : undefined),
      actualDepLocal: f.dep_actual ?? (f.dep_actual_utc ? f.dep_actual_utc.replace(' ', 'T') : undefined),
      scheduledArrLocal: f.arr_time ?? (f.arr_time_utc ? f.arr_time_utc.replace(' ', 'T') : undefined),
      actualArrLocal: f.arr_actual ?? (f.arr_actual_utc ? f.arr_actual_utc.replace(' ', 'T') : undefined),
      depDelayMin: f.dep_delay ?? diffMin(f.dep_actual_utc, f.dep_time_utc),
      arrDelayMin: f.arr_delay ?? diffMin(f.arr_actual_utc ?? fr24Data?.datetimeLanded, f.arr_time_utc),
      durationMin: f.duration ?? undefined,
      actualDurationMin,
      distanceKm: fr24Data?.actualDistance ? Math.round(fr24Data.actualDistance) : undefined,
      baggageBelt: f.arr_baggage != null ? String(f.arr_baggage) : undefined,
      arrTerminal: f.arr_terminal ?? undefined,
      arrGate: f.arr_gate ?? undefined,
      runwayLanded: fr24Data?.runwayLanded ?? undefined,
      prayerCount,
      prayerNames,
      prayerDetails,
    });

    setHistorySaved(true);

    // If we have dep/arr UTC and a position, compute prayers during flight server-side
    if (depUtc && arrUtc && midLat != null && midLng != null) {
      utils.client.flight.flightPrayerSummary
        .query({ depUtc, arrUtc, lat: midLat, lng: midLng })
        .then((ps) => {
          saveHistory.mutate(buildRecord(ps.prayerCount, ps.prayerNames, ps.prayerDetails), {
            onSuccess: () => {
              utils.flight.recentFlights.invalidate();
              try {
                const names = ps.prayerNames ? JSON.parse(ps.prayerNames) as string[] : [];
                setLastSavedPrayers({ count: ps.prayerCount, names: names.join(", ") });
              } catch { /* ignore */ }
            },
          });
        })
        .catch(() => {
          // Fall back to saving without prayer data
          saveHistory.mutate(buildRecord(), {
            onSuccess: () => utils.flight.recentFlights.invalidate(),
          });
        });
    } else {
      saveHistory.mutate(buildRecord(), {
        onSuccess: () => utils.flight.recentFlights.invalidate(),
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.isLanded, historySaved]);

  // Auto-save FR24 fallback flight history when fr24FallbackData shows a landed flight
  useEffect(() => {
    if (!fr24FallbackData?.isLanded || fr24HistorySaved) return;
    const f = fr24FallbackData;
    // fr24Lookup returns datetimeTakeoff / datetimeLanded as ISO strings or null
    const depUtc = f.datetimeTakeoff ?? undefined;
    const arrUtc = f.datetimeLanded ?? undefined;

    // Use the great-circle midpoint from the enriched fr24Lookup output
    // (computed server-side from airport-data-js, no API quota consumed)
    const midLat: number | null = f.midLat ?? null;
    const midLng: number | null = f.midLng ?? null;

    const buildFr24Record = (prayerCount = 0, prayerNames?: string, prayerDetails?: string) => ({
      flightIata: f.flightIata ?? flightIata ?? '',
      flightIcao: undefined,
      airlineName: f.airline ?? undefined,
      airlineIata: undefined,
      aircraft: f.aircraft ?? undefined,
      regNumber: f.registration ?? undefined,
      depIata: f.depIata ?? undefined,
      depCity: undefined,
      arrIata: f.arrIata ?? undefined,
      arrCity: undefined,
      scheduledDepUtc: undefined,
      actualDepUtc: depUtc,
      scheduledArrUtc: undefined,
      actualArrUtc: arrUtc,
      // Derive local display strings from FR24 ISO timestamps (UTC-based)
      // The history table shows these as HH:MM so UTC time is acceptable here
      scheduledDepLocal: undefined,
      actualDepLocal: depUtc ?? undefined,
      scheduledArrLocal: undefined,
      actualArrLocal: arrUtc ?? undefined,
      depDelayMin: undefined,
      arrDelayMin: undefined,
      durationMin: f.flightTimeMinutes ?? undefined,
      actualDurationMin: f.flightTimeMinutes ?? undefined,
      distanceKm: f.actualDistanceKm ? Math.round(f.actualDistanceKm) : undefined,
      baggageBelt: undefined,
      arrTerminal: undefined,
      arrGate: undefined,
      runwayLanded: f.runwayLanded ?? undefined,
      prayerCount,
      prayerNames,
      prayerDetails,
    });

    setFr24HistorySaved(true);

    if (depUtc && arrUtc && midLat != null && midLng != null) {
      utils.client.flight.flightPrayerSummary
        .query({ depUtc, arrUtc, lat: midLat, lng: midLng })
        .then((ps) => {
          saveHistory.mutate(buildFr24Record(ps.prayerCount, ps.prayerNames, ps.prayerDetails), {
            onSuccess: () => {
              utils.flight.recentFlights.invalidate();
              utils.flight.historyList.invalidate();
              try {
                const names = ps.prayerNames ? JSON.parse(ps.prayerNames) as string[] : [];
                setLastSavedPrayers({ count: ps.prayerCount, names: names.join(", ") });
              } catch { /* ignore */ }
            },
          });
        })
        .catch(() => {
          saveHistory.mutate(buildFr24Record(), {
            onSuccess: () => {
              utils.flight.recentFlights.invalidate();
              utils.flight.historyList.invalidate();
            },
          });
        });
    } else {
      saveHistory.mutate(buildFr24Record(), {
        onSuccess: () => {
          utils.flight.recentFlights.invalidate();
          utils.flight.historyList.invalidate();
        },
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fr24FallbackData?.isLanded, fr24HistorySaved]);

  const handleSearch = useCallback(() => {
    const val = inputValue.trim().toUpperCase();
    if (val.length < 2) return;
    // Reset landed lock when a new flight is entered
    setIsLandedLocked(false);
    setHistorySaved(false);
    setFr24HistorySaved(false);
    setLastSavedPrayers({ count: 0, names: "" });
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
  const isLanded = data?.isLanded ?? isLandedLocked;
  const apiQuota = data?.apiQuota ?? null;
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
      window.open(url, "_blank");
    }
  }, [flightIata]);

  const handleShareArrival = useCallback(async () => {
    if (!flight) return;
    const route = `${flight.dep_iata ?? "?"} → ${flight.arr_iata ?? "?"}`;
    const arrTime = flight.arr_actual
      ? formatLocalTime(flight.arr_actual).local
      : fr24?.datetimeLanded
      ? formatTime(fr24.datetimeLanded)
      : null;
    const delayStr =
      (flight.arr_delay ?? 0) === 0
        ? "on time"
        : (flight.arr_delay ?? 0) > 0
        ? `${flight.arr_delay} min late`
        : `${Math.abs(flight.arr_delay ?? 0)} min early`;
    const prayerLine =
      lastSavedPrayers.count > 0
        ? `Prayed ${lastSavedPrayers.count} prayer${lastSavedPrayers.count !== 1 ? "s" : ""} (${lastSavedPrayers.names}) during the flight.`
        : "No prayers during this flight.";
    const beltLine = flight.arr_baggage ? `Baggage belt ${flight.arr_baggage}.` : "";
    const text = [
      `✈️ ${flight.flight_iata ?? flightIata} ${route}`,
      arrTime ? `Landed ${arrTime} (${delayStr}).` : `Landed (${delayStr}).`,
      prayerLine,
      beltLine,
    ]
      .filter(Boolean)
      .join(" ");
    const url = `${window.location.origin}/track/${flightIata}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: `${flight.flight_iata ?? flightIata} Arrival`, text, url });
        return;
      } catch {
        // user cancelled or not supported — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      toast.success("Copied to clipboard", { description: "Arrival summary ready to paste." });
    } catch {
      toast.error("Could not copy", { description: "Please copy the URL manually." });
    }
  }, [flight, fr24, flightIata, lastSavedPrayers]);

  // Compute time metrics
  const depActual = flight?.dep_actual_utc ?? flight?.dep_estimated_utc;
  const elapsed = elapsedMinutes(depActual);
  const remaining = flight?.eta ?? null;
  const etaIso = fr24?.etaIso ?? flight?.arr_estimated_utc ?? flight?.arr_time_utc;
  const totalDuration = flight?.duration ?? null;

  // Live local time at aircraft position (ticks every second, DST-aware via Maps Timezone API)
  const localAircraftTime = useLocalAircraftTime(flight?.lng, flight?.lat);

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

          {/* History link + Refresh + live dot */}
          <div className="flex items-center gap-3 shrink-0 ml-auto">
            <Link href="/history">
              <button className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground hover:text-amber-400 transition-colors">
                <Clock className="w-3.5 h-3.5" />
                <span>History</span>
              </button>
            </Link>
            {flightIata && (
              isLanded ? (
                // Show a static "Landed" badge instead of the refresh control
                <div className="flex items-center gap-1.5 text-xs" style={{ color: "oklch(0.75 0.18 145)" }}>
                  <Plane className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline font-semibold">Landed · Tracking stopped</span>
                  <span className="sm:hidden font-semibold">Landed</span>
                </div>
              ) : (
                <RefreshCountdown
                  lastRefresh={lastRefresh}
                  intervalMs={REFRESH_INTERVAL_MS}
                  isFetching={isFetching}
                  onRefresh={() => refetch()}
                />
              )
            )}
            {!isLanded && hasLiveTelemetry ? (
              <div className="flex items-center gap-1.5">
                <div className="pulse-dot" />
                <span className="text-xs text-muted-foreground hidden sm:inline">ADS-B Live</span>
              </div>
            ) : !isLanded && positionIsEstimated ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-amber-400/80">⚠ Estimated</span>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {/* ── Body ── */}
      <main className="flex-1 container py-4 space-y-4">

        {/* ── Empty state ── */}
        {!flightIata && (
          <div className="flex flex-col items-center justify-center min-h-[40vh] gap-6">
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

            {/* Recent flights chips */}
            {recentFlights && recentFlights.length > 0 ? (
              <div className="flex flex-col items-center gap-3 w-full max-w-lg">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Recent Flights</p>
                <div className="flex gap-2 flex-wrap justify-center">
                  {recentFlights.map((rf) => (
                    <button
                      key={rf.id}
                      onClick={() => { setInputValue(rf.flightIata); setFlightIata(rf.flightIata); navigate(`/track/${rf.flightIata}`); }}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-mono border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                    >
                      <Plane className="w-3 h-3" />
                      <span className="font-semibold">{rf.flightIata}</span>
                      {rf.depIata && rf.arrIata && (
                        <span className="text-muted-foreground/60">{rf.depIata}→{rf.arrIata}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap justify-center">
                {["QR726", "EK202", "BA117", "SQ321"].map((f) => (
                  <button key={f} onClick={() => { setInputValue(f); setFlightIata(f); navigate(`/track/${f}`); }}
                    className="px-3 py-1.5 rounded-md text-xs font-mono border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors">
                    {f}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Upcoming Trips Panel (always shown on empty state) ── */}
        {!flightIata && (
          <div className="avi-panel">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/40">
              <div className="flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Upcoming Trips</span>
              </div>
              <button
                onClick={() => { setTripForm(f => ({ ...f, flightIata: inputValue })); setShowAddTrip(true); }}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add Trip
              </button>
            </div>
            {upcomingTrips && upcomingTrips.length > 0 ? (
              <div className="divide-y divide-border/30">
                {upcomingTrips.map((trip) => {
                  const dep = new Date(trip.scheduledDepUtc);
                  const now = Date.now();
                  const msUntil = dep.getTime() - now;
                  const isPast = msUntil < 0;
                  const daysUntil = Math.floor(Math.abs(msUntil) / (1000 * 60 * 60 * 24));
                  const hoursUntil = Math.floor((Math.abs(msUntil) % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                  const minsUntil = Math.floor((Math.abs(msUntil) % (1000 * 60 * 60)) / (1000 * 60));
                  const countdownLabel = isPast
                    ? `Departed ${daysUntil > 0 ? `${daysUntil}d ` : ''}${hoursUntil}h ${minsUntil}m ago`
                    : daysUntil > 0
                    ? `in ${daysUntil}d ${hoursUntil}h`
                    : hoursUntil > 0
                    ? `in ${hoursUntil}h ${minsUntil}m`
                    : `in ${minsUntil}m`;
                  const isImminent = !isPast && msUntil <= 5 * 60 * 1000;
                  return (
                    <div key={trip.id} className="flex items-center gap-3 px-4 py-3 hover:bg-card/40 transition-colors">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                        style={{
                          background: isImminent ? 'oklch(0.55 0.18 145 / 0.15)' : 'oklch(0.72 0.18 55 / 0.08)',
                          border: `1px solid ${isImminent ? 'oklch(0.55 0.18 145 / 0.4)' : 'oklch(0.72 0.18 55 / 0.2)'}`,
                        }}
                      >
                        <Plane className="w-4 h-4" style={{ color: isImminent ? 'oklch(0.75 0.18 145)' : 'oklch(0.72 0.18 55)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono font-bold text-sm text-foreground">{trip.flightIata}</span>
                          {trip.depIata && trip.arrIata && (
                            <span className="text-xs text-muted-foreground font-mono">{trip.depIata} → {trip.arrIata}</span>
                          )}
                          {isImminent && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'oklch(0.55 0.18 145 / 0.2)', color: 'oklch(0.75 0.18 145)' }}>IMMINENT</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-xs text-muted-foreground">
                            {trip.scheduledDepLocal
                              ? trip.scheduledDepLocal.replace('T', ' ').slice(0, 16)
                              : dep.toLocaleString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })}
                          </span>
                          <span className={`text-xs font-semibold ${isPast ? 'text-muted-foreground' : isImminent ? 'text-green-400' : 'text-primary'}`}>
                            {countdownLabel}
                          </span>
                        </div>
                        {trip.notes && <p className="text-xs text-muted-foreground/60 mt-0.5 truncate">{trip.notes}</p>}
                      </div>
                      <button
                        onClick={() => { setFlightIata(trip.flightIata); setInputValue(trip.flightIata); navigate(`/track/${trip.flightIata}`); }}
                        className="text-xs px-2.5 py-1 rounded-md border border-primary/30 text-primary hover:bg-primary/10 transition-colors shrink-0"
                      >
                        Track
                      </button>
                      <button
                        onClick={() => deleteTripMutation.mutate({ id: trip.id })}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
                <Calendar className="w-8 h-8 opacity-30" />
                <p className="text-sm">No upcoming trips yet.</p>
                <p className="text-xs opacity-60">Add a future flight to get a countdown and auto-tracking.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Add Trip Modal ── */}
        {showAddTrip && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'oklch(0 0 0 / 0.7)' }}>
            <div className="avi-panel w-full max-w-md">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm">Add Upcoming Trip</span>
                </div>
                <button onClick={() => setShowAddTrip(false)} className="p-1 rounded-md hover:bg-card/60 text-muted-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Flight Number *</label>
                  <input
                    value={tripForm.flightIata}
                    onChange={e => setTripForm(f => ({ ...f, flightIata: e.target.value.toUpperCase() }))}
                    placeholder="e.g. QR726"
                    className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm font-mono text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Scheduled Departure (local time) *</label>
                  <input
                    type="datetime-local"
                    value={tripForm.scheduledDepUtc}
                    onChange={e => setTripForm(f => ({ ...f, scheduledDepUtc: e.target.value }))}
                    className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                  <p className="text-[10px] text-muted-foreground/60 mt-1">Enter in your device's local time. Tracking activates 5 min before departure.</p>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground uppercase tracking-wider mb-1.5 block">Notes (optional)</label>
                  <input
                    value={tripForm.notes}
                    onChange={e => setTripForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="e.g. Business trip to Doha"
                    className="w-full px-3 py-2 rounded-md bg-card border border-border text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div className="flex gap-2 justify-end pt-1">
                  <button onClick={() => setShowAddTrip(false)} className="px-3 py-1.5 text-sm rounded-md border border-border text-muted-foreground hover:bg-card/60 transition-colors">Cancel</button>
                  <button
                    disabled={!tripForm.flightIata.trim() || !tripForm.scheduledDepUtc || addTripMutation.isPending}
                    onClick={() => {
                      if (!tripForm.flightIata.trim() || !tripForm.scheduledDepUtc) return;
                      addTripMutation.mutate({
                        flightIata: tripForm.flightIata.trim(),
                        // datetime-local returns local time — new Date() converts it to UTC correctly
                        scheduledDepUtc: new Date(tripForm.scheduledDepUtc).toISOString(),
                        notes: tripForm.notes || undefined,
                      });
                    }}
                    className="px-4 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {addTripMutation.isPending ? 'Saving…' : 'Add Trip'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Flight History Table (shown on empty state when history exists) ── */}
        {!flightIata && recentFlights && recentFlights.length > 0 && (
          <div className="avi-panel">
            <PanelHeader icon={<Clock className="w-3.5 h-3.5" />} title="Flight History" />
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/50 text-muted-foreground">
                    <th className="text-left px-4 py-2 font-medium">Flight</th>
                    <th className="text-left px-4 py-2 font-medium">Route</th>
                    <th className="text-left px-4 py-2 font-medium">Dep (local)</th>
                    <th className="text-left px-4 py-2 font-medium">Arr (local)</th>
                    <th className="text-left px-4 py-2 font-medium">Dep delay</th>
                    <th className="text-left px-4 py-2 font-medium">Arr delay</th>
                    <th className="text-left px-4 py-2 font-medium">Duration</th>
                    <th className="text-left px-4 py-2 font-medium">Distance</th>
                    <th className="text-left px-4 py-2 font-medium">Prayers</th>
                    <th className="text-left px-4 py-2 font-medium">Baggage</th>
                  </tr>
                </thead>
                <tbody>
                  {recentFlights.map((rf) => {
                    const depDelay = rf.depDelayMin;
                    const arrDelay = rf.arrDelayMin;
                    const delayClass = (d: number | null | undefined) =>
                      d == null ? "text-muted-foreground" : d > 0 ? "text-yellow-400" : d < 0 ? "text-green-400" : "text-green-400";
                    const delayLabel = (d: number | null | undefined) =>
                      d == null ? "—" : d > 0 ? `+${d}m` : d < 0 ? `${d}m (early)` : "On time";
                    return (
                      <tr
                        key={rf.id}
                        className="border-b border-border/30 hover:bg-card/50 cursor-pointer transition-colors"
                        onClick={() => { setInputValue(rf.flightIata); setFlightIata(rf.flightIata); navigate(`/track/${rf.flightIata}`); }}
                      >
                        <td className="px-4 py-2.5">
                          <span className="font-mono font-bold text-foreground">{rf.flightIata}</span>
                          {rf.airlineName && <span className="block text-muted-foreground/60 text-[10px]">{rf.airlineName}</span>}
                        </td>
                        <td className="px-4 py-2.5 font-mono">
                          {rf.depIata ?? "—"} → {rf.arrIata ?? "—"}
                          {(rf.depCity || rf.arrCity) && (
                            <span className="block text-muted-foreground/60 text-[10px]">
                              {rf.depCity ?? ""}{rf.depCity && rf.arrCity ? " → " : ""}{rf.arrCity ?? ""}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono">
                          {rf.actualDepLocal
                            ? rf.actualDepLocal.match(/(\d{2}:\d{2})/)?.[1] ?? "—"
                            : rf.scheduledDepLocal
                            ? rf.scheduledDepLocal.match(/(\d{2}:\d{2})/)?.[1] ?? "—"
                            : "—"}
                        </td>
                        <td className="px-4 py-2.5 font-mono">
                          {rf.actualArrLocal
                            ? rf.actualArrLocal.match(/(\d{2}:\d{2})/)?.[1] ?? "—"
                            : rf.scheduledArrLocal
                            ? rf.scheduledArrLocal.match(/(\d{2}:\d{2})/)?.[1] ?? "—"
                            : "—"}
                        </td>
                        <td className={`px-4 py-2.5 font-mono font-semibold ${delayClass(depDelay)}`}>
                          {delayLabel(depDelay)}
                        </td>
                        <td className={`px-4 py-2.5 font-mono font-semibold ${delayClass(arrDelay)}`}>
                          {delayLabel(arrDelay)}
                        </td>
                        <td className="px-4 py-2.5 font-mono">
                          {rf.actualDurationMin
                            ? formatDuration(rf.actualDurationMin)
                            : rf.durationMin
                            ? formatDuration(rf.durationMin)
                            : "—"}
                        </td>
                        <td className="px-4 py-2.5 font-mono">
                          {rf.distanceKm ? `${rf.distanceKm.toLocaleString()} km` : "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          {rf.prayerCount ? (
                            <span className="font-semibold text-primary">{rf.prayerCount}</span>
                          ) : "—"}
                          {rf.prayerNames && (
                            <span className="block text-muted-foreground/60 text-[10px]">
                              {(() => { try { return (JSON.parse(rf.prayerNames) as string[]).join(", "); } catch { return rf.prayerNames; } })()}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono font-bold text-primary">
                          {rf.baggageBelt ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
        {flightIata && error && !isLoading && (() => {
          const isQErr = error.data?.code === 'TOO_MANY_REQUESTS';
          const isPrecondition = error.data?.code === 'PRECONDITION_FAILED';

          // If quota error + FR24 tracking data is available, show full FR24 tracking view
          if (isQErr && fr24TrackingData) {
            const f = fr24TrackingData;
            const fmtUtc = (iso: string | null | undefined) => {
              if (!iso) return '—';
              return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
                ' · ' + new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
            };
            const flightHours = f.flightTimeMinutes
              ? `${Math.floor(f.flightTimeMinutes / 60)}h ${f.flightTimeMinutes % 60}m`
              : '—';
            const fr24HasLive = f.lat != null && f.lng != null && !f.positionIsEstimated;
            const fr24Elapsed = f.datetimeTakeoff ? elapsedMinutes(f.datetimeTakeoff) : null;
            return (
              <div className="px-4 py-4 space-y-4">
                {/* Quota warning banner */}
                <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm" style={{ background: 'oklch(0.18 0.04 60 / 0.5)', border: '1px solid oklch(0.55 0.15 60 / 0.4)' }}>
                  <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: 'oklch(0.75 0.15 60)' }} />
                  <span style={{ color: 'oklch(0.85 0.1 60)' }}>AirLabs quota exhausted — tracking via FR24{f.positionIsEstimated ? ' (estimated position)' : fr24HasLive ? ' (live ADS-B)' : ''}</span>
                </div>

                {/* Landed banner */}
                {f.isLanded && (
                  <div className="rounded-xl border overflow-hidden" style={{ background: 'oklch(0.15 0.04 145 / 0.6)', borderColor: 'oklch(0.55 0.18 145 / 0.5)' }}>
                    <div className="flex items-start gap-4 px-5 py-4">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0" style={{ background: 'oklch(0.55 0.18 145 / 0.2)', border: '1px solid oklch(0.55 0.18 145 / 0.4)' }}>
                        <Plane className="w-5 h-5" style={{ color: 'oklch(0.75 0.18 145)' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-base font-bold" style={{ color: 'oklch(0.75 0.18 145)' }}>Flight Landed</span>
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'oklch(0.55 0.18 145 / 0.2)', color: 'oklch(0.75 0.18 145)' }}>ARRIVED</span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-sm">
                          <div>
                            <span className="text-xs text-muted-foreground block">Arrived at</span>
                            <span className="font-mono font-semibold text-foreground">{fmtUtc(f.datetimeLanded)}</span>
                          </div>
                          <div>
                            <span className="text-xs text-muted-foreground block">Destination</span>
                            <span className="font-mono font-semibold text-foreground">{f.arrIata ?? '—'}</span>
                          </div>
                          {f.runwayLanded && (
                            <div>
                              <span className="text-xs text-muted-foreground block">Runway</span>
                              <span className="font-mono font-semibold text-foreground">{f.runwayLanded}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Identity bar */}
                <div className="avi-panel">
                  <div className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10 border border-primary/20 shrink-0">
                        <Plane className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-2xl font-bold font-mono text-foreground">{f.flightIata}</span>
                          <span className={`status-badge ${f.isLanded ? 'status-landed' : f.isAirborne ? 'status-en-route' : 'status-scheduled'}`}>
                            {f.isLanded ? 'Landed' : f.isAirborne ? 'En Route' : 'Scheduled'}
                          </span>
                          {f.callsign && <span className="text-xs font-mono text-muted-foreground border border-border/60 rounded px-1.5 py-0.5">{f.callsign}</span>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{f.airline ?? '—'}{f.aircraft ? ` · ${f.aircraft}` : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="text-center min-w-[52px]">
                        <div className="text-xl font-bold font-mono text-foreground">{f.depIata ?? '—'}</div>
                      </div>
                      <div className="flex-1 flex items-center gap-1 text-muted-foreground/30 min-w-0">
                        <div className="flex-1 h-px bg-border" />
                        <ArrowRight className="w-3.5 h-3.5 text-primary shrink-0" />
                        <div className="flex-1 h-px bg-border" />
                      </div>
                      <div className="text-center min-w-[52px]">
                        <div className="text-xl font-bold font-mono text-foreground">{f.arrIata ?? '—'}</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Time strip */}
                <div className="avi-panel">
                  <PanelHeader icon={<Hourglass className="w-3.5 h-3.5" />} title="Flight Times" />
                  <div className="time-strip-grid">
                    <TimeCard label="Elapsed" value={fr24Elapsed != null ? formatDuration(fr24Elapsed) : '—'} sub={f.datetimeTakeoff ? `Dep ${fmtUtc(f.datetimeTakeoff)}` : undefined} accent="cyan" />
                    <TimeCard label="Flight Time" value={flightHours} sub={f.actualDistanceKm ? `${f.actualDistanceKm.toLocaleString()} km` : undefined} accent="green" />
                    <TimeCard label="Arrived" value={f.datetimeLanded ? fmtUtc(f.datetimeLanded) : f.eta ? fmtUtc(f.eta) : '—'} sub={f.runwayLanded ? `Runway ${f.runwayLanded}` : undefined} accent="primary" />
                    <TimeCard label="Altitude" value={f.alt != null ? `${f.alt.toLocaleString()} ft` : '—'} sub={f.gspeed != null ? `${f.gspeed} km/h` : undefined} accent="amber" />
                  </div>
                </div>

                {/* Map */}
                <div className="avi-panel">
                  <PanelHeader
                    icon={<MapPin className="w-3.5 h-3.5" />}
                    title="Live Position"
                    extra={
                      fr24HasLive ? (
                        <div className="flex items-center gap-1.5"><div className="pulse-dot" /><span className="text-xs text-muted-foreground">Live ADS-B</span></div>
                      ) : f.positionIsEstimated ? (
                        <span className="text-xs text-amber-400/80">⚠ Estimated</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">No live position</span>
                      )
                    }
                  />
                  <div style={{ height: 360 }}>
                    <FlightMap
                      lat={f.lat ?? undefined}
                      lng={f.lng ?? undefined}
                      depLat={f.depLat ?? undefined}
                      depLng={f.depLng ?? undefined}
                      arrLat={f.arrLat ?? undefined}
                      arrLng={f.arrLng ?? undefined}
                      heading={f.track ?? undefined}
                      depIata={f.depIata ?? undefined}
                      arrIata={f.arrIata ?? undefined}
                    />
                  </div>
                </div>

                {/* Telemetry */}
                <div className="avi-panel">
                  <PanelHeader icon={<Activity className="w-3.5 h-3.5" />} title="Telemetry" badge="FR24"
                    extra={!fr24HasLive && <span className="text-xs text-muted-foreground italic">{f.positionIsEstimated ? '⚠ Estimated position' : 'No live ADS-B'}</span>}
                  />
                  <div className="telem-grid">
                    <TelemCell label="Latitude" value={f.lat != null ? f.lat.toFixed(4) + '°' : undefined} />
                    <TelemCell label="Longitude" value={f.lng != null ? f.lng.toFixed(4) + '°' : undefined} />
                    <TelemCell label="Altitude" value={f.alt ?? undefined} unit="ft" />
                    <TelemCell label="Ground Speed" value={f.gspeed ?? undefined} unit="km/h" />
                    <TelemCell label="Heading" value={f.track != null ? `${f.track}°` : undefined} />
                    <TelemCell label="Vertical Speed" value={f.vspeed != null ? (f.vspeed > 0 ? `+${f.vspeed}` : String(f.vspeed)) : undefined} unit="ft/min" />
                    <TelemCell label="Registration" value={f.registration ?? undefined} />
                    <TelemCell label="Aircraft" value={f.aircraft ?? undefined} />
                  </div>
                </div>

                {/* Weather */}
                {f.weather && (
                  <div className="avi-panel">
                    <PanelHeader icon={<Wind className="w-3.5 h-3.5" />} title="Wind & Atmosphere" badge={`@ ${f.weather.pressureLevel} (~${f.weather.altitudeFt.toLocaleString()} ft)`} />
                    <div className="telem-grid">
                      <TelemCell label="Wind Speed" value={f.weather.windSpeedKmh} unit="km/h" highlight />
                      <TelemCell label="Wind Direction" value={`${f.weather.windDirectionDeg}° ${windDirectionToCompass(f.weather.windDirectionDeg)}`} />
                      <TelemCell label="Temperature" value={`${f.weather.temperatureCelsius}°C`} highlight />
                      <TelemCell label="Pressure Level" value={f.weather.pressureLevel} />
                    </div>
                  </div>
                )}

                {/* Prayer times */}
                <div className="avi-panel">
                  <PanelHeader icon={<MoonIcon className="w-3.5 h-3.5" />} title="Prayer Times" />
                  <PrayerPanel lat={f.lat ?? undefined} lng={f.lng ?? undefined} positionIsEstimated={f.positionIsEstimated} isLanded={f.isLanded} />
                </div>

                {/* FR24 Operations */}
                <div className="avi-panel">
                  <PanelHeader icon={<Radio className="w-3.5 h-3.5" />} title="Operations" badge="FR24" />
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-px bg-border">
                    {[
                      { label: 'Callsign', value: f.callsign },
                      { label: 'Squawk', value: f.squawk },
                      { label: 'ICAO Hex', value: f.hex },
                      { label: 'ADS-B Source', value: f.adsSource },
                      { label: 'Takeoff Runway', value: f.runwayTakeoff },
                      { label: 'Landing Runway', value: f.runwayLanded },
                      { label: 'Takeoff Time', value: f.datetimeTakeoff ? fmtUtc(f.datetimeTakeoff) : null },
                      { label: 'Landing Time', value: f.datetimeLanded ? fmtUtc(f.datetimeLanded) : null },
                      { label: 'Distance Flown', value: f.actualDistanceKm ? `${f.actualDistanceKm.toLocaleString()} km` : null },
                      { label: 'FR24 ID', value: f.fr24Id },
                    ].filter(r => r.value != null).map(({ label, value }) => (
                      <div key={label} className="bg-card px-4 py-3 flex flex-col gap-0.5">
                        <span className="avi-label">{label}</span>
                        <span className="avi-value text-sm font-mono font-semibold">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* FR24 Quota */}
                {f.fr24Quota && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground/40 px-1">
                    <Radio className="w-3 h-3" />
                    <span>FR24 credits: <span className="font-mono">{f.fr24Quota.creditsRemaining?.toLocaleString() ?? '—'}</span> remaining</span>
                  </div>
                )}

                <div className="flex gap-3 flex-wrap">
                  <button onClick={() => { setFlightIata(null); setInputValue(''); inputRef.current?.focus(); }}
                    className="text-sm text-primary hover:underline">
                    Track another flight
                  </button>
                </div>
              </div>
            );
          }

          // Loading FR24 fallback
          if (isQErr && fr24FallbackLoading) {
            return (
              <div className="flex flex-col items-center justify-center min-h-[40vh] gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
                <p className="text-sm text-muted-foreground">AirLabs quota exceeded — fetching from FR24…</p>
              </div>
            );
          }

          return (
            <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
              <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${isQErr ? 'bg-amber-500/10 border border-amber-500/30' : isPrecondition ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-destructive/10 border border-destructive/30'}`}>
                <AlertTriangle className={`w-7 h-7 ${isQErr ? 'text-amber-400' : isPrecondition ? 'text-blue-400' : 'text-destructive'}`} />
              </div>
              <div className="text-center space-y-1 max-w-md">
                <h3 className="font-semibold text-foreground">
                  {isQErr ? 'API Quota Exceeded' : isPrecondition ? 'Flight Not Yet Active' : 'Flight Not Found'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {isQErr
                    ? 'The AirLabs API monthly quota has been exhausted. Quota resets on the 1st of next month.'
                    : (error.message || `No data found for ${flightIata}. The flight may not be active or the number may be incorrect.`)}
                </p>
              </div>
              <div className="flex gap-3 flex-wrap justify-center">
                <button onClick={() => { setFlightIata(null); setInputValue(""); inputRef.current?.focus(); }}
                  className="text-sm text-primary hover:underline">
                  Try another flight
                </button>
                {(isQErr || isPrecondition) && (
                  <button
                    onClick={() => { setShowAddTrip(true); setTripForm(f => ({ ...f, flightIata: flightIata ?? '' })); }}
                    className={`text-sm px-3 py-1.5 rounded-md border transition-colors ${isQErr ? 'border-amber-500/40 text-amber-400 hover:bg-amber-500/10' : 'border-blue-500/40 text-blue-400 hover:bg-blue-500/10'}`}
                  >
                    + Add to Upcoming Trips
                  </button>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── Flight data ── */}
        {flightIata && data && !isLoading && (
          <>
            {/* ── ARRIVAL BANNER ── */}
            {isLanded && (
              <div
                className="mx-4 mt-4 rounded-xl border overflow-hidden"
                style={{
                  background: "oklch(0.15 0.04 145 / 0.6)",
                  borderColor: "oklch(0.55 0.18 145 / 0.5)",
                }}
              >
                <div className="flex items-start gap-4 px-5 py-4">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                    style={{ background: "oklch(0.55 0.18 145 / 0.2)", border: "1px solid oklch(0.55 0.18 145 / 0.4)" }}
                  >
                    <Plane className="w-5 h-5" style={{ color: "oklch(0.75 0.18 145)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-base font-bold" style={{ color: "oklch(0.75 0.18 145)" }}>
                        Flight Landed
                      </span>
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: "oklch(0.55 0.18 145 / 0.2)", color: "oklch(0.75 0.18 145)" }}
                      >
                        ARRIVED
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1.5 text-sm">
                      <div>
                        <span className="text-xs text-muted-foreground block">Arrived at</span>
                        <span className="font-mono font-semibold text-foreground">
                          {flight?.arr_actual
                            ? formatLocalTime(flight.arr_actual).local
                            : fr24?.datetimeLanded
                            ? formatTime(fr24.datetimeLanded)
                            : flight?.arr_estimated
                            ? formatLocalTime(flight.arr_estimated).local
                            : "—"}
                        </span>
                        {(flight?.arr_actual_utc || fr24?.datetimeLanded) && (
                          <span className="text-[10px] text-muted-foreground/60 font-mono block">
                            {formatTime(flight?.arr_actual_utc ?? fr24?.datetimeLanded)}
                          </span>
                        )}
                      </div>
                      <div>
                        <span className="text-xs text-muted-foreground block">Destination</span>
                        <span className="font-mono font-semibold text-foreground">
                          {flight?.arr_iata ?? "—"}
                          {(arrAirport?.city ?? flight?.arr_city) ? ` · ${arrAirport?.city ?? flight?.arr_city}` : ""}
                        </span>
                      </div>
                      {flight?.arr_baggage && (
                        <div>
                          <span className="text-xs text-muted-foreground block">Baggage Belt</span>
                          <span className="font-mono font-bold text-lg" style={{ color: "oklch(0.72 0.18 55)" }}>
                            {flight.arr_baggage}
                          </span>
                        </div>
                      )}
                      {flight?.arr_terminal && (
                        <div>
                          <span className="text-xs text-muted-foreground block">Terminal</span>
                          <span className="font-mono font-semibold text-foreground">{flight.arr_terminal}</span>
                        </div>
                      )}
                      {flight?.arr_gate && (
                        <div>
                          <span className="text-xs text-muted-foreground block">Gate</span>
                          <span className="font-mono font-semibold text-foreground">{flight.arr_gate}</span>
                        </div>
                      )}
                      {fr24?.runwayLanded && (
                        <div>
                          <span className="text-xs text-muted-foreground block">Runway</span>
                          <span className="font-mono font-semibold text-foreground">{fr24.runwayLanded}</span>
                        </div>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground/60">
                      Live tracking stopped · No further API calls will be made for this flight
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ── ARRIVAL SUMMARY CARD ── */}
            {isLanded && (
              <div className="avi-panel">
                <PanelHeader icon={<Clock className="w-3.5 h-3.5" />} title="Arrival Summary" badge="COMPLETED" />
                <div className="p-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 text-sm">
                    {/* Departure */}
                    <div>
                      <div className="avi-label mb-1">Departed ({flight?.dep_iata ?? "—"})</div>
                      <div className="font-mono font-semibold text-foreground">
                        {flight?.dep_actual ? formatLocalTime(flight.dep_actual).local : flight?.dep_time ? formatLocalTime(flight.dep_time).local : fr24?.datetimeTakeoff ? formatTime(fr24.datetimeTakeoff) : "—"}
                      </div>
                      {flight?.dep_actual_utc && <div className="text-[10px] text-muted-foreground/60 font-mono">{formatTime(flight.dep_actual_utc)}</div>}
                    </div>
                    {/* Arrival */}
                    <div>
                      <div className="avi-label mb-1">Arrived ({flight?.arr_iata ?? "—"})</div>
                      <div className="font-mono font-semibold text-foreground">
                        {flight?.arr_actual ? formatLocalTime(flight.arr_actual).local : fr24?.datetimeLanded ? formatTime(fr24.datetimeLanded) : "—"}
                      </div>
                      {(flight?.arr_actual_utc ?? fr24?.datetimeLanded) && <div className="text-[10px] text-muted-foreground/60 font-mono">{formatTime(flight?.arr_actual_utc ?? fr24?.datetimeLanded)}</div>}
                    </div>
                    {/* Dep delay */}
                    <div>
                      <div className="avi-label mb-1">Dep Delay</div>
                      <div className={`font-semibold font-mono ${(flight?.dep_delay ?? 0) > 0 ? "text-yellow-400" : "text-green-400"}`}>
                        {formatDelay(flight?.dep_delay)}
                      </div>
                    </div>
                    {/* Arr delay */}
                    <div>
                      <div className="avi-label mb-1">Arr Delay</div>
                      <div className={`font-semibold font-mono ${(flight?.arr_delay ?? 0) > 0 ? "text-yellow-400" : "text-green-400"}`}>
                        {formatDelay(flight?.arr_delay)}
                      </div>
                    </div>
                    {/* Scheduled duration */}
                    {flight?.duration != null && (
                      <div>
                        <div className="avi-label mb-1">Scheduled Duration</div>
                        <div className="font-mono font-semibold text-foreground">{formatDuration(flight.duration)}</div>
                      </div>
                    )}
                    {/* Actual duration */}
                    {(() => {
                      const depMs2 = flight?.dep_actual_utc ? new Date(flight.dep_actual_utc).getTime() : null;
                      const arrMs2 = (flight?.arr_actual_utc ?? fr24?.datetimeLanded) ? new Date(flight?.arr_actual_utc ?? fr24!.datetimeLanded!).getTime() : null;
                      const actualMins = depMs2 && arrMs2 && arrMs2 > depMs2 ? Math.round((arrMs2 - depMs2) / 60000) : null;
                      return actualMins ? (
                        <div>
                          <div className="avi-label mb-1">Actual Duration</div>
                          <div className="font-mono font-semibold text-foreground">{formatDuration(actualMins)}</div>
                        </div>
                      ) : null;
                    })()}
                    {/* Distance */}
                    {fr24?.actualDistance && (
                      <div>
                        <div className="avi-label mb-1">Distance Flown</div>
                        <div className="font-mono font-semibold text-foreground">{formatDistance(fr24.actualDistance)}</div>
                      </div>
                    )}
                    {/* Baggage */}
                    {flight?.arr_baggage && (
                      <div>
                        <div className="avi-label mb-1">Baggage Belt</div>
                        <div className="font-mono font-bold text-xl" style={{ color: "oklch(0.72 0.18 55)" }}>{flight.arr_baggage}</div>
                      </div>
                    )}
                    {/* Terminal */}
                    {flight?.arr_terminal && (
                      <div>
                        <div className="avi-label mb-1">Terminal</div>
                        <div className="font-mono font-semibold text-foreground">{flight.arr_terminal}</div>
                      </div>
                    )}
                    {/* Gate */}
                    {flight?.arr_gate && (
                      <div>
                        <div className="avi-label mb-1">Gate</div>
                        <div className="font-mono font-semibold text-foreground">{flight.arr_gate}</div>
                      </div>
                    )}
                    {/* Runway */}
                    {fr24?.runwayLanded && (
                      <div>
                        <div className="avi-label mb-1">Landing Runway</div>
                        <div className="font-mono font-semibold text-foreground">{fr24.runwayLanded}</div>
                      </div>
                    )}
                  </div>

                  {/* Share Arrival Summary button */}
                  <div className="mt-5 pt-4 border-t border-border/30 flex justify-end">
                    <button
                      onClick={handleShareArrival}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border/60 text-sm text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                    >
                      <Share2 className="w-4 h-4" />
                      Share Arrival Summary
                    </button>
                  </div>
                </div>
              </div>
            )}

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
                      ? localAircraftTime.tzName
                        ? `${localAircraftTime.offsetLabel} · ${localAircraftTime.tzName}${positionIsEstimated ? " · est" : ""}`
                        : `${localAircraftTime.offsetLabel}${positionIsEstimated ? " · est" : ""}`
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
                <PrayerPanel lat={flight?.lat} lng={flight?.lng} positionIsEstimated={positionIsEstimated} isLanded={isLanded} />
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
                {isLanded ? (
                  <span>Tracking stopped · Flight has landed · Last updated {lastRefresh?.toLocaleTimeString() ?? "—"}</span>
                ) : (
                  <span>Data refreshes every 15 min · Last updated {lastRefresh?.toLocaleTimeString() ?? "—"}</span>
                )}
              </div>
              {flight?.utc && (
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  <span>AirLabs UTC: <span className="font-mono">{flight.utc}</span></span>
                </div>
              )}
              {/* API Quota display */}
              {apiQuota?.airlabs && (
                <div className="flex items-center gap-1.5">
                  <Activity className="w-3 h-3" />
                  <span>
                    AirLabs: <span className="font-mono">{apiQuota.airlabs.usedTotal ?? "—"}</span>
                    {apiQuota.airlabs.limitByMonth != null && (
                      <> / {apiQuota.airlabs.limitByMonth} calls/mo</>
                    )}
                    {apiQuota.airlabs.limitByHour != null && (
                      <> · {apiQuota.airlabs.limitByHour}/hr</>
                    )}
                  </span>
                </div>
              )}
              {apiQuota?.fr24 && (
                <div className="flex items-center gap-1.5">
                  <Radio className="w-3 h-3" />
                  <span>
                    FR24 credits: <span className="font-mono">{apiQuota.fr24.creditsRemaining?.toLocaleString() ?? "—"}</span> remaining
                    {apiQuota.fr24.creditsConsumed != null && (
                      <> · {apiQuota.fr24.creditsConsumed} used this call</>
                    )}
                  </span>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
