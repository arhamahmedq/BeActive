import { Prisma } from '@prisma/client'

// Detects a Prisma unique-constraint violation (P2002). Uses the typed check
// when available; falls back to message matching for plain Error wrappers
// (e.g. tests that simulate the error without a real PrismaClientKnownRequestError).
export function isUniqueConstraintError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return err.code === 'P2002'
  }
  return err instanceof Error && err.message.includes('P2002')
}

// Detects a Prisma "record required but not found" error (P2025) — thrown by
// update/delete when the target row vanished (e.g. deleted by a concurrent op
// between a read and the write). Same typed-check-with-message-fallback shape.
export function isRecordNotFoundError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return err.code === 'P2025'
  }
  return err instanceof Error && err.message.includes('P2025')
}
