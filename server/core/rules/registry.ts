import type { Rule } from './types'

// Rules R1-R9 registered here — implementations added per slice
// Slice 3: R1, R2 (AI verification)
// Slice 4: R3, R5, R6 (streak engine)
// Slice 5: R4 (feed post creation)
// Slice 7: R7, R9 (notifications)

const rules: Rule[] = []

export function registerRule(rule: Rule): void {
  rules.push(rule)
}

export function getRulesForEvent(eventType: string): Rule[] {
  return rules.filter((rule) => rule.trigger === eventType)
}
