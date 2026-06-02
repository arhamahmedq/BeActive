/**
 * audit-timezones.mjs — Phase 0 timezone readiness check
 *
 * Usage:
 *   node --env-file=app/web/.env.local scripts/audit-timezones.mjs
 *
 * Reports:
 *   - Total users
 *   - Valid IANA timezones
 *   - Defaulted to UTC (technically valid but likely not the user's real tz)
 *   - Invalid timezone strings (must fix before v2 migration)
 *
 * Phase 0 DoD: "Invalid" count = 0.
 */

import { PrismaClient } from '/Users/arhamahmedfiroz/Documents/Projects/BeActive/node_modules/@prisma/client/default.js'

const prisma = new PrismaClient()

function isValidIANATimezone(tz) {
  if (!tz || typeof tz !== 'string') return false
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

async function main() {
  console.log('BeActive — Phase 0 Timezone Audit\n')

  const users = await prisma.user.findMany({
    select: { id: true, username: true, email: true, timezone: true },
    orderBy: { createdAt: 'asc' },
  })

  if (users.length === 0) {
    console.log('No users found in database.')
    await prisma.$disconnect()
    return
  }

  const invalid = []
  const utcDefault = []
  const valid = []

  for (const u of users) {
    if (!isValidIANATimezone(u.timezone)) {
      invalid.push(u)
    } else if (u.timezone === 'UTC') {
      utcDefault.push(u)
    } else {
      valid.push(u)
    }
  }

  console.log(`Total users:      ${users.length}`)
  console.log(`Valid (non-UTC):  ${valid.length}`)
  console.log(`UTC default:      ${utcDefault.length} (valid IANA but likely not their real tz)`)
  console.log(`Invalid:          ${invalid.length}`)
  console.log()

  if (utcDefault.length > 0) {
    console.log('UTC-defaulted users (need onboarding to set real tz):')
    for (const u of utcDefault) {
      console.log(`  ${u.username} (${u.email}) — timezone: "${u.timezone}"`)
    }
    console.log()
  }

  if (invalid.length > 0) {
    console.log('INVALID timezones (must fix before v2 migration):')
    for (const u of invalid) {
      console.log(`  ${u.username} (${u.email}) — timezone: "${u.timezone}"`)
    }
    console.log()
  }

  if (invalid.length === 0) {
    console.log('Phase 0 DoD: PASS — 0 invalid timezone strings.')
  } else {
    console.log(`Phase 0 DoD: FAIL — ${invalid.length} invalid timezone string(s). Fix before proceeding to Phase 1.`)
    process.exit(1)
  }

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('Audit failed:', err)
  prisma.$disconnect()
  process.exit(1)
})
