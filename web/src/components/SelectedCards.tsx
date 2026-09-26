import { ChevronDown, FileText, RotateCcw, ScrollText } from "lucide-react";
import { useState } from "react";
import { PRIORITY_COLOR, TIER, UTILITY_COLOR, kmLabel, money, priority, shortName } from "../data/format";
import { ASSUMPTION_META, estimateSavings, type Assumptions } from "../data/savings";
import type { Pair, Project } from "../data/types";
import { STATUSES, useStore, type Status } from "../state/store";
import BuildWindows from "./BuildWindows";

export default function SelectedCards() {
  const { state, data } = useStore();
  const p = state.selected ? data.pairById.get(state.selected) : null;
  if (!p) return null;
  const a = data.byId.get(p.a)!, b = data.byId.get(p.b)!;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_440px]">
      <TimelineCard p={p} a={a} b={b} />
      <ExplanationCard p={p} a={a} b={b} />
    </div>
  );
}

function TimelineCard({ p, a, b }: { p: Pair; a: Project; b: Project }) {
  const months = Math.round(p.overlap_days / 30.4);
  const missing = [a, b].filter((x) => !x.window[0] || !x.window[1]);
  const verdict = missing.length
    ? { c: "var(--color-fg-2)", t: "Insufficient schedule data", s: `${missing.map(shortName).join(", ")} has no filed start or completion date.` }
    : p.timeline === "concurrent"
      ? { c: "var(--color-t3)", t: `Construction overlaps for about ${months} months`, s: "Both crews are expected to be active at the same time." }
      : p.completion_sync
        ? { c: "var(--color-t4)", t: `Planned completion dates are ${p.in_service_gap_days} days apart`, s: "Close finish dates, but the build windows don't overlap." }
        : { c: "var(--color-t2)", t: `Planned completion dates are ${(p.in_service_gap_days ?? 0).toLocaleString()} days apart`, s: "Review construction schedules before treating this as concurrent work." };
  return (
    <section className="panel p-4" aria-label="Selected pair timeline">
      <h2 className="text-[15px] font-semibold">Selected-pair timeline</h2>
      <p className="text-[12px] text-fg-3">Planned construction start → planned completion, from each filing</p>
      <div className="mt-4 grid grid-cols-[minmax(0,190px)_1fr] items-start gap-4">
        <div className="space-y-5 pt-2 text-[13px]">
          {[a, b].map((x) => (
            <div key={x.id}>
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full border-2 ${x.utility === "DESC" ? "" : "bg-ink-1"}`} style={{ borderColor: UTILITY_COLOR[x.utility], background: x.utility === "DESC" ? UTILITY_COLOR[x.utility] : undefined }} />
                <span className="truncate font-medium" style={{ color: UTILITY_COLOR[x.utility] }}>{shortName(x)}</span>
              </div>
              <div className="pl-[18px] text-[11.5px] text-fg-3">{x.utility === "DESC" ? "start = first budgeted year" : "start = filed start date"}</div>
            </div>
          ))}
        </div>
        <BuildWindows pair={p} a={a} b={b} />
      </div>
      <div className="mt-3 rounded-lg bg-ink-2 px-3.5 py-2.5 text-[13px]">
        <span className="font-medium" style={{ color: verdict.c }}>{verdict.t}.</span> <span className="text-fg-2">{verdict.s}</span>
      </div>
      {p.sample && (
        <p className="mt-2 text-[12px] text-fg-3">
          Sperry's sample lists this pair as <span className="num text-fg-2">{p.sample.overlap_id}</span>: center-point estimate <span className="num text-fg-2">{p.sample.center_mi} mi ({(p.sample.center_mi * 1.609).toFixed(1)} km)</span>, <span className="num text-fg-2">{p.sample.gap_days}</span> days between completion dates.
        </p>
      )}
    </section>
  );
}

const MEANING: Record<number, string> = {
  1: "Operational coordination is likely required",
  2: "Potential to share right-of-way, access roads, land or permits",
  3: "Potential to share staging, deliveries and site logistics",
  4: "Potential to share crews, contractors and equipment",
};

const ACTIONS = (p: Pair) =>
  [
    ["Exchange outage plans where the lines meet and agree one outage window.", p.tier === 1],
    ["Compare right-of-way and access-road plans; test a shared corridor or permit.", (p.tier ?? 9) <= 2],
    ["Scope one shared laydown yard and combine deliveries.", (p.tier ?? 9) <= 3],
    ["Compare contractor schedules; test a joint crew or crane booking.", p.timeline === "concurrent"],
    ["Check whether either schedule could move so crews can be shared.", p.timeline !== "concurrent"],
    ["Confirm route geometry and schedules, then hold a joint planning review.", true],
  ].filter(([, ok]) => ok).map(([t]) => t as string);

function ExplanationCard({ p, a, b }: { p: Pair; a: Project; b: Project }) {
  const { state, dispatch } = useStore();
  const [impact, setImpact] = useState(false);
  const pr = priority(p);
  const tier = p.tier ?? 4;
  return (
    <section className="panel p-4" aria-label="Why this opportunity ranks here">
      <div className="flex items-center justify-between gap-2">
        <span className="num text-[12px] text-fg-3">Rank #{p.rank} · {p.score.toFixed(0)} / 100</span>
        <span className="flex gap-1.5">
          {p.override === "crossing" && <span className="rounded-md bg-t1/15 px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em] text-t1">Crossing override</span>}
          <span className="rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.04em]" style={{ color: PRIORITY_COLOR[pr], background: `color-mix(in oklab, ${PRIORITY_COLOR[pr]} 13%, transparent)` }}>{pr} priority</span>
        </span>
      </div>
      <h2 className="mt-1.5 text-[15px] font-semibold leading-snug">
        <span style={{ color: UTILITY_COLOR[a.utility] }}>{shortName(a)}</span> <span className="text-fg-3">↔</span> <span style={{ color: UTILITY_COLOR[b.utility] }}>{shortName(b)}</span>
      </h2>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        <Metric label="Distance" value={kmLabel(p, state.advanced.method)} sub={p.measurement === "estimate" ? "estimate from endpoints" : "mapped routes"} color={TIER[tier].color} />
        <Metric label="Completion dates" value={`${(p.in_service_gap_days ?? 0).toLocaleString()} d`} sub="apart" />
        <Metric label="Construction" value={p.overlap_days ? `${Math.round(p.overlap_days / 30.4)} mo` : "No overlap"} sub={p.overlap_days ? "overlapping" : "windows apart"} />
      </dl>

      <h3 className="mt-4 text-[12.5px] font-semibold">How the score adds up</h3>
      <ul className="mt-1.5 space-y-1.5">
        {p.score_parts.map((s) => (
          <li key={s.key} className="grid grid-cols-[132px_1fr_52px] items-center gap-2 text-[12px]" title={s.why}>
            <span className="text-fg-2">{s.label}</span>
            <span className="h-1.5 rounded-full bg-ink-2"><span className="block h-full rounded-full bg-fg-2" style={{ width: `${(s.points / s.max) * 100}%` }} /></span>
            <span className="num text-right"><span className="text-fg">{s.points.toFixed(0)}</span><span className="text-fg-3">/{s.max}</span></span>
          </li>
        ))}
      </ul>
      <p className="mt-1.5 text-[11.5px] text-fg-3">{p.score_parts.map((s) => s.why).join(" · ")}</p>

      <h3 className="mt-4 text-[12.5px] font-semibold">{MEANING[tier]}</h3>
      <p className="mt-0.5 text-[12px] text-fg-3">A subject for investigation, not proof that resources, land, permits or outages can be shared.</p>
      <h3 className="mt-3 text-[12.5px] font-semibold">Actions to investigate</h3>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12.5px] text-fg-2 marker:text-fg-3">
        {ACTIONS(p).map((t) => <li key={t}>{t}</li>)}
      </ul>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button className="btn h-9 justify-center border border-line-strong text-fg" onClick={() => dispatch({ type: "drawer", drawer: "source" })}><ScrollText size={15} /> View source</button>
        <a className="btn btn-primary h-9 justify-center" href={`#/brief/${encodeURIComponent(p.id)}`} target="_blank" rel="noopener"><FileText size={15} /> Coordination brief</a>
      </div>
      <label className="mt-2.5 flex items-center gap-2 text-[12.5px]">
        <span className="label">Status</span>
        <select className="h-8 flex-1 cursor-pointer rounded-lg border border-line bg-ink-2 px-2 text-[13px] outline-none focus-visible:border-t3"
          value={state.status[p.id] ?? "identified"} onChange={(e) => dispatch({ type: "status", id: p.id, status: e.target.value as Status })}>
          {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </label>

      <button className="mt-3 flex w-full items-center justify-between rounded-lg border border-line px-3 py-2 text-left text-[12.5px] hover:bg-ink-2" onClick={() => setImpact((v) => !v)} aria-expanded={impact}>
        <span><span className="font-medium">Illustrative impact estimate</span> <span className="text-fg-3">· optional</span></span>
        <ChevronDown size={15} className={`text-fg-3 transition-transform ${impact ? "rotate-180" : ""}`} />
      </button>
      {impact && <Impact p={p} a={a} b={b} />}
    </section>
  );
}

function Metric({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div className="rounded-lg bg-ink-2 px-2.5 py-2">
      <dt className="label">{label}</dt>
      <dd className="num mt-0.5 text-[16px] font-semibold" style={color ? { color } : undefined}>{value}</dd>
      <dd className="text-[11px] leading-tight text-fg-3">{sub}</dd>
    </div>
  );
}

function Impact({ p, a, b }: { p: Pair; a: Project; b: Project }) {
  const { state, dispatch } = useStore();
  const sv = estimateSavings(p, a, b, state.assumptions);
  const s = state.assumptions;
  return (
    <div className="anim-rise mt-2 rounded-lg bg-ink-2 p-3">
      <div className="num text-[20px] font-semibold text-money">{sv.mid > 0 ? `${money(sv.low)}–${money(sv.high).replace("$", "")}` : "$0 on current schedules"}</div>
      <p className="text-[11.5px] text-fg-3">Scenario-based planning estimate, not confirmed savings. Georgia costs are modelled (redacted in the filing).</p>
      <ul className="mt-2 space-y-0.5 text-[12px]">
        {sv.lines.map((l) => <li key={l.key} className="flex justify-between gap-2" title={l.why}><span className="text-fg-2">{l.label}</span><span className="num">{money(l.value)}</span></li>)}
      </ul>
      <div className="mt-3 space-y-2 border-t border-line pt-3">
        {(Object.keys(ASSUMPTION_META) as (keyof Assumptions)[]).map((k) => {
          const m = ASSUMPTION_META[k];
          return (
            <label key={k} className="block">
              <span className="flex justify-between text-[11.5px]"><span className="text-fg-2">{m.label}</span><span className="num">{m.unit === "$" ? money(s[k]) : `${s[k]}%`}</span></span>
              <input type="range" min={m.min} max={m.max} step={m.step} value={s[k]} onChange={(e) => dispatch({ type: "assumption", key: k, value: Number(e.target.value) })} aria-label={m.label} />
            </label>
          );
        })}
        <button className="btn h-7 px-2 text-[12px]" onClick={() => dispatch({ type: "resetAssumptions" })}><RotateCcw size={13} /> Reset assumptions</button>
      </div>
    </div>
  );
}
