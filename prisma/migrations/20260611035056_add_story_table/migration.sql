-- CreateEnum
CREATE TYPE "StoryStatus" AS ENUM ('PENDING_RENDER', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "Story" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "shareVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "StoryStatus" NOT NULL DEFAULT 'PENDING_RENDER',
    "assetKey" TEXT,
    "assetUrl" TEXT,
    "renderMs" INTEGER,
    "renderError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Story_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Story_postId_key" ON "Story"("postId");

-- CreateIndex
CREATE INDEX "Story_userId_createdAt_idx" ON "Story"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Story_status_idx" ON "Story"("status");

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
