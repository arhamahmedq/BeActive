import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

// Always cache: prevents a new PrismaClient (and connection) on every module
// evaluation. In dev this avoids hot-reload connection leaks. On Vercel this
// reuses the client within a warm Lambda container.
globalForPrisma.prisma = prisma
