export type Utility = "DESC" | "GPC" | "GTC" | "MEAG" | "DU";
export type Confidence = "manual" | "sample" | "osm" | "osm_fuzzy" | "inferred" | "town" | "unlocated";
export type Timeline = "concurrent" | "back-to-back" | "separate";
export type TierId = 1 | 2 | 3 | 4;

export interface Endpoint {
  name: string;
  lat: number | null;
  lon: number | null;
  conf: Confidence;
  matched: string | null;
  cross_border?: boolean;
}

export interface CostEst {
  low: number;
  mid: number;
  high: number;
  basis: string;
}

export interface Project {
  id: string;
  utility: Utility;
  sponsor: string;
  state: "SC" | "GA";
  source_id: string;
  name: string;
  description: string;
  need: string | null;
  status: string;
  zone: string | null;
  kv: number[];
  miles: number | null;
  length_mi: number | null;
  work_type: string;
  window: [string | null, string | null];
  in_service: string | null;
  cost_total: number | null;
  cost_est: CostEst;
  confidence: Confidence;
  center: [number, number] | null;
  path: [number, number][];
  route: [number, number][][] | null;
  geom_type: "line" | "point" | null;
  geometry_basis: string;
  region: string | null;
  change_note: string | null;
  source_doc: "DESC" | "GPC";
  source_page: number;
  notes: string[];
  scope_note?: string;
  spend?: Record<string, number | null>;
  located: boolean;
  endpoints: Endpoint[];
  geometry_confidence: number;
  schedule_confidence: number;
  geometry_method: string;
  voltage_kv: number | null;
  limitations: string[];
  source_text?: string;
  source_publication_date?: string | null;
  in_service_raw?: string | null;
  build_start_basis?: string;
  spend_raw?: Record<string, string | null>;
  cost_basis?: string;
}

export interface Pair {
  id: string;
  a: string;
  b: string;
  b_utility: Utility;
  b_sponsor: string;
  km: number;
  mi: number;
  tier: TierId | null;
  center_mi: number;
  guide_flag: boolean;
  in_service_gap_days: number | null;
  overlap_days: number;
  overlap_window: [string, string] | null;
  window_gap_days: number | null;
  timeline: Timeline;
  kv_match: boolean;
  confidence: number;
  score: number;
  connector: [[number, number], [number, number]];
  region: "Savannah" | "Augusta" | "Other";
  rank: number;
  completion_sync: boolean;
  score_parts: { key: string; label: string; points: number; max: number; why: string }[];
  override: "crossing" | null;
  measurement: "route" | "estimate";
  sample?: { overlap_id: string; center_mi: number; gap_days: number | null };
}

export interface Cluster {
  id: string;
  members: string[];
  center: [number, number];
  region: string;
  n_desc: number;
  n_ga: number;
  peak_concurrent: number;
  peak_month: string | null;
  crew_share_days: number;
  best_tier: TierId | null;
  best_season: number | null;
  pairs: string[];
}

export interface TierDef {
  id: TierId;
  max_km: number;
  label: string;
  shares: string;
}

export interface Meta {
  funnel: {
    desc_projects: number;
    ga_projects: number;
    located_desc: number;
    located_ga: number;
    pairs_checked: number;
    within_40km: number;
    within_40km_gpc: number;
    concurrent: number;
    tiers: Record<string, number>;
    tiers_concurrent: Record<string, number>;
    guide_flagged: number;
  };
  conflicts: string[];
  calibration: {
    per_mile_115kv_equiv: Record<string, { median: number; p25: number; p75: number; n: number }>;
    per_project: Record<string, { median: number; p25: number; p75: number; n: number }>;
    overall: { median: number; p25: number; p75: number; n: number };
  };
  activity: Record<"DESC" | "GPC" | "GA_OTHER", Record<string, number>>;
  tiers: TierDef[];
  generated: string;
  sources: { id: string; title: string; publisher: string; file: string }[];
}

export interface Quality {
  stages: { stage: string; in: string; out: string; ok: boolean }[];
  confidence: Record<"DESC" | "GA", Record<string, number>>;
  source_issues: { project: string; name: string; detail: string; page: number | null }[];
  plan_changes: Record<string, number>;
  cancelled: { zone: string; teams: string; name: string; date: string; page: number }[];
  completed: { zone: string; teams: string; name: string; date: string; page: number }[];
  table1_check: { filed_new_row_miles_10yr: number; extracted_new_line_miles: number; note: string };
  sample_audit: {
    reproduced: { overlap_id: string; claimed_mi: number; recomputed_mi: number; match: boolean }[];
    issues: { severity: string; check: string; detail: string }[];
    found: { overlap_id: string; ours: boolean; our_tier: number | null; our_mi: number | null; their_center_mi: number }[];
    n_projects: number;
    n_overlaps: number;
  };
  unlocated: { id: string; name: string; endpoints: string[] }[];
}

export interface Dataset {
  projects: Project[];
  byId: Map<string, Project>;
  pairs: Pair[];
  pairById: Map<string, Pair>;
  clusters: Cluster[];
  meta: Meta;
  quality: Quality;
}
