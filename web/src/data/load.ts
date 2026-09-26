import type { Cluster, Dataset, Meta, Pair, Project, Quality } from "./types";

async function get<T>(file: string): Promise<T> {
  const r = await fetch(`/api/dataset/${file}`);
  if (!r.ok) throw new Error(`Could not load ${file} (${r.status})`);
  return r.json() as Promise<T>;
}

export async function loadDataset(): Promise<Dataset> {
  const [projects, pairs, clusters, meta, quality] = await Promise.all([
    get<Project[]>("projects.json"),
    get<Pair[]>("pairs.json"),
    get<Cluster[]>("clusters.json"),
    get<Meta>("meta.json"),
    get<Quality>("quality.json"),
  ]);
  return {
    projects,
    byId: new Map(projects.map((p) => [p.id, p])),
    pairs,
    pairById: new Map(pairs.map((p) => [p.id, p])),
    clusters,
    meta,
    quality,
  };
}

export type GridLine = { kv: number; p: [number, number][] };
export const loadGrid = () => get<GridLine[]>("grid.json");
export const loadStates = () => get<GeoJSON.FeatureCollection>("states.json");
