import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function run() {
  const userId = "d9927770-4173-437c-9e1f-9d2dcd8006e3"

  const completions = await prisma.dailyCompletion.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  })

  console.log("📦 Daily Completions")
  console.log(JSON.stringify(completions, null, 2))
}

run()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })
