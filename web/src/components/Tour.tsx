import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useStore } from "../state/store";
import { flyTo } from "./camera";

/** The spec's demo narrative (section 15), one short step at a time. */
export default function Tour() {
  const { state, dispatch, data } = useStore();
  const step = state.tourStep ?? 0;
  const demo = useMemo(
    () => data.pairs.find((p) => data.byId.get(p.a)!.name.includes("Jasper") && data.byId.get(p.b)!.name.toUpperCase().includes("MCINTOSH - PURRYSBURG")),
    [data],
  );
  const km = demo ? demo.km.toFixed(1) : "?";
  const center = demo?.sample ? (demo.sample.center_mi * 1.609).toFixed(1) : "?";

  const steps = useMemo(
    () => [
      { t: "Two utilities, planned separately", b: "Dominion Energy SC and Georgia Power publish their construction plans in separate filings. Both are on one map here.",
        run: () => { dispatch({ type: "resetFilters" }); dispatch({ type: "filters", patch: { view: "projects" } }); dispatch({ type: "drawer", drawer: null }); flyTo({ kind: "region", name: "southeast" }); } },
      { t: "Filter to coordination opportunities", b: "One filter switches from all projects to cross-utility pairs within 40 km, ranked by a 100-point score.",
        run: () => dispatch({ type: "filters", patch: { view: "opportunities" } }) },
      { t: "Jasper–Okatie and McIntosh–Purrysburg", b: `The closest points are ${km} km apart (an estimate from the named endpoints). Sperry's center-point estimate is ${center} km.`,
        run: () => { if (demo) dispatch({ type: "select", id: demo.id }); } },
      { t: "The timing lines up", b: "Construction overlaps, and planned completions are 152 days apart. Both projects are 230 kV.",
        run: () => document.querySelector('[aria-label="Selected pair timeline"]')?.scrollIntoView({ behavior: "smooth", block: "center" }) },
      { t: "Why it ranks where it does", b: "Geography, timing, compatibility and data confidence each add visible points. No hidden weighting, no AI in the math.",
        run: () => document.querySelector('[aria-label="Why this opportunity ranks here"]')?.scrollIntoView({ behavior: "smooth", block: "center" }) },
      { t: "Check the source", b: "Every field links to its filing page, with confidence and limitations stated.",
        run: () => dispatch({ type: "drawer", drawer: "source" }) },
      { t: "Next step: a joint review", b: "The coordination brief cites the filings, separates facts from suggestions, and asks a person to review it. Recommended action: confirm geometry and schedule a joint planning review.",
        run: () => dispatch({ type: "drawer", drawer: null }) },
    ],
    [dispatch, demo, km, center],
  );

  useEffect(() => {
    steps[step]?.run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const s = steps[step];
  if (!s) return null;
  const last = step === steps.length - 1;
  const end = () => dispatch({ type: "tour", step: null });
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4">
      <div key={step} className="panel anim-rise pointer-events-auto w-full max-w-[520px] p-4" role="dialog" aria-label="Demo" aria-live="polite">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="num text-[11.5px] text-fg-3">Step {step + 1} of {steps.length}</div>
            <h2 className="text-[16px] font-semibold tracking-[-0.02em]">{s.t}</h2>
          </div>
          <button className="btn -mr-1 h-8 px-2" onClick={end} aria-label="End demo"><X size={16} /></button>
        </div>
        <p className="mt-1 text-[13.5px] leading-relaxed text-fg-2">{s.b}</p>
        <div className="mt-3 flex justify-end gap-2">
          <button className="btn" disabled={step === 0} onClick={() => dispatch({ type: "tour", step: step - 1 })}><ArrowLeft size={15} /> Back</button>
          {last ? (
            <a className="btn btn-primary" href={demo ? `#/brief/${encodeURIComponent(demo.id)}` : undefined} target="_blank" rel="noopener" onClick={end}>Open the brief</a>
          ) : (
            <button className="btn btn-primary" onClick={() => dispatch({ type: "tour", step: step + 1 })} autoFocus>Next <ArrowRight size={15} /></button>
          )}
        </div>
      </div>
    </div>
  );
}
