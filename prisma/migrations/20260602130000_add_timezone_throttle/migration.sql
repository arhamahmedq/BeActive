-- Timezone-change throttle (anti-cheat): cap how often a user can redefine
-- their local "today" by changing their IANA timezone.
ALTER TABLE "User" ADD COLUMN "tzChangedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "tzChangeCount" INTEGER NOT NULL DEFAULT 0;
