import { useEffect, useMemo, useState } from "react";
import { UTILITY_NAME, kmLabel, money, monthYear, prettyName, shortName, workLabel } from "../data/format";
import { DEFAULT_ASSUMPTIONS, estimateSavings, type Assumptions } from "../data/savings";
import type { Dataset, Project, TierId } from "../data/types";
import BuildWindows from "./BuildWindows";

const DOC = { DESC: "SCRTP DESC Planned Transmission Projects $2M+ (2024–2028)", GPC: "Georgia Power 2025 IRP Tech. Appendix Vol. 3" };
const MEANING: Record<TierId, string> = {
  1: "Operational coordination is likely required (the lines touch or cross).",
  2: "Potential to share right-of-way, access roads, land or permits.",
  3: "Potential to share staging, deliveries and site logistics.",
  4: "Potential to share crews, contractors and equipment.",
};

/** Grounded coordination brief: cited facts, separate suggestions, human review before printing (spec 10.3). */
export default function Brief({ data, pairId }: { data: Dataset; pairId: string }) {
  const p = data.pairById.get(pairId);
  const [reviewer, setReviewer] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [assumptions] = useState<Assumptions>(() => {
    try {
      return { ...DEFAULT_ASSUMPTIONS, ...(JSON.parse(localStorage.getItem("gridlock.v2") ?? "{}").assumptions ?? {}) };
    } catch {
      return DEFAULT_ASSUMPTIONS;
    }
  });
  useEffect(() => {
    document.body.style.background = "#fff";
    return () => { document.body.style.background = ""; };
  }, []);
  const sv = useMemo(() => (p ? estimateSavings(p, data.byId.get(p.a)!, data.byId.get(p.b)!, assumptions) : null), [p, data, assumptions]);
  if (!p || !sv) return <div className="p-10 text-black">That opportunity isn't in the current data. <a href="/">Back to GridLock</a></div>;
  const a = data.byId.get(p.a)!, b = data.byId.get(p.b)!;
  const tier = (p.tier ?? 4) as TierId;
  const cite = (x: Project) => `${DOC[x.source_doc]}, p.${x.source_page}`;
  const facts: [string, string][] = [
    [`${UTILITY_NAME[a.utility]} plans ${prettyName(a.name)} (ID ${a.source_id}), status "${a.status}", completion ${monthYear(a.in_service)}.`, cite(a)],
    [`${UTILITY_NAME[b.utility]} plans ${prettyName(b.name)} (ID ${b.source_id}), start ${monthYear(b.window[0])}, need date ${monthYear(b.in_service)}.`, cite(b)],
    [`Closest points are ${kmLabel(p)} apart${p.measurement === "estimate" ? " (estimate from named endpoints)" : ""}; project centers are ${(p.center_mi * 1.609).toFixed(1)} km apart.`, "GridLock calculation"],
    [`Planned completion dates are ${p.in_service_gap_days ?? "—"} days apart; construction windows ${p.overlap_days ? `overlap for about ${Math.round(p.overlap_days / 30.4)} months` : "do not overlap"}.`, "GridLock calculation from filed dates"],
    ...(p.sample ? [[`Sperry's sample lists this pair as ${p.sample.overlap_id} at ${p.sample.center_mi} mi (center points), ${p.sample.gap_days} days apart.`, "Projects_Overlaps.xlsx"] as [string, string]] : []),
  ];
  const suggestions = [
    ["Exchange outage plans where the lines meet and agree one outage window.", tier === 1],
    ["Compare right-of-way and access-road plans; test a shared corridor or permit.", tier <= 2],
    ["Scope one shared laydown yard and combine deliveries.", tier <= 3],
    ["Compare contractor schedules; test a joint crew or crane booking.", p.timeline === "concurrent"],
    ["Check whether either schedule could move so crews can be shared.", p.timeline !== "concurrent"],
    ["Confirm route geometry and schedules, then hold a joint planning review (SERTP).", true],
  ].filter(([, ok]) => ok).map(([t]) => t as string);
  const limits = [...new Set([...a.limitations, ...b.limitations])];
  const canPrint = reviewed && reviewer.trim().length > 1;

  return (
    <div className="min-h-full bg-white text-[#111]">
      <div className="mx-auto flex max-w-[820px] flex-wrap items-center justify-between gap-3 px-8 pt-6 print:hidden">
        <a href="/" className="text-[13px] text-[#555]">← Back to GridLock</a>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="Reviewer name" aria-label="Reviewer name" className="h-9 rounded-lg border border-[#ccc] px-2.5 text-[#111] outline-none focus:border-[#111]" />
          <label className="flex items-center gap-1.5 text-[#333]"><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} /> I reviewed these facts against the sources</label>
          <button onClick={() => print()} disabled={!canPrint} className="rounded-lg bg-[#111] px-4 py-2 font-semibold text-white disabled:opacity-35">Print or save as PDF</button>
        </div>
      </div>
      <article className="mx-auto max-w-[820px] px-8 pb-12 pt-6 text-[13px] leading-relaxed print:px-0 print:pt-0">
        <header className="flex items-start justify-between border-b-2 border-[#111] pb-3">
          <div>
            <div className="text-[12px] font-semibold text-[#555]">Cross-utility coordination brief · draft for joint planning review</div>
            <h1 className="mt-1 text-[22px] font-semibold leading-tight tracking-[-0.02em]">{shortName(a)} ↔ {shortName(b)}</h1>
          </div>
          <div className="text-right text-[12px] text-[#555]">
            <div>{new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</div>
            <div className="num">Rank #{p.rank} · score {p.score.toFixed(0)}/100</div>
          </div>
        </header>

        <p className="mt-4 text-[14.5px]">{MEANING[tier]} This identifies a subject for investigation; it does not confirm that anything can be shared.</p>

        <section className="mt-5">
          <h2 className="text-[14px] font-semibold">Observed facts</h2>
          <ol className="mt-1 space-y-1">
            {facts.map(([t, s], i) => (
              <li key={i} className="grid grid-cols-[18px_1fr] gap-1"><span className="num text-[#777]">{i + 1}.</span><span>{t} <span className="text-[11.5px] text-[#666]">[{s}]</span></span></li>
            ))}
          </ol>
        </section>

        <section className="mt-5">
          <h2 className="text-[14px] font-semibold">Build windows</h2>
          <div className="mt-1 max-w-[560px]"><BuildWindows pair={p} a={a} b={b} light /></div>
        </section>

        <section className="mt-5">
          <h2 className="text-[14px] font-semibold">Suggested actions to investigate</h2>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">{suggestions.map((t) => <li key={t}>{t}</li>)}</ul>
        </section>

        <section className="mt-5 grid grid-cols-2 gap-4">
          {[a, b].map((x) => (
            <div key={x.id} className="rounded-lg border border-[#ddd] p-3 text-[12px]">
              <div className="font-semibold text-[#555]">{UTILITY_NAME[x.utility]} · {x.source_id}</div>
              <div className="mt-0.5 text-[13px] font-semibold">{prettyName(x.name)}</div>
              <div className="mt-1 text-[#444]">{workLabel(x.work_type)}{x.kv.length ? `, ${x.kv.join("/")} kV` : ""} · location confidence {Math.round(x.geometry_confidence * 100)}% · {x.geometry_method.toLowerCase()}</div>
            </div>
          ))}
        </section>

        {sv.mid > 0 && (
          <section className="mt-5">
            <h2 className="text-[14px] font-semibold">Illustrative impact estimate: {money(sv.low)}–{money(sv.high).replace("$", "")}</h2>
            <p className="text-[11.5px] text-[#666]">Scenario-based, using editable assumptions; not a confirmed saving. Georgia costs are redacted in the public IRP and modelled from Dominion SC's filed cost per mile.</p>
          </section>
        )}

        <section className="mt-5">
          <h2 className="text-[14px] font-semibold">Limitations</h2>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12px] text-[#444]">{limits.map((l) => <li key={l}>{l}</li>)}</ul>
        </section>

        <footer className="mt-6 border-t border-[#ddd] pt-2 text-[11px] text-[#666]">
          {canPrint ? `Reviewed by ${reviewer.trim()}. ` : "Not yet reviewed. "}Public data only; nothing marked CEII. Distances, dates and scores are deterministic calculations; suggestions require human judgment. Generated by GridLock Intelligence.
        </footer>
      </article>
    </div>
  );
}
