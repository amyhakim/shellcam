import { CornerDownLeft, Search, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { UTILITY_COLOR, UTILITY_NAME, kmLabel, shortName } from "../data/format";
import { parseRequest } from "../data/nlq";
import { useStore } from "../state/store";
import { flyTo } from "./camera";

interface Item {
  id: string;
  group: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  run: () => void;
  text: string;
}

/** Search + plain-language requests. A request only ever sets visible filters. */
export default function CommandPalette() {
  const { dispatch, data } = useStore();
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const close = () => dispatch({ type: "palette", on: false });

  const items = useMemo<Item[]>(() => {
    const t = q.trim().toLowerCase();
    const req = t ? parseRequest(t) : null;
    const applies: Item[] = req && req.notes.length
      ? [{
          id: "apply", group: "Apply as filters", text: t,
          label: <span className="inline-flex items-center gap-2"><Wand2 size={15} className="text-t3" /> Show: {req.notes.join(" · ")}</span>,
          hint: <span className="text-fg-3">sets visible filters</span>,
          run: () => {
            dispatch({ type: "resetFilters" });
            dispatch({ type: "filters", patch: req.filters });
            if (req.region || req.timing) dispatch({ type: "advanced", patch: { ...(req.region ? { region: req.region } : {}), ...(req.timing ? { timing: req.timing } : {}) } });
            if (req.region) flyTo({ kind: "region", name: req.region });
            close();
          },
        }]
      : [];
    const actions: Item[] = [
      { id: "sav", group: "Go to", label: "Savannah", text: "savannah jasper okatie mcintosh", run: () => { close(); flyTo({ kind: "region", name: "Savannah" }); } },
      { id: "aug", group: "Go to", label: "Augusta", text: "augusta thurmond urquhart", run: () => { close(); flyTo({ kind: "region", name: "Augusta" }); } },
      { id: "method", group: "Go to", label: "How this was calculated", text: "method methodology data quality sources", run: () => dispatch({ type: "drawer", drawer: "method" }) },
      { id: "demo", group: "Go to", label: "Start the demo", text: "demo tour walkthrough", run: () => dispatch({ type: "tour", step: 0 }) },
    ];
    const pairs: Item[] = data.pairs.filter((p) => p.tier).map((p) => {
      const a = data.byId.get(p.a)!, b = data.byId.get(p.b)!;
      return {
        id: p.id, group: "Opportunities", text: `${a.name} ${b.name} ${a.source_id} ${b.source_id}`.toLowerCase(),
        label: <span><span className="text-desc">{shortName(a)}</span> <span className="text-fg-3">↔</span> <span style={{ color: UTILITY_COLOR[b.utility] }}>{shortName(b)}</span></span>,
        hint: <span className="num text-fg-3">{kmLabel(p)} · {p.score.toFixed(0)} pts</span>,
        run: () => { dispatch({ type: "filters", patch: { view: "opportunities", ...(p.b_utility !== "GPC" ? { utility: "allGA" as const } : {}) } }); dispatch({ type: "select", id: p.id }); },
      };
    });
    const projects: Item[] = data.projects.filter((p) => p.located).map((p) => ({
      id: p.id, group: "Projects", text: `${p.name} ${p.source_id}`.toLowerCase(),
      label: <span style={{ color: UTILITY_COLOR[p.utility] }}>{shortName(p)}</span>,
      hint: <span className="text-fg-3">{UTILITY_NAME[p.utility]} · {p.source_id}</span>,
      run: () => { dispatch({ type: "filters", patch: { view: "projects" } }); dispatch({ type: "selectProject", id: p.id }); flyTo({ kind: "project", id: p.id }); },
    }));
    if (!t) return [...actions, ...pairs.slice(0, 5)];
    const words = t.split(/\s+/);
    const match = (x: Item) => words.every((w) => x.text.includes(w));
    return [...applies, ...actions.filter(match).slice(0, 3), ...pairs.filter(match).slice(0, 6), ...projects.filter(match).slice(0, 6)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, data]);

  const sel = Math.min(i, Math.max(0, items.length - 1));
  let lastGroup = "";
  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-start justify-center bg-ink-0/60 px-4 pt-[12vh]" onMouseDown={close}>
      <div className="panel anim-rise w-full max-w-[640px] overflow-hidden" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Search">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={17} className="text-fg-3" />
          <input
            autoFocus
            value={q}
            onChange={(e) => { setQ(e.target.value); setI(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setI((x) => Math.min(x + 1, items.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setI((x) => Math.max(x - 1, 0)); }
              if (e.key === "Enter") items[sel]?.run();
            }}
            placeholder='Search, or type a request like "230 kV in Savannah within 8 km"'
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-fg-3"
            aria-label="Search or request"
          />
          <span className="kbd">Esc</span>
        </div>
        <ul className="max-h-[52vh] overflow-y-auto p-1.5" role="listbox">
          {items.length === 0 && <li className="px-3 py-8 text-center text-fg-2">No matches. Try "Thurmond", "McIntosh", or "overlapping builds within 8 km".</li>}
          {items.map((it, k) => {
            const head = it.group !== lastGroup ? (lastGroup = it.group) : null;
            return (
              <li key={`${it.group}-${it.id}`}>
                {head && <div className="px-3 pb-1 pt-2.5 text-[11.5px] font-medium text-fg-3">{head}</div>}
                <button role="option" aria-selected={k === sel} onMouseEnter={() => setI(k)} onClick={it.run}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] ${k === sel ? "bg-ink-3" : ""}`}>
                  <span className="min-w-0 truncate">{it.label}</span>
                  <span className="flex shrink-0 items-center gap-2 text-[12px]">{it.hint}{k === sel && <CornerDownLeft size={14} className="text-fg-3" />}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
