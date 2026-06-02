-- AlterTable
ALTER TABLE "Streak" ADD COLUMN     "lastVerifiedDate" TEXT;

-- CreateTable
CREATE TABLE "DailyCompletion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "localDate" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyCompletion_postId_key" ON "DailyCompletion"("postId");

-- CreateIndex
CREATE INDEX "DailyCompletion_userId_localDate_idx" ON "DailyCompletion"("userId", "localDate" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "DailyCompletion_userId_localDate_key" ON "DailyCompletion"("userId", "localDate");

-- CreateIndex
CREATE INDEX "Streak_lastVerifiedDate_idx" ON "Streak"("lastVerifiedDate");

-- AddForeignKey
ALTER TABLE "DailyCompletion" ADD CONSTRAINT "DailyCompletion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyCompletion" ADD CONSTRAINT "DailyCompletion_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
