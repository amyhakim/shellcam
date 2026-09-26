import { TIER, UTILITY_NAME } from "../data/format";
import { estimateSavings, type Assumptions } from "../data/savings";
import type { Dataset, Pair } from "../data/types";

function cell(v: unknown): string {
  const s = v == null ? "" : String(v);
  // neutralise spreadsheet formula injection and quote CSV specials
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function exportCsv(data: Dataset, pairs: Pair[], s: Assumptions) {
  const head = ["rank", "tier", "tier_label", "distance_mi", "center_distance_mi", "timeline", "build_overlap_days", "in_service_gap_days",
    "project_a", "utility_a", "project_b", "utility_b", "savings_low", "savings_mid", "savings_high", "location_confidence", "source_a", "source_b"];
  const rows = pairs.map((p) => {
    const a = data.byId.get(p.a)!, b = data.byId.get(p.b)!;
    const sv = estimateSavings(p, a, b, s);
    return [p.rank, p.tier, p.tier ? TIER[p.tier].label : "", p.mi, p.center_mi, p.timeline, p.overlap_days, p.in_service_gap_days,
      `${a.source_id} ${a.name}`, UTILITY_NAME[a.utility], `${b.source_id} ${b.name}`, UTILITY_NAME[b.utility],
      Math.round(sv.low), Math.round(sv.mid), Math.round(sv.high), p.confidence, `DESC p.${a.source_page}`, `GA IRP Vol 3 p.${b.source_page}`];
  });
  const csv = [head, ...rows].map((r) => r.map(cell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `gridlock-opportunities-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
