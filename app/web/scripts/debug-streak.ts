import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function run() {
  const streak = await prisma.streak.findFirst()
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
  })

  console.log("🔥 STREAK STATE:")
  console.log(streak)

  console.log("\n📦 RECENT POSTS:")
  console.log(posts)
}

run()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })
