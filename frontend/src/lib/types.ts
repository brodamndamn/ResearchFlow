export type ResearchMode = 'quick' | 'deep'

export type ResearchStatus =
  | 'queued'
  | 'planning'
  | 'waiting_for_review'
  | 'researching'
  | 'writing'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired'

export interface ResearchEvent {
  phase: string
  message: string
  timestamp: string
  status?: 'pending' | 'active' | 'completed' | 'failed'
}

export interface ReportSource {
  id: string | number
  title: string
  url: string
  domain: string
  publishedAt?: string
  snippet?: string
}

export interface ResearchReport {
  title: string
  markdown: string
  sources: ReportSource[]
  sourceCount: number
  citationCount: number
  durationSeconds: number
  completedAt: string
}

export interface ResearchSnapshot {
  id: string
  topic: string
  mode: ResearchMode
  status: ResearchStatus
  focus: string
  subqueries: string[]
  events: ResearchEvent[]
  createdAt: string
  updatedAt: string
  error?: string
  report?: ResearchReport
}

export interface Showcase {
  id: string
  runId: string
  title: string
  summary: string
  mode: ResearchMode
  report?: ResearchReport
}

export interface CreateResearchInput {
  topic: string
  mode: ResearchMode
}

export interface UpdatePlanInput {
  focus: string
  subqueries: string[]
}
