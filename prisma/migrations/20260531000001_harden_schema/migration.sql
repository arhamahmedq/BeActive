-- =====================================================================
-- MIGRATION: Slice 1 hardening — schema correctness fixes
-- Applied: 2026-05-31
-- =====================================================================

-- 1. Remove @default(cuid()) from User.id
--    User.id must always be set to the Supabase UUID. Removing the default
--    makes omitting it a hard error rather than silently generating a CUID.
ALTER TABLE "User" ALTER COLUMN "id" DROP DEFAULT;

-- 2. Remove redundant B-tree indexes on User.email and User.username.
--    @unique already creates "User_email_key" and "User_username_key" indexes.
--    The explicit @@index([email]) and @@index([username]) created duplicates.
DROP INDEX IF EXISTS "User_email_idx";
DROP INDEX IF EXISTS "User_username_idx";

-- 3. Fix Event table FK: change ON DELETE RESTRICT → ON DELETE SET NULL
--    and make userId nullable. Events are an append-only audit log that
--    must outlive users — the current RESTRICT prevents deleting any User
--    who has events (all of them, after signup).
ALTER TABLE "Event" DROP CONSTRAINT IF EXISTS "Event_userId_fkey";
ALTER TABLE "Event" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Event" ADD CONSTRAINT "Event_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Add canonical uniqueness to Friendship to prevent (A,B) + (B,A) duplicates.
--    The service layer enforces userAId < userBId ordering. This functional
--    index enforces it at the database level as a backstop.
CREATE UNIQUE INDEX "Friendship_canonical_key"
  ON "Friendship"(LEAST("userAId", "userBId"), GREATEST("userAId", "userBId"));
