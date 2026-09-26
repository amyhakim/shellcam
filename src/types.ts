export type Utility = 'DESC' | 'GPC'
export interface Project {
  id: string
  utility: Utility
  name: string
  fullName: string
  latitude: number
  longitude: number
  x: number
  y: number
  year: number
  inServiceDate: string
}

export interface Opportunity {
  id: string
  a: string
  b: string
  distanceKm: number
  distanceMiles: number
  dateGapDays: number
  priority: 'High' | 'Medium'
  reason: string
}
