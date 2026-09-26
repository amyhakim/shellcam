import type { Opportunity, Project } from './types'

export const projects: Project[] = [
  { id: 'DESC_3', utility: 'DESC', name: 'Jasper–Okatie #2', fullName: 'Jasper–Okatie 230 kV Line No. 2', x: 64, y: 75, year: 2025, status: 'In progress' },
  { id: 'GPC_2', utility: 'GPC', name: 'McIntosh–Purrysburg', fullName: 'McIntosh–Purrysburg 230 kV Reactors', x: 60, y: 72, year: 2026, status: 'In progress' },
  { id: 'DESC_4', utility: 'DESC', name: 'Urquhart upgrade', fullName: 'Urquhart 230 kV Substation Upgrade', x: 52, y: 42, year: 2026, status: 'Planned' },
  { id: 'GPC_4', utility: 'GPC', name: 'Thomson–Vogtle', fullName: 'Thomson–Vogtle Transmission Line', x: 45, y: 38, year: 2027, status: 'Planned' },
  { id: 'DESC_5', utility: 'DESC', name: 'Bluffton rebuild', fullName: 'Bluffton Network Rebuild', x: 69, y: 69, year: 2027, status: 'Planned' },
  { id: 'GPC_5', utility: 'GPC', name: 'Savannah East', fullName: 'Savannah East Capacity Project', x: 62, y: 79, year: 2027, status: 'Planned' },
  { id: 'DESC_7', utility: 'DESC', name: 'Summerville 115 kV', fullName: 'Summerville 115 kV Upgrade', x: 75, y: 48, year: 2028, status: 'Planned' },
  { id: 'GPC_7', utility: 'GPC', name: 'Statesboro North', fullName: 'Statesboro North Reinforcement', x: 44, y: 68, year: 2028, status: 'Planned' },
]

export const opportunities: Opportunity[] = [
  { a: 'DESC_3', b: 'GPC_2', distance: 9.1, months: 11, score: 94, priority: 'High', reason: 'Same voltage class · concurrent construction', value: '$480–720K' },
  { a: 'DESC_4', b: 'GPC_4', distance: 14.8, months: 8, score: 86, priority: 'High', reason: 'Augusta-area crews · shared outage planning', value: '$350–610K' },
  { a: 'DESC_5', b: 'GPC_5', distance: 22.4, months: 6, score: 71, priority: 'Medium', reason: 'Shared staging and contractor potential', value: '$240–420K' },
  { a: 'DESC_3', b: 'GPC_5', distance: 31.7, months: 4, score: 62, priority: 'Medium', reason: 'Regional equipment and logistics', value: '$140–290K' },
]
