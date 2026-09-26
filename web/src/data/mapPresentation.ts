import { kmLabel, monthNum, UTILITY_COLOR } from "./format";
import type { Pair, Project, Utility } from "./types";

export type DistanceMethod = "closest" | "guide";
export type Coordinate = [number, number];

// Shared by SVG keys and the map's canvas icons (16 × 16 view box).
export const UTILITY_SYMBOLS = {
  DESC: { id: "utility-circle", shape: "Circle", path: "M8 2a6 6 0 1 0 0 12a6 6 0 1 0 0-12Z", color: UTILITY_COLOR.DESC },
  GPC: { id: "utility-square", shape: "Square", path: "M2.5 2.5h11v11h-11Z", color: UTILITY_COLOR.GPC },
  other: { id: "utility-diamond", shape: "Diamond", path: "M8 1L15 8L8 15L1 8Z", color: UTILITY_COLOR.GTC },
} as const;

export function utilitySymbol(utility: Utility) {
  return UTILITY_SYMBOLS[utility === "DESC" || utility === "GPC" ? utility : "other"];
}

export function measurementText(pair: Pair, method: DistanceMethod) {
  const estimated = method === "guide" || pair.measurement === "estimate";
  const basis = method === "guide" ? "center to center" : "closest points";
  const description = `${basis}${estimated ? " · estimated" : ""}`;
  return { distance: kmLabel(pair, method), description, label: `${kmLabel(pair, method)} · ${description}` };
}

function validCoordinate(value: unknown): value is Coordinate {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite)
    && Math.abs(value[0]) <= 180 && Math.abs(value[1]) <= 90;
}

export function measurementCoordinates(pair: Pair, method: DistanceMethod, projects: Map<string, Project>): [Coordinate, Coordinate] | null {
  const points = method === "guide"
    ? [pair.a, pair.b].map((id) => {
      const center = projects.get(id)?.center;
      return center ? [center[1], center[0]] : null; // Stored centers are latitude, longitude.
    })
    : pair.connector;
  return points?.length === 2 && validCoordinate(points[0]) && validCoordinate(points[1]) ? [points[0], points[1]] : null;
}

export function pairVisibleInMonth(pair: Pair, month: string | null) {
  if (!month) return true;
  const m = monthNum(month);
  return !!pair.overlap_window && monthNum(pair.overlap_window[0]) <= m && monthNum(pair.overlap_window[1]) >= m;
}

export function activeMapPair(pairs: Pair[], hovered: string | null, selected: string | null, month: string | null) {
  const eligible = (id: string | null) => id ? pairs.find((pair) => pair.id === id && pairVisibleInMonth(pair, month)) : undefined;
  return eligible(hovered) ?? eligible(selected) ?? null;
}

export function measurementLayer(pair: Pair | null, method: DistanceMethod, projects: Map<string, Project>): GeoJSON.FeatureCollection {
  if (!pair) return { type: "FeatureCollection", features: [] };
  const coords = measurementCoordinates(pair, method, projects);
  if (!coords) return { type: "FeatureCollection", features: [] };
  const [a, b] = coords;
  const coincident = Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
  const features: GeoJSON.Feature[] = [];
  if (!coincident) features.push({ type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: { id: pair.id } });
  for (const point of coincident ? [a] : coords) features.push({ type: "Feature", geometry: { type: "Point", coordinates: point }, properties: { kind: "endpoint" } });
  features.push({ type: "Feature", geometry: { type: "Point", coordinates: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }, properties: { kind: "label", label: measurementText(pair, method).label } });
  return { type: "FeatureCollection", features };
}

