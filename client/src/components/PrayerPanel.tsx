import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Moon, Sunrise, Sun, Sunset, ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type PrayerMethod = "MWL" | "ISNA" | "Egypt" | "Makkah" | "Karachi";

interface PrayerPanelProps {
  lat?: number;
  lng?: number;
  positionIsEstimated?: boolean;
  /** When true, stops all background polling (flight has landed) */
  isLanded?: boolean;
}

const PRAYER_METHODS: { value: PrayerMethod; label: string; description: string }[] = [
  {
    value: "MWL",
    label: "Muslim World League",
    description: "Fajr 18°, Isha 17° — widely used in Europe, Far East, parts of US",
  },
  {
    value: "ISNA",
    label: "ISNA (North America)",
    description: "Fajr 15°, Isha 15° — Islamic Society of North America",
  },
  {
    value: "Egypt",
    label: "Egyptian General Authority",
    description: "Fajr 19.5°, Isha 17.5° — Egypt, Sudan, parts of Africa",
  },
  {
    value: "Makkah",
    label: "Umm Al-Qura (Makkah)",
    description: "Fajr 18.5°, Isha 90 min after Maghrib — Saudi Arabia & Gulf",
  },
  {
    value: "Karachi",
    label: "University of Islamic Sciences, Karachi",
    description: "Fajr 18°, Isha 18° — Pakistan, Bangladesh, India, Afghanistan",
  },
];

const PRAYER_ICONS: Record<string, React.ReactNode> = {
  fajr:    <Sunrise className="w-3.5 h-3.5" />,
  sunrise: <Sun className="w-3.5 h-3.5 opacity-50" />,
  dhuhr:   <Sun className="w-3.5 h-3.5" />,
  asr:     <Sun className="w-3.5 h-3.5 opacity-70" />,
  maghrib: <Sunset className="w-3.5 h-3.5" />,
  isha:    <Moon className="w-3.5 h-3.5" />,
};

const LS_KEY = "prayer-method";

function loadSavedMethod(): PrayerMethod {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved && PRAYER_METHODS.some((m) => m.value === saved)) {
      return saved as PrayerMethod;
    }
  } catch { /* localStorage not available */ }
  return "MWL";
}

function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatTime(utcIso: string): string {
  const d = new Date(utcIso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" }) + " UTC";
}

export default function PrayerPanel({ lat, lng, positionIsEstimated, isLanded }: PrayerPanelProps) {
  const [method, setMethod] = useState<PrayerMethod>(loadSavedMethod);
  const [countdown, setCountdown] = useState<number | null>(null);

  const enabled = lat !== undefined && lng !== undefined;

  const { data, isLoading, error } = trpc.flight.prayerTimes.useQuery(
    { lat: lat ?? 0, lng: lng ?? 0, method },
    {
      enabled,
      // Stop background polling once the flight has landed — no position updates needed
      refetchInterval: isLanded ? false : 60_000,
      staleTime: 30_000,
    }
  );

  // Persist method selection
  function handleMethodChange(val: string) {
    const m = val as PrayerMethod;
    setMethod(m);
    try { localStorage.setItem(LS_KEY, m); } catch { /* ignore */ }
  }

  // Live countdown ticker
  useEffect(() => {
    if (!data?.nextPrayer) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const target = new Date(data.nextPrayer!.utc).getTime();
      const remaining = Math.max(0, Math.floor((target - now) / 1000));
      setCountdown(remaining);
    }, 1000);
    return () => clearInterval(interval);
  }, [data?.nextPrayer?.utc]);

  const selectedMethodInfo = PRAYER_METHODS.find((m) => m.value === method)!;

  if (!enabled) {
    return (
      <div className="flex flex-col h-full">
        {/* Method selector always visible even without position */}
        <div className="px-4 pt-4 pb-3 border-b border-border/50">
          <MethodSelector value={method} onChange={handleMethodChange} />
        </div>
        <div className="flex flex-col items-center justify-center flex-1 py-10 gap-2">
          <Moon className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground text-center px-4">
            Prayer times will appear once the aircraft has live GPS coordinates.
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 pt-4 pb-3 border-b border-border/50">
          <MethodSelector value={method} onChange={handleMethodChange} />
        </div>
        <div className="p-4 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton h-9 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col h-full">
        <div className="px-4 pt-4 pb-3 border-b border-border/50">
          <MethodSelector value={method} onChange={handleMethodChange} />
        </div>
        <div className="flex items-center justify-center flex-1 py-8">
          <p className="text-sm text-destructive">Unable to calculate prayer times.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Method selector */}
      <div className="px-4 pt-4 pb-3 border-b border-border/50">
        <MethodSelector value={method} onChange={handleMethodChange} />
        <p className="text-xs text-muted-foreground mt-1.5 leading-snug">
          {selectedMethodInfo.description}
        </p>
      </div>

      {/* Countdown to next prayer */}
      {data.nextPrayer && (
        <div className="px-4 py-4 border-b border-border bg-card/50">
          <div className="flex items-center justify-between mb-1">
            <span className="avi-label">Next Prayer</span>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
              {PRAYER_ICONS[data.nextPrayer.key]}
              {data.nextPrayer.name}
            </span>
          </div>
          <div className="flex items-end gap-2">
            <span className="countdown-digit">
              {countdown !== null
                ? formatCountdown(countdown)
                : formatCountdown(data.nextPrayer.secondsUntil)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            at {formatTime(data.nextPrayer.utc)}
          </p>
        </div>
      )}

      {/* Prayer time rows */}
      <div className="flex flex-col">
        {data.times.map((prayer) => {
          const rowClass = [
            "prayer-row",
            prayer.isNext ? "next" : "",
            prayer.isPast && !prayer.isNext ? "past" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div key={prayer.key} className={rowClass}>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  {PRAYER_ICONS[prayer.key]}
                </span>
                <span
                  className={`text-sm font-medium ${
                    prayer.isNext ? "text-primary font-semibold" : "text-foreground"
                  }`}
                >
                  {prayer.name}
                </span>
                {prayer.isNext && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      background: "oklch(0.72 0.18 55 / 0.15)",
                      color: "oklch(0.72 0.18 55)",
                    }}
                  >
                    NEXT
                  </span>
                )}
                {prayer.isPast && !prayer.isNext && (
                  <span className="text-xs text-muted-foreground/60">✓</span>
                )}
              </div>
              <span className="avi-value text-sm tabular-nums">
                {formatTime(prayer.utc)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer: coordinates + method */}
      <div className="px-4 py-2 border-t border-border/50 space-y-1">
        {positionIsEstimated && (
          <p className="text-xs text-amber-400/80 flex items-center gap-1">
            <span>⚠</span>
            <span>Position estimated from route progress (no live ADS-B)</span>
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Calculated for {lat?.toFixed(4)}°, {lng?.toFixed(4)}° · {selectedMethodInfo.label}
        </p>
      </div>
    </div>
  );
}

/** Reusable method selector sub-component */
function MethodSelector({
  value,
  onChange,
}: {
  value: PrayerMethod;
  onChange: (val: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="avi-label whitespace-nowrap">Calculation Method</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-7 text-xs bg-card border-border flex-1 min-w-0">
          <SelectValue />
          <ChevronDown className="w-3 h-3 ml-1 shrink-0 opacity-50" />
        </SelectTrigger>
        <SelectContent className="bg-card border-border">
          {PRAYER_METHODS.map((m) => (
            <SelectItem key={m.value} value={m.value} className="text-xs">
              <span className="font-medium">{m.value}</span>
              <span className="text-muted-foreground ml-1.5 hidden sm:inline">
                — {m.label}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
