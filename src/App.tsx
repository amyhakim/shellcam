import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import type { Opportunity, Project, Utility } from './types'

type UtilityFilter = Utility | 'all'
type YearFilter = 'all' | '2025' | '2026' | '2027+'
type ProjectRow = { project_id: string; utility: string; project_name: string; lat_center: number | string | null; lon_center: number | string | null; in_service_date: string | null }
type OpportunityRow = { overlap_id: string; project_a_id: string; project_b_id: string; distance_miles: number | string; time_gap_days: number }

const compactName = (name: string) => name.replace(/: (Construct|Rebuild)$/i, '').replace(/^SAV: /i, '').replace(/\s+/g, ' ')

function normalizeProjects(rows: ProjectRow[]): Project[] {
  const located = rows.filter((row) => row.lat_center != null && row.lon_center != null)
  const lats = located.map((row) => Number(row.lat_center)); const lons = located.map((row) => Number(row.lon_center))
  const minLat = Math.min(...lats); const maxLat = Math.max(...lats); const minLon = Math.min(...lons); const maxLon = Math.max(...lons)
  return located.map((row) => {
    const latitude = Number(row.lat_center); const longitude = Number(row.lon_center); const inServiceDate = row.in_service_date ?? ''
    return { id: row.project_id, utility: row.utility.toLowerCase().includes('dominion') ? 'DESC' : 'GPC', name: compactName(row.project_name), fullName: row.project_name, latitude, longitude, x: 10 + ((longitude - minLon) / Math.max(maxLon - minLon, 1)) * 80, y: 10 + ((maxLat - latitude) / Math.max(maxLat - minLat, 1)) * 80, year: inServiceDate ? new Date(inServiceDate).getUTCFullYear() : 0, inServiceDate }
  })
}

const normalizeOpportunities = (rows: OpportunityRow[]): Opportunity[] => rows.map((row) => {
  const distanceMiles = Number(row.distance_miles); const highPriority = distanceMiles <= 8 && row.time_gap_days <= 730
  return { id: row.overlap_id, a: row.project_a_id, b: row.project_b_id, distanceMiles, distanceKm: Number((distanceMiles * 1.609344).toFixed(1)), dateGapDays: row.time_gap_days, priority: highPriority ? 'High' : 'Medium', reason: highPriority ? 'Close geography and similar in-service timing' : 'Within the supplied 25-mile coordination range' }
})

function MapView({ projects, visibleProjects, visibleOpportunities, selected, onSelect }: { projects: Project[]; visibleProjects: Project[]; visibleOpportunities: Opportunity[]; selected: Opportunity | null; onSelect: (opportunity: Opportunity) => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const dataLayerRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = L.map(containerRef.current, { zoomControl: true, minZoom: 5 })
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(map)
    dataLayerRef.current = L.layerGroup().addTo(map)
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null; dataLayerRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current; const layer = dataLayerRef.current
    if (!map || !layer) return
    layer.clearLayers()
    const projectById = (id: string) => projects.find((project) => project.id === id)
    const selectedIds = selected ? new Set([selected.a, selected.b]) : null

    visibleOpportunities.forEach((opportunity) => {
      const a = projectById(opportunity.a); const b = projectById(opportunity.b)
      if (!a || !b) return
      const isSelected = selected?.id === opportunity.id
      const line = L.polyline([[a.latitude, a.longitude], [b.latitude, b.longitude]], { color: isSelected ? '#c87816' : '#d8922b', weight: isSelected ? 5 : 2, opacity: selected && !isSelected ? 0.2 : 0.75, dashArray: '8 7' }).addTo(layer)
      line.bindTooltip(`${opportunity.id}: ${opportunity.distanceKm} km center-point estimate`)
      line.on('click', () => onSelect(opportunity))
    })

    visibleProjects.forEach((project) => {
      const match = visibleOpportunities.find((item) => item.a === project.id || item.b === project.id)
      const isSelected = selectedIds?.has(project.id) ?? false
      const marker = L.circleMarker([project.latitude, project.longitude], { radius: isSelected ? 10 : 7, color: '#ffffff', weight: 3, fillColor: project.utility === 'DESC' ? '#087f69' : '#4776d0', fillOpacity: selectedIds && !isSelected ? 0.25 : 1, opacity: selectedIds && !isSelected ? 0.35 : 1 }).addTo(layer)
      const popup = document.createElement('div'); const title = document.createElement('strong'); title.textContent = project.fullName; popup.append(title, document.createElement('br'), document.createTextNode(`${project.utility} · ${project.inServiceDate || 'Date unavailable'} · approximate center point`))
      marker.bindPopup(popup); marker.bindTooltip(project.name, { direction: 'top', offset: [0, -8] })
      marker.on('click', () => { if (match) onSelect(match) })
    })

    const focusProjects = selected ? [projectById(selected.a), projectById(selected.b)].filter(Boolean) as Project[] : visibleProjects
    if (focusProjects.length) map.fitBounds(L.latLngBounds(focusProjects.map((project) => [project.latitude, project.longitude])), { padding: [42, 42], maxZoom: selected ? 11 : 8 })
  }, [projects, visibleProjects, visibleOpportunities, selected, onSelect])

  return <div ref={containerRef} className="map real-map" aria-label="Interactive map of South Carolina and Georgia utility projects" />
}

function App() {
  const [projects, setProjects] = useState<Project[]>([]); const [opportunities, setOpportunities] = useState<Opportunity[]>([])
  const [loadError, setLoadError] = useState(''); const [loading, setLoading] = useState(true)
  const [utility, setUtility] = useState<UtilityFilter>('all'); const [year, setYear] = useState<YearFilter>('all'); const [distance, setDistance] = useState(40)
  const [selected, setSelected] = useState<Opportunity | null>(null); const [showToast, setShowToast] = useState(false)

  useEffect(() => { Promise.all([fetch('/api/projects').then((response) => { if (!response.ok) throw new Error('Projects unavailable'); return response.json() as Promise<ProjectRow[]> }), fetch('/api/opportunities').then((response) => { if (!response.ok) throw new Error('Opportunities unavailable'); return response.json() as Promise<OpportunityRow[]> })]).then(([projectRows, opportunityRows]) => { setProjects(normalizeProjects(projectRows)); setOpportunities(normalizeOpportunities(opportunityRows)) }).catch((error: Error) => setLoadError(error.message)).finally(() => setLoading(false)) }, [])

  const projectById = (id: string) => projects.find((project) => project.id === id)
  const visibleProjects = useMemo(() => projects.filter((project) => (utility === 'all' || project.utility === utility) && (year === 'all' || (year === '2027+' ? project.year >= 2027 : project.year === Number(year)))), [projects, utility, year])
  const projectIds = new Set(visibleProjects.map((project) => project.id)); const visibleOpportunities = opportunities.filter((item) => item.distanceKm <= distance && projectIds.has(item.a) && projectIds.has(item.b))
  const active = selected ?? visibleOpportunities[0] ?? opportunities[0]; const activeA = active ? projectById(active.a) : undefined; const activeB = active ? projectById(active.b) : undefined
  const reset = () => { setUtility('all'); setYear('all'); setDistance(40) }; const generateBrief = () => { setShowToast(true); window.setTimeout(() => setShowToast(false), 2600) }

  if (loading) return <main><p className="loading-state">Loading verified project data…</p></main>
  if (loadError) return <main><section className="error-state"><h1>Data connection unavailable</h1><p>{loadError}. Check the Railway deployment logs and DATABASE_URL.</p></section></main>

  return <><header className="topbar"><a className="brand" href="#"><span className="brand-mark"><i/><i/><i/></span><span>Gridlock <b>Intelligence</b></span></a><div className="topbar-actions"><span className="data-status"><span/> Live Tiger Data</span><button className="icon-button">?</button><button className="avatar">AH</button></div></header><main>
    <section className="intro"><div><p className="eyebrow">REGIONAL PLANNING WORKSPACE</p><h1>Coordination opportunities</h1><p className="lede">Verified utility projects and supplied cross-utility proximity matches.</p></div><button className="secondary-button" onClick={generateBrief}><span>✦</span> Generate briefing</button></section>
    <section className="filterbar"><label>Utility<select value={utility} onChange={(event) => setUtility(event.target.value as UtilityFilter)}><option value="all">All utilities</option><option value="DESC">Dominion Energy SC</option><option value="GPC">Georgia Power</option></select></label><label>In-service window<select value={year} onChange={(event) => setYear(event.target.value as YearFilter)}><option value="all">All dates</option><option value="2025">2025</option><option value="2026">2026</option><option value="2027+">2027 and later</option></select></label><label>Coordination range<select value={distance} onChange={(event) => setDistance(Number(event.target.value))}><option value="40">Within 40 km</option><option value="16">Within 16 km</option><option value="8">Within 8 km</option></select></label><button className="text-button" onClick={reset}>Reset filters</button></section>
    <section className="metrics"><article><p>Projects analyzed</p><strong>{visibleProjects.length}</strong><small>Loaded from Tiger Data</small></article><article><p>Opportunities found</p><strong>{visibleOpportunities.length}</strong><small><b>{visibleOpportunities.filter((item) => item.priority === 'High').length}</b> high priority</small></article><article><p>Closest overlap</p><strong>{visibleOpportunities.length ? Math.min(...visibleOpportunities.map((item) => item.distanceKm)) : '—'} <em>km</em></strong><small>Supplied center-point estimate</small></article><article className="accent-metric"><p>Source status</p><strong>{projects.length ? 'Live' : '—'}</strong><small>{projects.length} project records · {opportunities.length} matches</small></article></section>
    <section className="dashboard-grid"><article className="panel map-panel"><div className="panel-heading"><div><h2>Projects by location</h2><p>Pan, zoom, or select a project pair</p></div><div className="legend"><span><i className="dot desc"/>Dominion</span><span><i className="dot gpc"/>Georgia Power</span><span><i className="line-key"/>Approximate connection</span></div></div><MapView projects={projects} visibleProjects={visibleProjects} visibleOpportunities={visibleOpportunities} selected={selected} onSelect={setSelected}/></article>
      <article className="panel opportunities-panel"><div className="panel-heading list-heading"><div><h2>Supplied opportunities</h2><p>Ordered by center-point distance</p></div><button className="sort-button">Nearest ↓</button></div><div className="opportunity-list">{visibleOpportunities.map((item, index) => { const a = projectById(item.a); const b = projectById(item.b); if (!a || !b) return null; return <button key={item.id} className={`opportunity ${selected?.id === item.id ? 'selected' : ''}`} onClick={() => setSelected(item)}><div className="opp-top"><span className="rank">#{index + 1} · {item.id}</span><span className={`badge ${item.priority.toLowerCase()}`}>{item.priority} priority</span></div><h3>{a.name} ↔ {b.name}</h3><p>Dominion Energy SC + Georgia Power</p><div className="opp-metrics"><span><b>{item.distanceKm} km</b> apart</span><span><b>{item.dateGapDays} days</b> date gap</span></div><div className="reason">✓ {item.reason}</div></button> })}</div></article>
      {active && activeA && activeB && <article className="panel timeline-panel"><div className="panel-heading"><div><h2>In-service timing</h2><p>Selected opportunity · supplied project dates</p></div><span className="confidence">Center-point estimate</span></div><div className="timeline"><div className="years"><span>2024</span><span>2025</span><span>2026</span><span>2027</span><span>2028</span></div><div className="timeline-row"><label><i className="dot desc"/><span>{activeA.utility === 'DESC' ? activeA.name : activeB.name}</span></label><div className="track"><b className="bar desc-bar" style={{left:'9%',width:'8%'}}/></div></div><div className="timeline-row"><label><i className="dot gpc"/><span>{activeA.utility === 'GPC' ? activeA.name : activeB.name}</span></label><div className="track"><b className="bar gpc-bar" style={{left:'25%',width:'8%'}}/></div></div><div className="overlap-caption"><span/><b>{active.dateGapDays} days between supplied in-service dates</b><small>Review construction schedules before treating this as concurrent work</small></div></div></article>}</section>
  </main>{active && activeA && activeB && <aside className={`drawer ${selected ? 'open' : ''}`} aria-hidden={!selected}><button className="drawer-close" onClick={() => setSelected(null)}>×</button><p className="eyebrow">COORDINATION BRIEF</p><div className="priority-pill">{active.priority} priority</div><h2>{activeA.name} ↔ {activeB.name}</h2><p className="drawer-summary">This supplied project pair falls within the 25-mile coordination screen. Confirm route geometry and construction schedules before acting.</p><div className="drawer-stats"><div><strong>{active.distanceMiles} mi</strong><small>Center-point distance</small></div><div><strong>{active.distanceKm} km</strong><small>Converted distance</small></div><div><strong>{active.dateGapDays} days</strong><small>In-service date gap</small></div></div><section><h3>Source records</h3><ul><li>{activeA.fullName} · {activeA.inServiceDate || 'Date unavailable'}</li><li>{activeB.fullName} · {activeB.inServiceDate || 'Date unavailable'}</li></ul></section><section className="ai-note"><span>✦</span><div><h3>Planning note</h3><p>This is a decision aid, not a final engineering conclusion. Confirm route geometry, outages, procurement dates, and CEII constraints with both utilities.</p></div></section><section><h3>Recommended next step</h3><p>Validate the two project records against their source pages, then schedule a joint constructability review.</p></section></aside>}<div className={`scrim ${selected ? 'open' : ''}`} onClick={() => setSelected(null)}/><div className={`toast ${showToast ? 'open' : ''}`}>Briefing prepared from {visibleOpportunities.length} supplied opportunities.</div></>
}

export default App
