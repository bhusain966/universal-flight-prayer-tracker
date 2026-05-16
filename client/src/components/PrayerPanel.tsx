import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Moon, Sunrise, Sun, Sunset, Star } from "lucide-react";

interface PrayerPanelProps {
  lat?: number;
  lng?: number;
}

const PRAYER_ICONS: Record<string, React.ReactNode> = {
  fajr:    <Sunrise className="w-3.5 h-3.5" />,
  sunrise: <Sun className="w-3.5 h-3.5 opacity-50" />,
  dhuhr:   <Sun className="w-3.5 h-3.5" />,
  asr:     <Sun className="w-3.5 h-3.5 opacity-70" />,
  maghrib: <Sunset className="w-3.5 h-3.5" />,
  isha:    <Moon className="w-3.5 h-3.5" />,
};

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

export default function PrayerPanel({ lat, lng }: PrayerPanelProps) {
  const [countdown, setCountdown] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  const enabled = lat !== undefined && lng !== undefined;

  const { data, isLoading, error } = trpc.flight.prayerTimes.useQuery(
    { lat: lat ?? 0, lng: lng ?? 0 },
    {
      enabled,
      refetchInterval: 60_000, // refresh every minute
      staleTime: 30_000,
    }
  );

  // Countdown ticker
  useEffect(() => {
    if (!data?.nextPrayer) return;
    const interval = setInterval(() => {
      const now = Date.now();
      const target = new Date(data.nextPrayer!.utc).getTime();
      const remaining = Math.max(0, Math.floor((target - now) / 1000));
      setCountdown(remaining);
      setTick(t => t + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [data?.nextPrayer?.utc]);

  if (!enabled) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-10 gap-2">
        <Moon className="w-8 h-8 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground text-center">
          Prayer times will appear once the aircraft has live GPS coordinates.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-9 rounded" />
        ))}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-full py-8">
        <p className="text-sm text-destructive">Unable to calculate prayer times.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Countdown */}
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
              {countdown !== null ? formatCountdown(countdown) : formatCountdown(data.nextPrayer.secondsUntil)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            at {formatTime(data.nextPrayer.utc)}
          </p>
        </div>
      )}

      {/* Prayer rows */}
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
                <span className={`text-sm font-medium ${prayer.isNext ? "text-primary font-semibold" : "text-foreground"}`}>
                  {prayer.name}
                </span>
                {prayer.isNext && (
                  <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "oklch(0.72 0.18 55 / 0.15)", color: "oklch(0.72 0.18 55)" }}>
                    NEXT
                  </span>
                )}
              </div>
              <span className="avi-value text-sm tabular-nums">
                {formatTime(prayer.utc)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Coordinates used */}
      <div className="px-4 py-2 border-t border-border/50">
        <p className="text-xs text-muted-foreground">
          Calculated for {lat?.toFixed(4)}°, {lng?.toFixed(4)}° · MWL method
        </p>
      </div>
    </div>
  );
}
