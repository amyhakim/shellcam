import { Check, ExternalLink } from "lucide-react";
import { CONF_LABEL, TIER } from "../data/format";
import type { TierId } from "../data/types";
import { useStore } from "../state/store";
import { TierIcon } from "./bits";
import Drawer from "./Drawer";

const CONF_ORDER = ["manual", "sample", "osm", "osm_fuzzy", "inferred", "town", "unlocated"];
const CONF_COLOR: Record<string, string> = { manual: "#2ee6a6", sample: "#2ee6a6", osm: "#4cc9f0", osm_fuzzy: "#7aa7ff", inferred: "#ffd23f", town: "#ff9f1c", unlocated: "#4a5568" };

export default function MethodDrawer() {
  const { state, dispatch, data } = useStore();
  const q = data.quality;
  const sa = q.sample_audit;
  const adv = state.advanced;
  const set = (patch: Partial<typeof adv>) => dispatch({ type: "advanced", patch });
  return (
    <Drawer title="How this was calculated" sub="Methodology, data quality and advanced settings" onClose={() => dispatch({ type: "drawer", drawer: null })}>
      <Section title="Advanced settings">
        <Seg label="Distance method" value={adv.method} options={[["closest", "Closest points"], ["guide", "Center points (guide)"]]} onChange={(v) => set({ method: v as typeof adv.method })} />
        <Seg label="Region" value={adv.region} options={[["all", "All"], ["Savannah", "Savannah"], ["Augusta", "Augusta"], ["Other", "Other"]]} onChange={(v) => set({ region: v as typeof adv.region })} />
        <Seg label="Timing" value={adv.timing} options={[["any", "Any"], ["concurrent", "Overlapping builds only"]]} onChange={(v) => set({ timing: v as typeof adv.timing })} />
      </Section>

      <Section title="Distance">
        <p>Compares every Dominion SC project with every Georgia project. Distance is measured between the <b>closest points</b> of the two projects in UTM zone 17N, and pairs over 40 km (25 mi) are dropped. Where a route isn't mapped, the line is drawn straight between its named endpoints and the distance is labelled an estimate. The locations guide's center-point method is available above.</p>
        <table className="mt-2 w-full text-[12.5px]">
          <tbody>
            {([1, 2, 3, 4] as TierId[]).map((t) => (
              <tr key={t} className="border-b border-line/60">
                <td className="py-1.5 pr-2"><span className="inline-flex items-center gap-1.5" style={{ color: TIER[t].color }}><TierIcon tier={t} size={13} />{["Touching or crossing", "Under 1.6 km", "Under 8 km", "Under 40 km"][t - 1]}</span></td>
                <td className="py-1.5 text-fg-2">{["Operational coordination likely required", "Shared right-of-way, access roads, land or permits", "Shared staging, deliveries, site logistics", "Shared crews, contractors, equipment"][t - 1]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Timing">
        <p>Each project's construction window runs from its planned start to its planned completion. Georgia files an explicit start date; Dominion SC's start is the first year with budgeted spend. The dashboard separates <b>overlapping construction</b> from <b>completion dates close together</b> (within 180 days), and shows "insufficient schedule data" instead of inventing dates.</p>
      </Section>

      <Section title="Ranking (100 points, deterministic)">
        <ul className="space-y-1">
          <li><b>Geographic proximity, 50:</b> full points when touching, falling linearly to 0 at 40 km.</li>
          <li><b>Timeline alignment, 25:</b> 15–25 for overlapping builds (more months, more points); 12 when completions are within 180 days; 8 within a year; 6 back-to-back.</li>
          <li><b>Infrastructure compatibility, 15:</b> same voltage 8, both are lines 4, same kind of work 3.</li>
          <li><b>Data confidence, 10:</b> 70% location confidence, 30% schedule confidence.</li>
          <li><b>Crossing override:</b> touching or crossing pairs are flagged regardless of score.</li>
        </ul>
      </Section>

      <Section title="Checked against Sperry's sample">
        <table className="w-full text-[12.5px]">
          <thead className="text-fg-3"><tr className="border-b border-line text-left"><th className="py-1 font-medium">Overlap</th><th className="py-1 text-right font-medium">Supplied</th><th className="py-1 text-right font-medium">Recomputed</th><th className="py-1 text-right font-medium">Found</th></tr></thead>
          <tbody>
            {sa.reproduced.map((r, i) => (
              <tr key={r.overlap_id} className="border-b border-line/60">
                <td className="num py-1">{r.overlap_id}</td>
                <td className="num py-1 text-right">{r.claimed_mi.toFixed(2)} mi</td>
                <td className="num py-1 text-right">{r.recomputed_mi.toFixed(2)} mi {r.match && <Check size={12} className="inline text-money" />}</td>
                <td className="py-1 text-right">{sa.found[i].ours ? <Check size={13} className="inline text-money" /> : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="mt-2 space-y-1 text-[12px] text-fg-3">{sa.issues.map((i, k) => <li key={k}><span className="text-t2">{i.check}:</span> {i.detail}</li>)}</ul>
      </Section>

      <Section title="Issues found in the filings">
        <ul className="space-y-1.5">
          {q.source_issues.map((s, k) => (
            <li key={k}><b className="font-medium text-fg">{s.name}</b>: {s.detail}{s.page && <> <a className="inline-flex items-center gap-0.5 text-fg-3 underline" href={`/sources/desc.pdf#page=${s.page}`} target="_blank" rel="noopener">p.{s.page}<ExternalLink size={10} /></a></>}</li>
          ))}
        </ul>
      </Section>

      <Section title="Location confidence">
        {(["DESC", "GA"] as const).map((u) => {
          const c = q.confidence[u];
          const total = Object.values(c).reduce((a, b) => a + b, 0);
          return (
            <div key={u} className="mb-2 grid grid-cols-[110px_1fr] items-center gap-2">
              <span className="text-[12.5px]">{u === "DESC" ? "Dominion SC" : "Georgia ITS"} <span className="num text-fg-3">({total})</span></span>
              <div className="flex h-5 overflow-hidden rounded">
                {CONF_ORDER.filter((k) => c[k]).map((k) => <div key={k} style={{ width: `${(c[k] / total) * 100}%`, background: CONF_COLOR[k] }} title={`${CONF_LABEL[k]}: ${c[k]}`} />)}
              </div>
            </div>
          );
        })}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]">
          {CONF_ORDER.filter((k) => k !== "manual").map((k) => <span key={k} className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: CONF_COLOR[k] }} />{CONF_LABEL[k]}</span>)}
        </div>
      </Section>

      <Section title="What AI does and doesn't do">
        <p>Distances, crossings, date arithmetic, tier thresholds, scores and source references are calculated by deterministic code. Typed requests only change visible filters. Briefs quote filed facts with page citations, list suggestions separately, and require a person to review them before printing.</p>
      </Section>

      <Section title="Sources">
        <ul className="space-y-1">
          {data.meta.sources.map((s) => <li key={s.id}><a className="inline-flex items-center gap-1 underline" href={`/${s.file}`} target="_blank" rel="noopener">{s.title}<ExternalLink size={11} /></a> <span className="text-fg-3">· {s.publisher}</span></li>)}
          <li>Facility locations and existing lines: © OpenStreetMap contributors (ODbL). Place search: Nominatim. Basemap: Esri.</li>
          <li>Public data only. Nothing marked CEII is used; redacted values stay redacted.</li>
        </ul>
      </Section>
    </Drawer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6 text-[13px] leading-relaxed text-fg-2">
      <h3 className="mb-2 text-[14px] font-semibold text-fg">{title}</h3>
      {children}
    </section>
  );
}

function Seg({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-3">
      <span>{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {options.map(([v, l]) => <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}
      </div>
    </div>
  );
}
