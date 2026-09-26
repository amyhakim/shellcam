import type { Pair, Project } from "./types";

/**
 * Illustrative planning estimate of what coordinating a pair could avoid.
 * Every driver is an editable assumption; nothing here is a utility-reported figure.
 */
export interface Assumptions {
  mobilizationPct: number; // mobilization + demobilization as % of construction cost
  crewSharePct: number; // share of the smaller job's mobilization avoided when crews are shared concurrently
  handoffSharePct: number; // same, when jobs run back-to-back (crew hand-off)
  laydownYard: number; // $ per laydown / staging yard avoided
  logisticsPct: number; // delivery & site-logistics consolidation, % of smaller job
  landPerAcre: number; // right-of-way easement $/acre
  permitSaved: number; // $ of permitting / environmental work avoided when sharing land
  sharedLengthPct: number; // share of the shorter line that can run in a common corridor
  crossingCoordination: number; // $ of outage / crossing rework avoided when lines touch
}

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  mobilizationPct: 6,
  crewSharePct: 30,
  handoffSharePct: 12,
  laydownYard: 250_000,
  logisticsPct: 1.5,
  landPerAcre: 12_000,
  permitSaved: 150_000,
  sharedLengthPct: 40,
  crossingCoordination: 300_000,
};

export const ASSUMPTION_META: Record<keyof Assumptions, { label: string; min: number; max: number; step: number; unit: "%" | "$" }> = {
  mobilizationPct: { label: "Mobilization, % of job cost", min: 2, max: 12, step: 0.5, unit: "%" },
  crewSharePct: { label: "Mobilization avoided by sharing crews", min: 0, max: 60, step: 1, unit: "%" },
  handoffSharePct: { label: "…when jobs run back-to-back", min: 0, max: 40, step: 1, unit: "%" },
  laydownYard: { label: "Cost of one laydown yard", min: 50_000, max: 800_000, step: 10_000, unit: "$" },
  logisticsPct: { label: "Logistics consolidation, % of job", min: 0, max: 5, step: 0.25, unit: "%" },
  landPerAcre: { label: "Right-of-way, $ per acre", min: 2_000, max: 40_000, step: 500, unit: "$" },
  permitSaved: { label: "Permitting avoided by sharing land", min: 0, max: 600_000, step: 10_000, unit: "$" },
  sharedLengthPct: { label: "Shorter line in a shared corridor", min: 0, max: 100, step: 5, unit: "%" },
  crossingCoordination: { label: "Outage / crossing rework avoided", min: 0, max: 1_500_000, step: 25_000, unit: "$" },
};

const ROW_FT: Record<number, number> = { 46: 60, 69: 70, 115: 100, 161: 110, 230: 125, 500: 175 };

export interface SavingsLine {
  key: string;
  label: string;
  value: number;
  why: string;
}
export interface Savings {
  lines: SavingsLine[];
  mid: number;
  low: number;
  high: number;
  sharedAcres: number;
}

export function estimateSavings(pair: Pair, a: Project, b: Project, s: Assumptions): Savings {
  const lines: SavingsLine[] = [];
  const smaller = Math.min(a.cost_est.mid, b.cost_est.mid);
  const mob = smaller * (s.mobilizationPct / 100);
  const tier = pair.tier ?? 9;
  if (tier <= 4 && pair.timeline === "concurrent") {
    lines.push({ key: "crews", label: "Shared crews & equipment", value: mob * (s.crewSharePct / 100),
      why: `${s.crewSharePct}% of the smaller job's mobilization (${s.mobilizationPct}% of ${fmt(smaller)})` });
  } else if (tier <= 4 && pair.timeline === "back-to-back") {
    lines.push({ key: "crews", label: "Crew hand-off between jobs", value: mob * (s.handoffSharePct / 100),
      why: `${s.handoffSharePct}% of the smaller job's mobilization, one crew moving straight across` });
  }
  if (tier <= 3 && pair.timeline !== "separate") {
    lines.push({ key: "yard", label: "One laydown yard instead of two", value: s.laydownYard, why: "a single staging yard serves both sites" });
    lines.push({ key: "logistics", label: "Consolidated deliveries", value: smaller * (s.logisticsPct / 100),
      why: `${s.logisticsPct}% of the smaller job's cost` });
  }
  let sharedAcres = 0;
  const bothLines = a.geom_type === "line" && b.geom_type === "line";
  const needsNewLand = a.work_type === "new_line" || b.work_type === "new_line"; // rebuilds stay on existing right-of-way
  if (tier <= 2 && bothLines && needsNewLand) {
    const shorter = Math.min(a.length_mi ?? 0, b.length_mi ?? 0);
    const kv = Math.max(...a.kv, ...b.kv, 115);
    const width = ROW_FT[kv] ?? 100;
    sharedAcres = (shorter * (s.sharedLengthPct / 100) * 5280 * width) / 43_560;
    lines.push({ key: "land", label: "Shared right-of-way", value: sharedAcres * s.landPerAcre,
      why: `${sharedAcres.toFixed(0)} acres (${s.sharedLengthPct}% of ${shorter.toFixed(1)} mi at ${width} ft)` });
    lines.push({ key: "permits", label: "One permit & survey effort", value: s.permitSaved, why: "shared environmental review and access roads" });
  }
  if (tier === 1) {
    lines.push({ key: "crossing", label: "Coordinated outage & crossing design", value: s.crossingCoordination,
      why: "avoids re-work where the two lines meet" });
  }
  const mid = lines.reduce((t, l) => t + l.value, 0);
  const conf = pair.confidence;
  return { lines, mid, low: mid * (0.45 + 0.2 * conf), high: mid * (1.35 + 0.25 * (1 - conf)), sharedAcres };
}

function fmt(n: number) {
  return n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1e3)}K`;
}
