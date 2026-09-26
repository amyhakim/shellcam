const projects = [
  {id:'DESC_3',utility:'DESC',name:'Jasper–Okatie #2',full:'Jasper–Okatie 230 kV Line No. 2',x:64,y:75,year:2025,status:'In progress'},
  {id:'GPC_2',utility:'GPC',name:'McIntosh–Purrysburg',full:'McIntosh–Purrysburg 230 kV Reactors',x:60,y:72,year:2026,status:'In progress'},
  {id:'DESC_4',utility:'DESC',name:'Urquhart upgrade',full:'Urquhart 230 kV Substation Upgrade',x:52,y:42,year:2026,status:'Planned'},
  {id:'GPC_4',utility:'GPC',name:'Thomson–Vogtle',full:'Thomson–Vogtle Transmission Line',x:45,y:38,year:2027,status:'Planned'},
  {id:'DESC_5',utility:'DESC',name:'Bluffton rebuild',full:'Bluffton Network Rebuild',x:69,y:69,year:2027,status:'Planned'},
  {id:'GPC_5',utility:'GPC',name:'Savannah East',full:'Savannah East Capacity Project',x:62,y:79,year:2027,status:'Planned'},
  {id:'DESC_7',utility:'DESC',name:'Summerville 115 kV',full:'Summerville 115 kV Upgrade',x:75,y:48,year:2028,status:'Planned'},
  {id:'GPC_7',utility:'GPC',name:'Statesboro North',full:'Statesboro North Reinforcement',x:44,y:68,year:2028,status:'Planned'}
];
const opportunities = [
  {a:'DESC_3',b:'GPC_2',distance:9.1,months:11,score:94,priority:'High',reason:'Same voltage class · concurrent construction',value:'$480–720K'},
  {a:'DESC_4',b:'GPC_4',distance:14.8,months:8,score:86,priority:'High',reason:'Augusta-area crews · shared outage planning',value:'$350–610K'},
  {a:'DESC_5',b:'GPC_5',distance:22.4,months:6,score:71,priority:'Medium',reason:'Shared staging and contractor potential',value:'$240–420K'},
  {a:'DESC_3',b:'GPC_5',distance:31.7,months:4,score:62,priority:'Medium',reason:'Regional equipment and logistics',value:'$140–290K'}
];
const byId = id => projects.find(p=>p.id===id);
const markerBox = document.getElementById('projectMarkers');
const connectionBox = document.getElementById('connections');
const list = document.getElementById('opportunityList');
let activeOpportunity = opportunities[0];

function drawMap(filteredProjects=projects, filteredOpps=opportunities){
  markerBox.innerHTML=''; connectionBox.innerHTML='';
  filteredOpps.forEach(o=>{const a=byId(o.a),b=byId(o.b);const dx=b.x-a.x,dy=b.y-a.y;const length=Math.sqrt(dx*dx+dy*dy);const angle=Math.atan2(dy,dx)*180/Math.PI;const line=document.createElement('button');line.className='connection';line.dataset.distance=`${o.distance} km`;line.style.cssText=`left:${a.x}%;top:${a.y}%;width:${length}%;transform:rotate(${angle}deg)`;line.onclick=()=>openOpportunity(o);connectionBox.appendChild(line)});
  filteredProjects.forEach(p=>{const el=document.createElement('button');el.className=`marker ${p.utility}`;el.style.cssText=`left:${p.x}%;top:${p.y}%`;el.innerHTML=`<span>${p.name}</span>`;el.title=p.full;el.onclick=()=>{const match=opportunities.find(o=>o.a===p.id||o.b===p.id);if(match)openOpportunity(match)};markerBox.appendChild(el)});
}
function renderList(items=opportunities){
  list.innerHTML=''; items.forEach((o,i)=>{const a=byId(o.a),b=byId(o.b);const el=document.createElement('button');el.className='opportunity'+(o===activeOpportunity?' selected':'');el.innerHTML=`<div class="opp-top"><span class="rank">#${i+1} · Score ${o.score}</span><span class="badge ${o.priority.toLowerCase()}">${o.priority} priority</span></div><h3>${a.name} <span>↔</span> ${b.name}</h3><p>${a.utility==='DESC'?'Dominion Energy SC':'Georgia Power'} + ${b.utility==='GPC'?'Georgia Power':'Dominion Energy SC'}</p><div class="opp-metrics"><span><b>${o.distance} km</b> apart</span><span><b>${o.months} mo.</b> overlap</span><span><b>${o.value}</b> value</span></div><div class="reason">✓ ${o.reason}</div>`;el.onclick=()=>openOpportunity(o);list.appendChild(el)});
}
function openOpportunity(o){
  activeOpportunity=o;const a=byId(o.a),b=byId(o.b);document.getElementById('drawerTitle').textContent=`${a.name} ↔ ${b.name}`;document.getElementById('drawerDistance').textContent=`${o.distance} km`;document.getElementById('drawerSummary').textContent=`These ${a.full.includes('230')&&b.full.includes('230')?'230 kV ':''}projects are close enough to share regional construction resources while their planned work windows overlap.`;document.getElementById('timelineDesc').textContent=a.utility==='DESC'?a.name:b.name;document.getElementById('timelineGpc').textContent=a.utility==='GPC'?a.name:b.name;document.getElementById('detailDrawer').classList.add('open');document.getElementById('scrim').classList.add('open');document.getElementById('detailDrawer').setAttribute('aria-hidden','false');renderList();
}
function closeDrawer(){document.getElementById('detailDrawer').classList.remove('open');document.getElementById('scrim').classList.remove('open');document.getElementById('detailDrawer').setAttribute('aria-hidden','true')}
function applyFilters(){
  const utility=document.getElementById('utilityFilter').value,year=document.getElementById('yearFilter').value,max=+document.getElementById('distanceFilter').value,status=document.getElementById('statusFilter').value;
  const fp=projects.filter(p=>(utility==='all'||p.utility===utility)&&(year==='all'||(year==='2027+'?p.year>=2027:p.year===+year))&&(status==='all'||p.status===status));
  const ids=new Set(fp.map(p=>p.id));const fo=opportunities.filter(o=>o.distance<=max&&ids.has(o.a)&&ids.has(o.b));drawMap(fp,fo);renderList(fo);document.getElementById('projectCount').textContent=fp.length;document.getElementById('opportunityCount').textContent=fo.length;document.getElementById('closestMetric').innerHTML=fo.length?`${Math.min(...fo.map(o=>o.distance))} <em>km</em>`:'—';
}
document.querySelectorAll('.filterbar select').forEach(el=>el.addEventListener('change',applyFilters));
document.getElementById('resetFilters').onclick=()=>{document.querySelectorAll('.filterbar select').forEach(el=>el.selectedIndex=0);applyFilters()};
document.getElementById('closeDrawer').onclick=closeDrawer;document.getElementById('scrim').onclick=closeDrawer;
document.getElementById('briefButton').onclick=()=>{const t=document.getElementById('toast');t.classList.add('open');setTimeout(()=>t.classList.remove('open'),2600)};
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeDrawer()});
drawMap();renderList();
