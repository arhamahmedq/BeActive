// Pure utility functions with no side effects
// Populated as needed

export { isValidIANATimezone } from './timezone'
export { canShowStoryShare, isLatestVerifiedDayPost } from './storyShare'
export type { StorySharePost } from './storyShare'

export function formatDate(date: Date): string {
  return date.toISOString()
}

export function generateCorrelationId(): string {
  return `corr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}
