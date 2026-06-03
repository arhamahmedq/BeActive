import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function run() {
  const userId = "d9927770-4173-437c-9e1f-9d2dcd8006e3"

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  })

  const now = new Date()

  console.log("Server UTC time:", now.toISOString())
  console.log("User timezone:", user?.timezone)

  // TEMP: simple sanity check (no helper dependency yet)
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: user?.timezone || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now)

  console.log("Computed localDate:", local)
}

run().catch(console.error)
