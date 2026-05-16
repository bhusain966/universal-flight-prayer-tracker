import { useState, useCallback } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Plane,
  Clock,
  MapPin,
  Moon,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type SortField =
  | "trackedAt"
  | "depIata"
  | "arrIata"
  | "prayerCount"
  | "arrDelayMin"
  | "distanceKm"
  | "actualDurationMin";
type SortOrder = "asc" | "desc";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatLocalTime(raw?: string | null): string {
  if (!raw) return "—";
  // raw is either 'YYYY-MM-DD HH:MM' (local) or ISO string
  const parts = raw.replace("T", " ").split(" ");
  if (parts.length >= 2) return parts[1].slice(0, 5);
  return "—";
}

function formatDuration(mins?: number | null): string {
  if (mins == null || mins < 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function formatDistance(km?: number | null): string {
  if (km == null) return "—";
  return `${km.toLocaleString()} km`;
}

function delayBadge(mins?: number | null) {
  if (mins == null) return <span className="text-muted-foreground text-xs">—</span>;
  if (mins <= 0)
    return (
      <Badge className="bg-emerald-900/40 text-emerald-400 border-emerald-700/40 text-xs">
        {mins === 0 ? "On time" : `${Math.abs(mins)}m early`}
      </Badge>
    );
  return (
    <Badge className="bg-red-900/40 text-red-400 border-red-700/40 text-xs">
      +{mins}m late
    </Badge>
  );
}

function prayerBadge(count?: number | null, names?: string | null) {
  const n = count ?? 0;
  const label = n === 0 ? "None" : `${n}`;
  const parsed: string[] = (() => {
    try {
      return names ? JSON.parse(names) : [];
    } catch {
      return [];
    }
  })();
  const title = parsed.length > 0 ? parsed.join(", ") : undefined;
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 text-xs font-medium ${
        n > 0 ? "text-amber-400" : "text-muted-foreground"
      }`}
    >
      {n > 0 && <Moon className="w-3 h-3" />}
      {label}
    </span>
  );
}

// ─── Sort header cell ─────────────────────────────────────────────────────────

function SortableHeader({
  field,
  label,
  sortBy,
  order,
  onSort,
}: {
  field: SortField;
  label: string;
  sortBy: SortField;
  order: SortOrder;
  onSort: (f: SortField) => void;
}) {
  const active = sortBy === field;
  return (
    <button
      className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
      onClick={() => onSort(field)}
    >
      {label}
      {active ? (
        order === "asc" ? (
          <ArrowUp className="w-3 h-3 text-amber-400" />
        ) : (
          <ArrowDown className="w-3 h-3 text-amber-400" />
        )
      ) : (
        <ArrowUpDown className="w-3 h-3 opacity-40" />
      )}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 20, 50];

export default function History() {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [sortBy, setSortBy] = useState<SortField>("trackedAt");
  const [order, setOrder] = useState<SortOrder>("desc");

  const { data, isLoading, error, refetch } = trpc.flight.historyList.useQuery(
    { page, pageSize, sortBy, order },
    { staleTime: 30_000 }
  );

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  const handleSort = useCallback(
    (field: SortField) => {
      if (field === sortBy) {
        setOrder((o) => (o === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(field);
        setOrder("desc");
      }
      setPage(1);
    },
    [sortBy]
  );

  const handlePageSize = (val: string) => {
    setPageSize(Number(val));
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Header ── */}
      <header className="border-b border-border/40 bg-card/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
          <Link href="/">
            <button className="flex items-center gap-2 text-amber-400 hover:text-amber-300 transition-colors">
              <Plane className="w-4 h-4" />
              <span className="text-sm font-semibold tracking-wide">Flight Tracker</span>
            </button>
          </Link>
          <span className="text-border/60">/</span>
          <span className="text-sm text-muted-foreground font-medium">Flight History</span>
          {data && (
            <span className="ml-auto text-xs text-muted-foreground">
              {data.total.toLocaleString()} flight{data.total !== 1 ? "s" : ""} tracked
            </span>
          )}
        </div>
      </header>

      {/* ── Content ── */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Clock className="w-6 h-6 text-amber-400" />
            Prayer Flight Log
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Complete record of all tracked flights with prayer summaries, timing, and route data.
          </p>
        </div>

        {/* ── Table card ── */}
        <div className="rounded-xl border border-border/40 bg-card/40 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/40 hover:bg-transparent">
                  <TableHead className="w-[120px]">
                    <SortableHeader field="trackedAt" label="Date" sortBy={sortBy} order={order} onSort={handleSort} />
                  </TableHead>
                  <TableHead>Flight</TableHead>
                  <TableHead>
                    <SortableHeader field="depIata" label="From" sortBy={sortBy} order={order} onSort={handleSort} />
                  </TableHead>
                  <TableHead>
                    <SortableHeader field="arrIata" label="To" sortBy={sortBy} order={order} onSort={handleSort} />
                  </TableHead>
                  <TableHead className="text-center">
                    <SortableHeader field="prayerCount" label="Prayers" sortBy={sortBy} order={order} onSort={handleSort} />
                  </TableHead>
                  <TableHead>Dep (local)</TableHead>
                  <TableHead>Arr (local)</TableHead>
                  <TableHead className="text-center">
                    <SortableHeader field="arrDelayMin" label="Delay" sortBy={sortBy} order={order} onSort={handleSort} />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortableHeader field="actualDurationMin" label="Duration" sortBy={sortBy} order={order} onSort={handleSort} />
                  </TableHead>
                  <TableHead className="text-right">
                    <SortableHeader field="distanceKm" label="Distance" sortBy={sortBy} order={order} onSort={handleSort} />
                  </TableHead>
                  <TableHead>Aircraft</TableHead>
                  <TableHead>Baggage</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading
                  ? Array.from({ length: pageSize > 10 ? 10 : pageSize }).map((_, i) => (
                      <TableRow key={i} className="border-border/30">
                        {Array.from({ length: 12 }).map((__, j) => (
                          <TableCell key={j}>
                            <Skeleton className="h-4 w-full" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  : error
                  ? (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center py-16 text-muted-foreground">
                          <div className="flex flex-col items-center gap-3">
                            <span className="text-red-400 text-sm">Failed to load flight history.</span>
                            <Button variant="outline" size="sm" onClick={() => refetch()}>
                              Retry
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  : data?.rows.length === 0
                  ? (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center py-16 text-muted-foreground">
                          <div className="flex flex-col items-center gap-3">
                            <MapPin className="w-8 h-8 opacity-30" />
                            <p className="text-sm">No flights tracked yet.</p>
                            <Link href="/">
                              <Button variant="outline" size="sm" className="mt-1">
                                Track a flight
                              </Button>
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  : data?.rows.map((row) => (
                      <TableRow
                        key={row.id}
                        className="border-border/30 hover:bg-muted/20 cursor-pointer transition-colors"
                        onClick={() => (window.location.href = `/track/${row.flightIata}`)}
                      >
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(row.trackedAt?.toISOString())}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono font-semibold text-amber-400 text-sm">
                            {row.flightIata}
                          </span>
                          {row.airlineName && (
                            <div className="text-xs text-muted-foreground truncate max-w-[120px]">
                              {row.airlineName}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono font-semibold text-sm">{row.depIata ?? "—"}</span>
                          {row.depCity && (
                            <div className="text-xs text-muted-foreground truncate max-w-[80px]">{row.depCity}</div>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono font-semibold text-sm">{row.arrIata ?? "—"}</span>
                          {row.arrCity && (
                            <div className="text-xs text-muted-foreground truncate max-w-[80px]">{row.arrCity}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {prayerBadge(row.prayerCount, row.prayerNames)}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          <div>{formatLocalTime(row.scheduledDepLocal)}</div>
                          {row.actualDepLocal && row.actualDepLocal !== row.scheduledDepLocal && (
                            <div className="text-muted-foreground">act {formatLocalTime(row.actualDepLocal)}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          <div>{formatLocalTime(row.scheduledArrLocal)}</div>
                          {row.actualArrLocal && row.actualArrLocal !== row.scheduledArrLocal && (
                            <div className="text-muted-foreground">act {formatLocalTime(row.actualArrLocal)}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {delayBadge(row.arrDelayMin)}
                        </TableCell>
                        <TableCell className="text-right text-xs whitespace-nowrap">
                          {formatDuration(row.actualDurationMin ?? row.durationMin)}
                        </TableCell>
                        <TableCell className="text-right text-xs whitespace-nowrap">
                          {formatDistance(row.distanceKm)}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[100px] truncate">
                          {row.aircraft ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs text-center">
                          {row.baggageBelt ? (
                            <Badge variant="outline" className="text-xs border-border/50">
                              Belt {row.baggageBelt}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </div>

          {/* ── Pagination footer ── */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/40 bg-card/20">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Rows per page:</span>
              <Select value={String(pageSize)} onValueChange={handlePageSize}>
                <SelectTrigger className="h-7 w-16 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
                {data && ` · ${data.total.toLocaleString()} total`}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
