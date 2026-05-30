// MVP: Event bus lives at app/web/lib/events/ (co-located with Next.js API routes)
// At scale (dedicated backend server): migrate bus + handlers here
export { eventBus } from '../../../app/web/lib/events/bus'
export { EventType } from '../../../app/web/lib/events/types'
export type { DomainEvent } from '../../../app/web/lib/events/types'
