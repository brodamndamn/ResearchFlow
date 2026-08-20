import type { ResearchMode, ResearchSnapshot, ResearchStatus } from './types'

const STORAGE_KEY = 'researchflow:recent'
const MAX_RECENT = 8

export interface RecentResearch {
  id: string
  topic: string
  mode?: ResearchMode
  status: ResearchStatus
  updatedAt: string
}
export function readRecentResearch(): RecentResearch[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(value) ? value.slice(0, MAX_RECENT) : []
  } catch {
    return []
  }
}

export function saveRecentResearch(snapshot: ResearchSnapshot): void {
  const item: RecentResearch = {
    id: snapshot.id,
    topic: snapshot.topic,
    mode: snapshot.mode,
    status: snapshot.status,
    updatedAt: snapshot.updatedAt,
  }
  const remaining = readRecentResearch().filter(({ id }) => id !== snapshot.id)
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify([item, ...remaining].slice(0, MAX_RECENT)),
  )
}

export function updateRecentResearchMode(id: string, mode: ResearchMode): void {
  const updated = readRecentResearch().map((item) =>
    item.id === id ? { ...item, mode } : item,
  )
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
}
