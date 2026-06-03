import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function run() {
  const user = await prisma.user.findUnique({
    where: {
      id: "d9927770-4173-437c-9e1f-9d2dcd8006e3",
    },
  })

  console.log(user)
}

run()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })
