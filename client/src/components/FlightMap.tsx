import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface FlightMapProps {
  lat?: number;
  lng?: number;
  depLat?: number;
  depLng?: number;
  arrLat?: number;
  arrLng?: number;
  heading?: number;
  depIata?: string;
  arrIata?: string;
}

const DARK_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

// ── Geodesic great-circle interpolation ──────────────────────────────────────
// Uses spherical linear interpolation (slerp) in 3-D Cartesian space, then
// projects back to lat/lng.  After generating all points we "unwrap" the
// longitude sequence so that consecutive points never jump more than 180°,
// which eliminates the sharp visual turn Leaflet draws when a route crosses
// the antimeridian (±180°).

function greatCirclePoints(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
  steps = 120,
): L.LatLngTuple[] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;

  const φ1 = toRad(lat1), λ1 = toRad(lng1);
  const φ2 = toRad(lat2), λ2 = toRad(lng2);

  // Angular distance between the two points
  const d = 2 * Math.asin(
    Math.sqrt(
      Math.sin((φ2 - φ1) / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2,
    ),
  );

  if (d < 1e-10) return [[lat1, lng1]];

  const rawPts: L.LatLngTuple[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    const φ = Math.atan2(z, Math.sqrt(x * x + y * y));
    const λ = Math.atan2(y, x);
    rawPts.push([toDeg(φ), toDeg(λ)]);
  }

  // ── Longitude unwrapping ─────────────────────────────────────────────────
  // Walk through the points and adjust each longitude so it stays within
  // ±180° of the previous one.  This keeps the polyline on one side of the
  // map and prevents Leaflet from drawing a line that "wraps" across the
  // globe the wrong way.
  const pts: L.LatLngTuple[] = [rawPts[0]];
  for (let i = 1; i < rawPts.length; i++) {
    let prevLng = pts[i - 1][1];
    let curLng = rawPts[i][1];
    // Bring curLng within 180° of prevLng
    while (curLng - prevLng > 180) curLng -= 360;
    while (prevLng - curLng > 180) curLng += 360;
    pts.push([rawPts[i][0], curLng]);
  }

  return pts;
}

// Split the arc at the closest point to the aircraft position
function splitArc(
  arc: L.LatLngTuple[],
  aircraftLat: number,
  aircraftLng: number,
): { done: L.LatLngTuple[]; remaining: L.LatLngTuple[] } {
  let closestIdx = 0;
  let minDist = Infinity;
  for (let i = 0; i < arc.length; i++) {
    const dlat = arc[i][0] - aircraftLat;
    const dlng = arc[i][1] - aircraftLng;
    const dist = dlat * dlat + dlng * dlng;
    if (dist < minDist) { minDist = dist; closestIdx = i; }
  }
  const aircraftPt: L.LatLngTuple = [aircraftLat, aircraftLng];
  return {
    done: [...arc.slice(0, closestIdx + 1), aircraftPt],
    remaining: [aircraftPt, ...arc.slice(closestIdx + 1)],
  };
}

// ── Icon factories ────────────────────────────────────────────────────────────

function makeAirplaneIcon(heading: number): L.DivIcon {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="38" height="38"
      style="transform:rotate(${heading}deg);transform-origin:center;
             filter:drop-shadow(0 0 6px rgba(245,158,11,0.95)) drop-shadow(0 0 2px #000)">
      <path d="M12 2L8 10H4L6 12H10L8 22H10L12 18L14 22H16L14 12H18L20 10H16L12 2Z"
        fill="#f59e0b" stroke="#0d1117" stroke-width="0.8"/>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  });
}

function makeAirportIcon(iata: string, color: string): L.DivIcon {
  const html = `
    <div style="
      width:34px; height:34px; border-radius:50%;
      background:#0d1117; border:2.5px solid ${color};
      display:flex; align-items:center; justify-content:center;
      font-size:7px; font-weight:800; color:${color};
      font-family:monospace; line-height:1; text-align:center;
      box-shadow:0 0 10px ${color}66;
    ">${iata}</div>`;
  return L.divIcon({
    html,
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FlightMap({
  lat,
  lng,
  depLat,
  depLng,
  arrLat,
  arrLng,
  heading = 0,
  depIata = "DEP",
  arrIata = "ARR",
}: FlightMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const aircraftRef = useRef<L.Marker | null>(null);
  const routeDoneRef = useRef<L.Polyline | null>(null);
  const routeRemainingRef = useRef<L.Polyline | null>(null);
  const depMarkerRef = useRef<L.Marker | null>(null);
  const arrMarkerRef = useRef<L.Marker | null>(null);

  const hasPosition = lat !== undefined && lng !== undefined;
  const hasRoute =
    depLat !== undefined && depLng !== undefined &&
    arrLat !== undefined && arrLng !== undefined;

  // Initialise map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [lat ?? depLat ?? 25, lng ?? depLng ?? 45],
      zoom: hasRoute ? 3 : 6,
      zoomControl: true,
      attributionControl: true,
      // Allow the map to show coordinates outside ±180° so unwrapped
      // polylines render correctly without jumping across the antimeridian.
      worldCopyJump: false,
    });

    L.tileLayer(DARK_TILE_URL, {
      attribution: TILE_ATTRIBUTION,
      subdomains: "abcd",
      maxZoom: 19,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      aircraftRef.current = null;
      routeDoneRef.current = null;
      routeRemainingRef.current = null;
      depMarkerRef.current = null;
      arrMarkerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw all overlays whenever props change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear existing overlays
    routeDoneRef.current?.remove();      routeDoneRef.current = null;
    routeRemainingRef.current?.remove(); routeRemainingRef.current = null;
    depMarkerRef.current?.remove();      depMarkerRef.current = null;
    arrMarkerRef.current?.remove();      arrMarkerRef.current = null;
    aircraftRef.current?.remove();       aircraftRef.current = null;

    const bounds: L.LatLngTuple[] = [];

    if (hasRoute) {
      const arc = greatCirclePoints(depLat!, depLng!, arrLat!, arrLng!, 120);

      if (hasPosition) {
        const { done, remaining } = splitArc(arc, lat!, lng!);

        // Completed portion — solid bright cyan
        routeDoneRef.current = L.polyline(done, {
          color: "#22d3ee",
          weight: 3.5,
          opacity: 1,
        }).addTo(map);

        // Remaining portion — dashed amber
        routeRemainingRef.current = L.polyline(remaining, {
          color: "#f59e0b",
          weight: 2.5,
          opacity: 0.65,
          dashArray: "10 12",
        }).addTo(map);
      } else {
        // No live position — full arc in dashed amber
        routeRemainingRef.current = L.polyline(arc, {
          color: "#f59e0b",
          weight: 2.5,
          opacity: 0.7,
          dashArray: "10 12",
        }).addTo(map);
      }

      // Airport markers — use unwrapped longitudes from the arc endpoints
      const depPt: L.LatLngTuple = [arc[0][0], arc[0][1]];
      const arrPt: L.LatLngTuple = [arc[arc.length - 1][0], arc[arc.length - 1][1]];

      depMarkerRef.current = L.marker(depPt, {
        icon: makeAirportIcon(depIata, "#22d3ee"),
        title: depIata,
        zIndexOffset: 50,
      })
        .addTo(map)
        .bindTooltip(`<b>${depIata}</b> Departure`, { direction: "top" });

      arrMarkerRef.current = L.marker(arrPt, {
        icon: makeAirportIcon(arrIata, "#f59e0b"),
        title: arrIata,
        zIndexOffset: 50,
      })
        .addTo(map)
        .bindTooltip(`<b>${arrIata}</b> Arrival`, { direction: "top" });

      bounds.push(depPt, arrPt);
    }

    // Aircraft marker
    if (hasPosition) {
      aircraftRef.current = L.marker([lat!, lng!], {
        icon: makeAirplaneIcon(heading),
        title: "Aircraft",
        zIndexOffset: 1000,
      }).addTo(map);
      bounds.push([lat!, lng!]);
    }

    // Fit map to all markers with padding
    if (bounds.length > 0) {
      if (bounds.length === 1) {
        map.setView(bounds[0], 6);
      } else {
        try {
          map.fitBounds(L.latLngBounds(bounds), { padding: [55, 55], maxZoom: 8 });
        } catch {
          map.setView(bounds[0], 4);
        }
      }
    }
  }, [lat, lng, depLat, depLng, arrLat, arrLng, heading, hasPosition, hasRoute, depIata, arrIata]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", minHeight: 360 }}
    />
  );
}
