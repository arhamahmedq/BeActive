// Pure utility functions with no side effects
// Populated as needed

export { isValidIANATimezone } from './timezone'

export function formatDate(date: Date): string {
  return date.toISOString()
}

export function generateCorrelationId(): string {
  return `corr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}
