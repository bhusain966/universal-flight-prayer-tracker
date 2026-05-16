/**
 * Unit tests for the great-circle interpolation and route-split logic
 * that powers the visible flight route trace on the Leaflet map.
 *
 * These functions live in the client component but the pure math is
 * framework-independent, so we test it here in the server test suite
 * (same vitest runner, no DOM needed).
 */
import { describe, it, expect } from "vitest";

// ── Pure functions duplicated for testing (mirrors FlightMap.tsx) ─────────────

function greatCirclePoints(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
  steps = 80
): [number, number][] {
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

  const rawPts: [number, number][] = [];
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
  // Longitude unwrapping: keep consecutive points within ±180° of each other
  const pts: [number, number][] = [rawPts[0]];
  for (let i = 1; i < rawPts.length; i++) {
    let prevLng = pts[i - 1][1];
    let curLng = rawPts[i][1];
    while (curLng - prevLng > 180) curLng -= 360;
    while (prevLng - curLng > 180) curLng += 360;
    pts.push([rawPts[i][0], curLng]);
  }
  return pts;
}

function splitArc(
  arc: [number, number][],
  aircraftLat: number,
  aircraftLng: number
): { done: [number, number][]; remaining: [number, number][] } {
  let closestIdx = 0;
  let minDist = Infinity;
  for (let i = 0; i < arc.length; i++) {
    const dlat = arc[i][0] - aircraftLat;
    const dlng = arc[i][1] - aircraftLng;
    const dist = dlat * dlat + dlng * dlng;
    if (dist < minDist) { minDist = dist; closestIdx = i; }
  }
  const aircraftPt: [number, number] = [aircraftLat, aircraftLng];
  return {
    done: [...arc.slice(0, closestIdx + 1), aircraftPt],
    remaining: [aircraftPt, ...arc.slice(closestIdx + 1)],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("greatCirclePoints", () => {
  it("returns steps+1 points for a normal route", () => {
    const pts = greatCirclePoints(41.97, -87.91, 25.27, 51.61, 80);
    expect(pts).toHaveLength(81); // 0..80 inclusive
  });

  it("first point is close to departure airport", () => {
    const pts = greatCirclePoints(41.97, -87.91, 25.27, 51.61, 80);
    expect(pts[0][0]).toBeCloseTo(41.97, 1);
    expect(pts[0][1]).toBeCloseTo(-87.91, 1);
  });

  it("last point is close to arrival airport", () => {
    const pts = greatCirclePoints(41.97, -87.91, 25.27, 51.61, 80);
    expect(pts[pts.length - 1][0]).toBeCloseTo(25.27, 1);
    expect(pts[pts.length - 1][1]).toBeCloseTo(51.61, 1);
  });

  it("returns single point when departure equals arrival", () => {
    const pts = greatCirclePoints(25.27, 51.61, 25.27, 51.61, 80);
    expect(pts).toHaveLength(1);
  });

  it("arc curves northward for ORD→DOH (great-circle effect)", () => {
    // The great-circle from Chicago to Doha should pass above 50°N latitude
    const pts = greatCirclePoints(41.97, -87.91, 25.27, 51.61, 100);
    const maxLat = Math.max(...pts.map((p) => p[0]));
    expect(maxLat).toBeGreaterThan(50);
  });

  it("longitude unwrapping: consecutive points never jump more than 180°", () => {
    // A long eastbound route from Los Angeles to Tokyo crosses the antimeridian.
    // Without unwrapping, the longitude would jump from ~+170 to ~-170 (a 340° gap).
    // With unwrapping, consecutive deltas must stay within ±180°.
    const pts = greatCirclePoints(33.94, -118.41, 35.55, 139.78, 120);
    for (let i = 1; i < pts.length; i++) {
      const delta = Math.abs(pts[i][1] - pts[i - 1][1]);
      expect(delta).toBeLessThanOrEqual(180);
    }
  });

  it("westbound route (DOH→JFK) has no longitude jump > 180°", () => {
    const pts = greatCirclePoints(25.27, 51.61, 40.64, -73.78, 120);
    for (let i = 1; i < pts.length; i++) {
      const delta = Math.abs(pts[i][1] - pts[i - 1][1]);
      expect(delta).toBeLessThanOrEqual(180);
    }
  });
});

describe("splitArc", () => {
  const arc = greatCirclePoints(41.97, -87.91, 25.27, 51.61, 100);

  it("done + remaining together cover the full route", () => {
    // Aircraft roughly halfway — near Atlantic
    const { done, remaining } = splitArc(arc, 55.0, -20.0);
    // The aircraft point appears as the last of done and first of remaining
    expect(done[done.length - 1]).toEqual([55.0, -20.0]);
    expect(remaining[0]).toEqual([55.0, -20.0]);
    // Total unique points = done.length + remaining.length - 1 (shared aircraft pt)
    expect(done.length + remaining.length - 1).toBe(arc.length + 1);
  });

  it("done is short when aircraft is near departure", () => {
    const { done, remaining } = splitArc(arc, 42.5, -85.0);
    expect(done.length).toBeLessThan(remaining.length);
  });

  it("done is long when aircraft is near arrival", () => {
    const { done, remaining } = splitArc(arc, 26.0, 50.0);
    expect(done.length).toBeGreaterThan(remaining.length);
  });

  it("aircraft point is exactly injected at junction", () => {
    const { done, remaining } = splitArc(arc, 50.0, 10.0);
    const junctionDone = done[done.length - 1];
    const junctionRemaining = remaining[0];
    expect(junctionDone).toEqual([50.0, 10.0]);
    expect(junctionRemaining).toEqual([50.0, 10.0]);
  });
});
