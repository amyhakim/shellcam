import type { Pair, Project, TierId, Utility } from "./types";

export const UTILITY_NAME: Record<Utility, string> = {
  DESC: "Dominion Energy SC",
  GPC: "Georgia Power",
  GTC: "Georgia Transmission",
  MEAG: "MEAG Power",
  DU: "Dalton Utilities",
};

export const UTILITY_COLOR: Record<Utility, string> = {
  DESC: "#2ee6a6",
  GPC: "#a594ff",
  GTC: "#8b93a7",
  MEAG: "#8b93a7",
  DU: "#8b93a7",
};

export const TIER: Record<TierId, { label: string; short: string; color: string; blurb: string; reach: string }> = {
  1: { label: "Must coordinate", short: "Crossing", color: "#ff4d6d", reach: "touching", blurb: "The lines touch or cross, so outage timing and crossing structures have to be planned together." },
  2: { label: "Share the land", short: "< 1 mi", color: "#ff9f1c", reach: "under 1 mile", blurb: "Close enough to share right-of-way, access roads and permits." },
  3: { label: "Share the site", short: "< 5 mi", color: "#ffd23f", reach: "under 5 miles", blurb: "Close enough to share a laydown yard, deliveries and site logistics." },
  4: { label: "Share crews", short: "< 25 mi", color: "#4cc9f0", reach: "under 25 miles", blurb: "Within a morning's drive of one staging yard, so crews, cranes and contractors can be shared." },
};

const SMALL = new Set(["and", "of", "the", "to", "at", "in", "on", "for"]);
const KEEP = new Set(["GTC", "MEAG", "DU", "SPDC", "CIP", "DEP", "USA", "APC", "FPL", "CC", "QTS", "SKC", "LG&E", "VCS1", "VCS2", "PSA", "AM", "LR", "II", "III", "ITS", "STATCOM", "SW", "#1", "#2"]);

/** Georgia's filing is ALL CAPS; render names the way a person would write them. */
export function prettyName(raw: string): string {
  let s = raw.replace(/^(SAV|GTC|MEAG|DU)\s*:\s*/i, "").replace(/\((SAV|GTC|MEAG|GPC)\)/gi, "").replace(/\s+/g, " ").trim();
  if (s === s.toUpperCase()) {
    s = s
      .split(" ")
      .map((w, i) => {
        if (KEEP.has(w)) return w;
        if (/^\d+(\/\d+)?KV$/i.test(w)) return w.replace(/KV$/i, " kV");
        if (/^KV$/i.test(w)) return "kV";
        const lw = w.toLowerCase();
        if (i > 0 && SMALL.has(lw)) return lw;
        return lw.replace(/(^|[-(/])([a-z])/g, (_, p, c) => p + c.toUpperCase());
      })
      .join(" ");
  }
  s = s.replace(/\bMc([a-z])/g, (_, c: string) => "Mc" + c.toUpperCase()).replace(/\((usa|sav|apc|fpl|gpc|gtc)\)/gi, (m) => m.toUpperCase());
  return s.replace(/(\d)\s?kv\b/gi, "$1 kV").replace(/\s+-\s+/g, " – ").replace(/\s+–\s+/g, " – ");
}

/** Short route label: "Jasper – Okatie" from endpoints, else a trimmed name. */
export function shortName(p: Project): string {
  const eps = p.endpoints.map((e) => prettyName(e.name)).filter((n) => n && !/^(cc|new)$/i.test(n));
  if (eps.length >= 2) return `${eps[0]} – ${eps[1]}`;
  const n = prettyName(p.name).split(/[:(]/)[0].replace(/\b\d{2,3}(\/\d+)?\s?kV\b.*$/i, "").trim();
  return n.length > 34 ? n.slice(0, 32) + "…" : n;
}

export function workLabel(w: string): string {
  return (
    {
      new_line: "New line",
      rebuild: "Rebuild",
      reconductor: "Reconductor",
      substation: "Substation",
      substation_equipment: "Substation equipment",
      other: "Other work",
    } as Record<string, string>
  )[w] ?? w;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function monthYear(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m] = iso.split("-").map(Number);
  return `${MON[m - 1]} ${y}`;
}
export function monthSpan(a: string | null, b: string | null): string {
  if (!a || !b) return "—";
  const [ya] = a.split("-");
  const [yb] = b.split("-");
  return ya === yb ? `${monthYear(a).split(" ")[0]}–${monthYear(b)}` : `${monthYear(a)} – ${monthYear(b)}`;
}

export function money(n: number, digits = 1): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(digits)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(a >= 1e7 ? 0 : digits)}M`;
  if (a >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${Math.round(n)}`;
}
export function moneyRange(lo: number, hi: number): string {
  return `${money(lo)}–${money(hi).replace("$", "")}`;
}

export function distanceLabel(p: Pair): string {
  if (p.tier === 1) return "touching";
  return p.mi < 1 ? `${Math.round(p.mi * 5280).toLocaleString()} ft` : `${p.mi.toFixed(1)} mi`;
}

export function durationLabel(days: number): string {
  if (days < 45) return `${days} days`;
  const months = Math.round(days / 30.4);
  if (months < 24) return `${months} months`;
  return `${(days / 365).toFixed(1)} years`;
}

export function timelinePhrase(p: Pair): string {
  if (p.timeline === "concurrent" && p.overlap_window)
    return `both under construction ${monthSpan(p.overlap_window[0], p.overlap_window[1])}`;
  if (p.timeline === "back-to-back") return `built back-to-back, ${durationLabel(p.window_gap_days ?? 0)} apart`;
  return `built ${durationLabel(p.window_gap_days ?? p.in_service_gap_days ?? 0)} apart`;
}

export const CONF_LABEL: Record<string, string> = {
  manual: "Verified by hand",
  sample: "From Sperry's sample",
  osm: "Matched on map",
  osm_fuzzy: "Close name match",
  inferred: "Inferred from line lengths",
  town: "Town-level only",
  unlocated: "Not located",
};

export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function monthNum(iso: string): number {
  const [y, m] = iso.split("-").map(Number);
  return y * 12 + (m - 1);
}

export type Priority = "High" | "Medium" | "Low";
/** High: can share land/site (or lines touch) and the builds are close in time. */
export function priority(p: Pair): Priority {
  const t = p.tier ?? 9;
  if ((t <= 3 && p.timeline !== "separate") || (t === 1 && p.timeline !== "separate")) return "High";
  if (t <= 3 || p.timeline === "concurrent") return "Medium";
  return "Low";
}
export const PRIORITY_COLOR: Record<Priority, string> = { High: "#ff9f1c", Medium: "#4cc9f0", Low: "#7e8899" };

export function kmLabel(p: Pair, method: "closest" | "guide" = "closest"): string {
  const km = method === "closest" ? p.km : p.center_mi * 1.609;
  if (method === "closest" && p.tier === 1) return "0 km";
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}
export function gapDays(p: Pair): string {
  return p.in_service_gap_days == null ? "—" : `${p.in_service_gap_days.toLocaleString()} d`;
}
