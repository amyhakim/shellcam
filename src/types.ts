export type Utility = 'DESC' | 'GPC'
export type ProjectStatus = 'In progress' | 'Planned'

export interface Project {
  id: string
  utility: Utility
  name: string
  fullName: string
  x: number
  y: number
  year: number
  status: ProjectStatus
}

export interface Opportunity {
  a: string
  b: string
  distance: number
  months: number
  score: number
  priority: 'High' | 'Medium'
  reason: string
  value: string
}
