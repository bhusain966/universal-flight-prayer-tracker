import { useEffect, useRef, useCallback } from "react";
import { MapView } from "./Map";

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

// Dark aviation map styles
const DARK_MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#0d1117" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0d1117" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#4a5568" }] },
  { featureType: "administrative", elementType: "geometry.stroke", stylers: [{ color: "#1e2a3a" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#0d1520" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#111827" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1a2332" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#1e2d42" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#111827" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0a1628" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#1e3a5f" }] },
  { featureType: "administrative.country", elementType: "geometry.stroke", stylers: [{ color: "#1e3a5f" }] },
];

export default function FlightMap({
  lat,
  lng,
  depLat,
  depLng,
  arrLat,
  arrLng,
  heading = 0,
  depIata,
  arrIata,
}: FlightMapProps) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const aircraftMarkerRef = useRef<google.maps.Marker | null>(null);
  const routePolylineRef = useRef<google.maps.Polyline | null>(null);
  const depMarkerRef = useRef<google.maps.Marker | null>(null);
  const arrMarkerRef = useRef<google.maps.Marker | null>(null);

  const hasPosition = lat !== undefined && lng !== undefined;
  const hasRoute =
    depLat !== undefined &&
    depLng !== undefined &&
    arrLat !== undefined &&
    arrLng !== undefined;

  const centerLat = lat ?? depLat ?? 25;
  const centerLng = lng ?? depLng ?? 45;

  // Clear all overlays
  const clearOverlays = useCallback(() => {
    if (routePolylineRef.current) { routePolylineRef.current.setMap(null); routePolylineRef.current = null; }
    if (depMarkerRef.current) { depMarkerRef.current.setMap(null); depMarkerRef.current = null; }
    if (arrMarkerRef.current) { arrMarkerRef.current.setMap(null); arrMarkerRef.current = null; }
    if (aircraftMarkerRef.current) { aircraftMarkerRef.current.setMap(null); aircraftMarkerRef.current = null; }
  }, []);

  // Draw all overlays from scratch
  const drawOverlays = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    clearOverlays();

    if (hasRoute) {
      routePolylineRef.current = new google.maps.Polyline({
        path: [
          { lat: depLat!, lng: depLng! },
          { lat: arrLat!, lng: arrLng! },
        ],
        geodesic: true,
        strokeColor: "#f59e0b",
        strokeOpacity: 0,
        strokeWeight: 2,
        icons: [
          {
            icon: {
              path: "M 0,-1 0,1",
              strokeOpacity: 0.7,
              strokeColor: "#f59e0b",
              scale: 3,
            },
            offset: "0",
            repeat: "18px",
          },
        ],
        map,
      });

      depMarkerRef.current = new google.maps.Marker({
        position: { lat: depLat!, lng: depLng! },
        map,
        label: { text: depIata ?? "DEP", color: "#94a3b8", fontSize: "10px", fontWeight: "700" },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: "#1e3a5f",
          fillOpacity: 1,
          strokeColor: "#3b82f6",
          strokeWeight: 2,
          scale: 8,
        },
        title: depIata,
        zIndex: 50,
      });

      arrMarkerRef.current = new google.maps.Marker({
        position: { lat: arrLat!, lng: arrLng! },
        map,
        label: { text: arrIata ?? "ARR", color: "#94a3b8", fontSize: "10px", fontWeight: "700" },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: "#1e3a5f",
          fillOpacity: 1,
          strokeColor: "#3b82f6",
          strokeWeight: 2,
          scale: 8,
        },
        title: arrIata,
        zIndex: 50,
      });
    }

    if (hasPosition) {
      aircraftMarkerRef.current = new google.maps.Marker({
        position: { lat: lat!, lng: lng! },
        map,
        icon: {
          path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
          fillColor: "#f59e0b",
          fillOpacity: 1,
          strokeColor: "#0d1117",
          strokeWeight: 1.5,
          scale: 6,
          rotation: heading,
        },
        title: "Aircraft",
        zIndex: 100,
      });
    }

    // Fit bounds
    if (hasRoute) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend({ lat: depLat!, lng: depLng! });
      bounds.extend({ lat: arrLat!, lng: arrLng! });
      if (hasPosition) bounds.extend({ lat: lat!, lng: lng! });
      map.fitBounds(bounds, { top: 50, bottom: 50, left: 50, right: 50 });
    } else if (hasPosition) {
      map.setCenter({ lat: lat!, lng: lng! });
      map.setZoom(6);
    }
  }, [lat, lng, depLat, depLng, arrLat, arrLng, heading, hasPosition, hasRoute, depIata, arrIata, clearOverlays]);

  function handleMapReady(map: google.maps.Map) {
    mapRef.current = map;
    map.setOptions({ styles: DARK_MAP_STYLES });
    drawOverlays();
  }

  // Redraw whenever any prop changes (new flight searched, position update)
  useEffect(() => {
    if (!mapRef.current) return;
    drawOverlays();
  }, [drawOverlays]);

  return (
    <MapView
      initialCenter={{ lat: centerLat, lng: centerLng }}
      initialZoom={hasRoute ? 4 : 6}
      onMapReady={handleMapReady}
      className="w-full h-full min-h-[340px]"
    />
  );
}
