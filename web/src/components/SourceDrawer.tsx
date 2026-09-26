import { ExternalLink } from "lucide-react";
import { CONF_LABEL, UTILITY_COLOR, UTILITY_NAME, kmLabel, monthYear, prettyName, workLabel } from "../data/format";
import type { Project } from "../data/types";
import { useStore } from "../state/store";
import Drawer from "./Drawer";

const DOC = { DESC: "SCRTP · DESC Planned Transmission Projects $2M and above (2024–2028)", GPC: "Georgia Power 2025 IRP Technical Appendix Vol. 3 (public disclosure)" };
const pct = (v: number) => `${Math.round(v * 100)}%`;

export default function SourceDrawer() {
  const { state, dispatch, data } = useStore();
  const close = () => dispatch({ type: "drawer", drawer: null });
  const pair = state.filters.view === "opportunities" && state.selected ? data.pairById.get(state.selected) : null;
  const projects = pair ? [data.byId.get(pair.a)!, data.byId.get(pair.b)!] : state.selectedProject ? [data.byId.get(state.selectedProject)!] : [];
  return (
    <Drawer title="Source and confidence" sub="Every field below comes from a public filing page or a stated calculation" onClose={close}>
      {pair && (
        <section className="mb-5 rounded-xl bg-ink-2 p-3.5 text-[13px]">
          <h3 className="font-semibold">How the distance was measured</h3>
          <p className="mt-1 text-fg-2">
            Closest points between the two projects: <span className="num text-fg">{kmLabel(pair)}</span> ({pair.mi} mi), measured in UTM zone 17N.{" "}
            {pair.measurement === "estimate" ? "At least one project is drawn straight between its endpoints, so this is an estimate until route geometry is verified." : "Both projects use mapped routes."}
          </p>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
            {pair.connector.map((c, i) => (
              <div key={i} className="rounded-lg bg-ink-1 px-2.5 py-1.5">
                <dt className="text-fg-3">Measured point on {i === 0 ? "Dominion SC" : "Georgia"} project</dt>
                <dd className="num text-fg">{c[1].toFixed(5)}, {c[0].toFixed(5)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-[12px] text-fg-3">Center-point estimate (the locations guide's method): <span className="num">{pair.center_mi} mi ({(pair.center_mi * 1.609).toFixed(1)} km)</span>.{pair.sample && <> Sperry's sample ({pair.sample.overlap_id}) supplies <span className="num">{pair.sample.center_mi} mi</span>.</>}</p>
        </section>
      )}
      {projects.length === 0 && <p className="text-fg-2">Select an opportunity or a project to see its sources.</p>}
      <div className="space-y-6">{projects.map((p) => <Record key={p.id} p={p} />)}</div>
    </Drawer>
  );
}

function Record({ p }: { p: Project }) {
  const rows: [string, React.ReactNode][] = [
    ["Project ID", <span className="num">{p.source_id}</span>],
    ["Utility", `${UTILITY_NAME[p.utility]}${p.sponsor !== p.utility ? ` (sponsor ${p.sponsor})` : ""}`],
    ["State", p.state],
    ["Project type", workLabel(p.work_type)],
    ["Voltage", p.kv.length ? `${p.kv.join(" / ")} kV` : "Not stated"],
    ["Status", p.status || "Not stated"],
    ["Planned start", <><span className="num">{monthYear(p.window[0])}</span> <span className="text-fg-3">· {p.utility === "DESC" ? "first year with budgeted spend" : "filed start date"}</span></>],
    ["Planned completion", <span className="num">{monthYear(p.in_service)}</span>],
    ["Named endpoints", p.endpoints.map((e) => `${prettyName(e.name)} (${CONF_LABEL[e.conf].toLowerCase()})`).join("; ") || "—"],
    ["Geometry method", p.geometry_method],
    ["Location confidence", pct(p.geometry_confidence)],
    ["Schedule confidence", pct(p.schedule_confidence)],
    ["Source document", DOC[p.source_doc]],
    ["Source page", <a className="inline-flex items-center gap-1 text-fg underline" href={`/sources/${p.source_doc === "DESC" ? "desc" : "gpc"}.pdf#page=${p.source_page}`} target="_blank" rel="noopener">Page {p.source_page} <ExternalLink size={11} /></a>],
    ["Document date", <span className="num">{p.source_publication_date ?? "—"}</span>],
  ];
  const asFiled: [string, string | null | undefined][] = [
    ["In-service date as written", p.in_service_raw],
    ["Change since last plan", p.change_note],
    ["Budget by year as written", p.spend_raw ? Object.entries(p.spend_raw).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ") : null],
    ["Scope note", p.scope_note],
  ];
  return (
    <article>
      <div className="text-[12px] font-semibold" style={{ color: UTILITY_COLOR[p.utility] }}>{UTILITY_NAME[p.utility]}</div>
      <h3 className="text-[15px] font-semibold leading-snug">{prettyName(p.name)}</h3>
      <dl className="mt-2 divide-y divide-line/70 text-[12.5px]">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[150px_1fr] gap-3 py-1.5">
            <dt className="text-fg-3">{k}</dt>
            <dd className="text-fg-2">{v}</dd>
          </div>
        ))}
      </dl>
      <h4 className="mt-3 text-[12.5px] font-semibold">Original values, as filed</h4>
      <dl className="mt-1 text-[12px]">
        {asFiled.filter(([, v]) => v).map(([k, v]) => (
          <div key={k} className="grid grid-cols-[150px_1fr] gap-3 py-1"><dt className="text-fg-3">{k}</dt><dd className="num break-words text-fg-2">{v}</dd></div>
        ))}
      </dl>
      {p.source_text && (
        <>
          <h4 className="mt-3 text-[12.5px] font-semibold">Excerpt from page {p.source_page}</h4>
          <blockquote className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg bg-ink-2 px-3 py-2 text-[12px] leading-relaxed text-fg-2">{p.source_text}</blockquote>
        </>
      )}
      {p.limitations.length > 0 && (
        <>
          <h4 className="mt-3 text-[12.5px] font-semibold">Limitations</h4>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12px] text-t2 marker:text-t2">{p.limitations.map((l) => <li key={l}><span className="text-fg-2">{l}</span></li>)}</ul>
        </>
      )}
    </article>
  );
}
