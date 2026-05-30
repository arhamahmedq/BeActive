import type { DomainEvent } from '../../../app/web/lib/events/types'
import { getRulesForEvent } from './registry'
import { logger } from '../logger'

export async function evaluateRules(event: DomainEvent): Promise<void> {
  const rules = getRulesForEvent(event.type)
  for (const rule of rules) {
    try {
      if (rule.condition(event)) {
        for (const action of rule.actions) {
          await action.execute(event)
        }
      }
    } catch (err) {
      logger.error('Rule evaluation failed', {
        ruleId: rule.id,
        eventType: event.type,
        error: String(err),
      })
    }
  }
}
