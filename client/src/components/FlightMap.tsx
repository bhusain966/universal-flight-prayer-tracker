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
const DARK_TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

// SVG airplane icon rotated by heading
function makeAirplaneIcon(heading: number): L.DivIcon {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32"
      style="transform: rotate(${heading}deg); transform-origin: center; filter: drop-shadow(0 0 4px rgba(245,158,11,0.6))">
      <path d="M12 2L8 10H4L6 12H10L8 22H10L12 18L14 22H16L14 12H18L20 10H16L12 2Z"
        fill="#f59e0b" stroke="#0d1117" stroke-width="0.5"/>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

// Airport circle marker
function makeAirportIcon(iata: string): L.DivIcon {
  const html = `
    <div style="
      width:28px; height:28px; border-radius:50%;
      background:#1e3a5f; border:2px solid #3b82f6;
      display:flex; align-items:center; justify-content:center;
      font-size:8px; font-weight:700; color:#94a3b8;
      font-family:monospace; line-height:1;
    ">${iata}</div>`;
  return L.divIcon({
    html,
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

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
  const routeRef = useRef<L.Polyline | null>(null);
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

    // Cleanup on unmount
    return () => {
      map.remove();
      mapRef.current = null;
      aircraftRef.current = null;
      routeRef.current = null;
      depMarkerRef.current = null;
      arrMarkerRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally run once

  // Redraw all overlays whenever props change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear existing overlays
    if (routeRef.current) { routeRef.current.remove(); routeRef.current = null; }
    if (depMarkerRef.current) { depMarkerRef.current.remove(); depMarkerRef.current = null; }
    if (arrMarkerRef.current) { arrMarkerRef.current.remove(); arrMarkerRef.current = null; }
    if (aircraftRef.current) { aircraftRef.current.remove(); aircraftRef.current = null; }

    const bounds: L.LatLngTuple[] = [];

    // Route arc
    if (hasRoute) {
      routeRef.current = L.polyline(
        [[depLat!, depLng!], [arrLat!, arrLng!]],
        {
          color: "#f59e0b",
          weight: 2,
          opacity: 0.6,
          dashArray: "6 8",
        }
      ).addTo(map);

      depMarkerRef.current = L.marker([depLat!, depLng!], {
        icon: makeAirportIcon(depIata),
        title: depIata,
        zIndexOffset: 50,
      })
        .addTo(map)
        .bindTooltip(depIata, { permanent: false, direction: "top" });

      arrMarkerRef.current = L.marker([arrLat!, arrLng!], {
        icon: makeAirportIcon(arrIata),
        title: arrIata,
        zIndexOffset: 50,
      })
        .addTo(map)
        .bindTooltip(arrIata, { permanent: false, direction: "top" });

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
        map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40] });
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
