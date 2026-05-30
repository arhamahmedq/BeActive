import type { EventType, DomainEvent } from '../../../app/web/lib/events/types'

export interface Rule {
  id: string
  name: string
  description: string
  trigger: EventType
  condition: (event: DomainEvent, context?: unknown) => boolean
  actions: RuleAction[]
}

export interface RuleAction {
  type: string
  execute: (event: DomainEvent, context?: unknown) => Promise<void>
}
