import { useMemo, useState } from 'react'
import { opportunities, projects } from './data'
import type { Opportunity, ProjectStatus, Utility } from './types'

type UtilityFilter = Utility | 'all'
type YearFilter = 'all' | '2025' | '2026' | '2027+'
type StatusFilter = ProjectStatus | 'all'

const projectById = (id: string) => projects.find((project) => project.id === id)!

function MapView({ visibleProjects, visibleOpportunities, onSelect }: {
  visibleProjects: typeof projects
  visibleOpportunities: Opportunity[]
  onSelect: (opportunity: Opportunity) => void
}) {
  return (
    <div className="map" aria-label="Map of South Carolina and Georgia utility projects">
      <svg className="map-base" viewBox="0 0 760 470" preserveAspectRatio="none" aria-hidden="true">
        <defs><pattern id="grid" width="34" height="34" patternUnits="userSpaceOnUse"><path d="M34 0H0V34" fill="none" stroke="#d8e1df" strokeWidth=".7" /></pattern></defs>
        <rect width="760" height="470" fill="url(#grid)" />
        <path className="state" d="M278 36 L662 90 706 211 620 342 482 313 393 227 263 180Z" />
        <path className="state" d="M115 83 L278 36 263 180 393 227 482 313 411 438 170 410 108 290Z" />
        <path className="river" d="M278 36C255 128 278 175 393 227S464 297 482 313 429 397 411 438" />
        <text x="505" y="165">SOUTH CAROLINA</text><text x="210" y="300">GEORGIA</text>
        <path className="road" d="M101 365C265 315 382 256 681 210" /><path className="road" d="M224 73C313 189 409 253 611 363" />
      </svg>
      <div>{visibleOpportunities.map((opportunity) => {
        const a = projectById(opportunity.a); const b = projectById(opportunity.b)
        const dx = b.x - a.x; const dy = b.y - a.y
        return <button key={`${opportunity.a}-${opportunity.b}`} className="connection" data-distance={`${opportunity.distance} km`} aria-label={`Open ${a.name} and ${b.name}`} onClick={() => onSelect(opportunity)} style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${Math.sqrt(dx * dx + dy * dy)}%`, transform: `rotate(${Math.atan2(dy, dx) * 180 / Math.PI}deg)` }} />
      })}</div>
      <div>{visibleProjects.map((project) => {
        const match = visibleOpportunities.find((item) => item.a === project.id || item.b === project.id)
        return <button key={project.id} className={`marker ${project.utility}`} style={{ left: `${project.x}%`, top: `${project.y}%` }} title={project.fullName} onClick={() => match && onSelect(match)}><span>{project.name}</span></button>
      })}</div>
      <div className="map-controls"><button aria-label="Zoom in">+</button><button aria-label="Zoom out">−</button></div>
      <div className="scale">20 km</div>
    </div>
  )
}

function App() {
  const [utility, setUtility] = useState<UtilityFilter>('all')
  const [year, setYear] = useState<YearFilter>('all')
  const [distance, setDistance] = useState(40)
  const [status, setStatus] = useState<StatusFilter>('all')
  const [selected, setSelected] = useState<Opportunity | null>(null)
  const [showToast, setShowToast] = useState(false)

  const visibleProjects = useMemo(() => projects.filter((project) =>
    (utility === 'all' || project.utility === utility) &&
    (year === 'all' || (year === '2027+' ? project.year >= 2027 : project.year === Number(year))) &&
    (status === 'all' || project.status === status)
  ), [utility, year, status])
  const projectIds = new Set(visibleProjects.map((project) => project.id))
  const visibleOpportunities = opportunities.filter((item) => item.distance <= distance && projectIds.has(item.a) && projectIds.has(item.b))
  const active = selected ?? opportunities[0]
  const activeA = projectById(active.a); const activeB = projectById(active.b)

  const reset = () => { setUtility('all'); setYear('all'); setDistance(40); setStatus('all') }
  const generateBrief = () => { setShowToast(true); window.setTimeout(() => setShowToast(false), 2600) }

  return <>
    <header className="topbar">
      <a className="brand" href="#"><span className="brand-mark"><i/><i/><i/></span><span>Gridlock <b>Intelligence</b></span></a>
      <div className="topbar-actions"><span className="data-status"><span/> Data refreshed today</span><button className="icon-button">?</button><button className="avatar">AH</button></div>
    </header>
    <main>
      <section className="intro"><div><p className="eyebrow">REGIONAL PLANNING WORKSPACE</p><h1>Coordination opportunities</h1><p className="lede">See where planned utility projects are close enough—and timely enough—to work better together.</p></div><button className="secondary-button" onClick={generateBrief}><span>✦</span> Generate briefing</button></section>
      <section className="filterbar">
        <label>Utility<select value={utility} onChange={(e) => setUtility(e.target.value as UtilityFilter)}><option value="all">All utilities</option><option value="DESC">Dominion Energy SC</option><option value="GPC">Georgia Power</option></select></label>
        <label>In-service window<select value={year} onChange={(e) => setYear(e.target.value as YearFilter)}><option value="all">2025–2030</option><option value="2025">2025</option><option value="2026">2026</option><option value="2027+">2027 and later</option></select></label>
        <label>Coordination range<select value={distance} onChange={(e) => setDistance(Number(e.target.value))}><option value="40">Within 40 km</option><option value="8">Within 8 km</option><option value="1.6">Within 1.6 km</option></select></label>
        <label>Status<select value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}><option value="all">All statuses</option><option value="In progress">In progress</option><option value="Planned">Planned</option></select></label>
        <button className="text-button" onClick={reset}>Reset filters</button>
      </section>
      <section className="metrics">
        <article><p>Projects analyzed</p><strong>{visibleProjects.length}</strong><small>Across 2 utilities</small></article>
        <article><p>Opportunities found</p><strong>{visibleOpportunities.length}</strong><small><b>{visibleOpportunities.filter((item) => item.priority === 'High').length}</b> high priority</small></article>
        <article><p>Closest overlap</p><strong>{visibleOpportunities.length ? Math.min(...visibleOpportunities.map((item) => item.distance)) : '—'} <em>km</em></strong><small>Closest qualifying pair</small></article>
        <article className="accent-metric"><p>Potential shared value</p><strong>$1.2–2.1M</strong><small>Planning estimate · 4 matches</small></article>
      </section>
      <section className="dashboard-grid">
        <article className="panel map-panel"><div className="panel-heading"><div><h2>Projects by location</h2><p>Click a project or connection to inspect it</p></div><div className="legend"><span><i className="dot desc"/>Dominion</span><span><i className="dot gpc"/>Georgia Power</span><span><i className="line-key"/>Opportunity</span></div></div><MapView visibleProjects={visibleProjects} visibleOpportunities={visibleOpportunities} onSelect={setSelected}/></article>
        <article className="panel opportunities-panel"><div className="panel-heading list-heading"><div><h2>Top opportunities</h2><p>Ranked by proximity, timing, and project fit</p></div><button className="sort-button">Ranked ↓</button></div><div className="opportunity-list">{visibleOpportunities.map((item, index) => { const a = projectById(item.a); const b = projectById(item.b); return <button key={`${item.a}-${item.b}`} className={`opportunity ${selected === item ? 'selected' : ''}`} onClick={() => setSelected(item)}><div className="opp-top"><span className="rank">#{index + 1} · Score {item.score}</span><span className={`badge ${item.priority.toLowerCase()}`}>{item.priority} priority</span></div><h3>{a.name} ↔ {b.name}</h3><p>Dominion Energy SC + Georgia Power</p><div className="opp-metrics"><span><b>{item.distance} km</b> apart</span><span><b>{item.months} mo.</b> overlap</span><span><b>{item.value}</b> value</span></div><div className="reason">✓ {item.reason}</div></button>})}</div></article>
        <article className="panel timeline-panel"><div className="panel-heading"><div><h2>Construction timeline</h2><p>Selected opportunity · overlapping work windows</p></div><span className="confidence">High confidence</span></div><div className="timeline"><div className="years"><span>2024</span><span>2025</span><span>2026</span><span>2027</span><span>2028</span></div><div className="timeline-row"><label><i className="dot desc"/><span>{activeA.utility === 'DESC' ? activeA.name : activeB.name}</span></label><div className="track"><b className="bar desc-bar" style={{left:'9%',width:'38%'}}/></div></div><div className="timeline-row"><label><i className="dot gpc"/><span>{activeA.utility === 'GPC' ? activeA.name : activeB.name}</span></label><div className="track"><b className="bar gpc-bar" style={{left:'25%',width:'45%'}}/></div></div><div className="overlap-caption"><span/><b>{active.months} months of concurrent construction</b><small>Potential to coordinate crews, staging, and equipment</small></div></div></article>
      </section>
    </main>
    <aside className={`drawer ${selected ? 'open' : ''}`} aria-hidden={!selected}><button className="drawer-close" onClick={() => setSelected(null)}>×</button><p className="eyebrow">COORDINATION BRIEF</p><div className="priority-pill">{active.priority} priority</div><h2>{activeA.name} ↔ {activeB.name}</h2><p className="drawer-summary">These projects are close enough to share regional construction resources while their planned work windows overlap.</p><div className="drawer-stats"><div><strong>{active.distance} km</strong><small>Closest distance</small></div><div><strong>{active.months} mo.</strong><small>Timeline overlap</small></div><div><strong>230 kV</strong><small>Shared voltage</small></div></div><section><h3>Why this matters</h3><ul><li>Shared crews and heavy equipment are operationally realistic.</li><li>Common voltage class increases contractor and material compatibility.</li><li>Cross-river staging could reduce duplicate mobilization.</li></ul></section><section className="ai-note"><span>✦</span><div><h3>AI planning note</h3><p>This is a decision aid, not a final engineering conclusion. Confirm route geometry, outages, procurement dates, and CEII constraints with both utilities.</p></div></section><section><h3>Recommended next step</h3><p>Schedule a joint constructability review and compare staging-yard, crane, and outage requirements.</p></section><button className="primary-button">Export one-page brief</button><button className="secondary-button wide">View source evidence</button></aside>
    <div className={`scrim ${selected ? 'open' : ''}`} onClick={() => setSelected(null)}/><div className={`toast ${showToast ? 'open' : ''}`}>Briefing generated from 4 ranked opportunities.</div>
  </>
}

export default App
