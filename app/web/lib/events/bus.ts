import { EventEmitter } from 'events'
import type { DomainEvent } from './types'

class EventBus extends EventEmitter {
  emit(eventType: string, event: DomainEvent): boolean {
    return super.emit(eventType, event)
  }

  on(eventType: string, handler: (event: DomainEvent) => void): this {
    return super.on(eventType, handler)
  }
}

// Singleton — one event bus per process
export const eventBus = new EventBus()
eventBus.setMaxListeners(50)
