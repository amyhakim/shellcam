import type { Filters, Range, VoltageFilter } from "../state/store";

/** Plain-language request → visible filter changes (same rules as api/nlq.py). Never changes a measurement. */
export function parseRequest(text: string): { filters: Partial<Filters>; region?: "Savannah" | "Augusta"; timing?: "concurrent"; notes: string[] } {
  const t = text.toLowerCase();
  const filters: Partial<Filters> = {};
  const notes: string[] = [];
  let region: "Savannah" | "Augusta" | undefined;
  let timing: "concurrent" | undefined;
  const m = t.match(/(?:within|under|less than|<)\s*(\d+(?:\.\d+)?)\s*(km|kilomet\w*|mi|miles?)/);
  if (m) {
    const v = Number(m[1]) * (m[2].startsWith("mi") ? 1.609 : 1);
    const r = ([0.05, 1.6, 8, 40] as Range[]).find((x) => v <= x * 1.02) ?? 40;
    filters.range = r;
    notes.push(`within ${r} km`);
  }
  if (/touch|cross/.test(t)) { filters.range = 0.05; notes.push("touching"); }
  const kv = t.match(/\b(46|69|115|230|500)\s*-?\s*kv\b/);
  if (kv) { filters.voltage = (Number(kv[1]) < 100 ? "low" : kv[1]) as VoltageFilter; notes.push(`${kv[1]} kV`); }
  const yr = t.match(/\b(202[3-9]|203[0-4])\b/);
  if (yr) { filters.year = yr[1]; notes.push(`completing ${yr[1]}`); }
  if (/dominion|desc|south carolina/.test(t) && !/georgia/.test(t)) filters.utility = "DESC";
  else if (/georgia power|gpc/.test(t) && !/dominion/.test(t)) filters.utility = "GPC";
  if (/co-?planners|gtc|meag|dalton/.test(t)) filters.utility = "allGA";
  if (t.includes("savannah")) { region = "Savannah"; notes.push("Savannah"); }
  if (t.includes("augusta")) { region = "Augusta"; notes.push("Augusta"); }
  if (/same time|concurrent|overlapping|at once/.test(t)) { timing = "concurrent"; notes.push("overlapping builds"); }
  if (/all projects|every project/.test(t)) filters.view = "projects";
  return { filters, region, timing, notes };
}
