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

// Dark tile layer — CartoDB Dark Matter (no API key required)
const DARK_TILE_URL =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

// ── Geodesic interpolation ────────────────────────────────────────────────────
// Interpolates N points along the great-circle arc between two lat/lng pairs.
// Returns an array of [lat, lng] tuples suitable for L.polyline.
function greatCirclePoints(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
  steps = 80
): L.LatLngTuple[] {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;

  const φ1 = toRad(lat1), λ1 = toRad(lng1);
  const φ2 = toRad(lat2), λ2 = toRad(lng2);

  const d = 2 * Math.asin(
    Math.sqrt(
      Math.sin((φ2 - φ1) / 2) ** 2 +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2
    )
  );

  if (d === 0) return [[lat1, lng1]];

  const pts: L.LatLngTuple[] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    const φ = Math.atan2(z, Math.sqrt(x * x + y * y));
    const λ = Math.atan2(y, x);
    pts.push([toDeg(φ), toDeg(λ)]);
  }
  return pts;
}

// Given the full arc and the aircraft position, find the closest arc index
// and split into completed (dep → aircraft) and remaining (aircraft → arr).
function splitArc(
  arc: L.LatLngTuple[],
  aircraftLat: number,
  aircraftLng: number
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
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="36" height="36"
      style="transform:rotate(${heading}deg);transform-origin:center;
             filter:drop-shadow(0 0 6px rgba(245,158,11,0.9)) drop-shadow(0 0 2px #000)">
      <path d="M12 2L8 10H4L6 12H10L8 22H10L12 18L14 22H16L14 12H18L20 10H16L12 2Z"
        fill="#f59e0b" stroke="#1a1a2e" stroke-width="0.8"/>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function makeAirportIcon(iata: string, color: string): L.DivIcon {
  const html = `
    <div style="
      width:32px; height:32px; border-radius:50%;
      background:#0d1117; border:2.5px solid ${color};
      display:flex; align-items:center; justify-content:center;
      font-size:7px; font-weight:800; color:${color};
      font-family:monospace; line-height:1;
      box-shadow:0 0 8px ${color}55;
    ">${iata}</div>`;
  return L.divIcon({
    html,
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
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

    const centerLat = lat ?? depLat ?? 25;
    const centerLng = lng ?? depLng ?? 45;

    const map = L.map(containerRef.current, {
      center: [centerLat, centerLng],
      zoom: hasRoute ? 4 : 6,
      zoomControl: true,
      attributionControl: true,
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
      const arc = greatCirclePoints(depLat!, depLng!, arrLat!, arrLng!, 100);

      if (hasPosition) {
        // Split arc into completed (bright cyan) and remaining (dim dashed amber)
        const { done, remaining } = splitArc(arc, lat!, lng!);

        // Completed portion — bright, solid, thick
        routeDoneRef.current = L.polyline(done, {
          color: "#22d3ee",    // cyan-400
          weight: 3,
          opacity: 0.95,
        }).addTo(map);

        // Remaining portion — dimmer, dashed
        routeRemainingRef.current = L.polyline(remaining, {
          color: "#f59e0b",   // amber-400
          weight: 2,
          opacity: 0.55,
          dashArray: "8 10",
        }).addTo(map);
      } else {
        // No live position — draw full arc in amber dashed
        routeRemainingRef.current = L.polyline(arc, {
          color: "#f59e0b",
          weight: 2.5,
          opacity: 0.7,
          dashArray: "8 10",
        }).addTo(map);
      }

      // Airport markers
      depMarkerRef.current = L.marker([depLat!, depLng!], {
        icon: makeAirportIcon(depIata, "#22d3ee"),
        title: depIata,
        zIndexOffset: 50,
      })
        .addTo(map)
        .bindTooltip(`<b>${depIata}</b> Departure`, { direction: "top", className: "avi-tooltip" });

      arrMarkerRef.current = L.marker([arrLat!, arrLng!], {
        icon: makeAirportIcon(arrIata, "#f59e0b"),
        title: arrIata,
        zIndexOffset: 50,
      })
        .addTo(map)
        .bindTooltip(`<b>${arrIata}</b> Arrival`, { direction: "top", className: "avi-tooltip" });

      bounds.push([depLat!, depLng!], [arrLat!, arrLng!]);
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

    // Fit map to all markers
    if (bounds.length > 0) {
      if (bounds.length === 1) {
        map.setView(bounds[0], 6);
      } else {
        map.fitBounds(L.latLngBounds(bounds), { padding: [50, 50] });
      }
    }
  }, [lat, lng, depLat, depLng, arrLat, arrLng, heading, hasPosition, hasRoute, depIata, arrIata]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", minHeight: 340 }}
    />
  );
}
