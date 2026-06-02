-- Phase 7 cleanup: drop v1 rolling-24h fields
-- Safe to run: lastVerifiedAt is superseded by lastVerifiedDate (v2 calendar-day)
--              activityState is superseded by Streak.status + deriveDisplayTier()

-- DropIndex
DROP INDEX "Streak_lastVerifiedAt_idx";

-- DropIndex
DROP INDEX "User_activityState_idx";

-- AlterTable
ALTER TABLE "Streak" DROP COLUMN "lastVerifiedAt";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "activityState";

-- DropEnum
DROP TYPE "UserActivityState";
