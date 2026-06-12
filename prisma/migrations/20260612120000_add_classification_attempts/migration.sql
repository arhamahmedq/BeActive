-- Poison-post cap (H1): track classification attempts so a post whose image
-- always fails AI classification is rejected after a bounded number of
-- reconciler retries instead of retrying forever.
ALTER TABLE "Post" ADD COLUMN "classificationAttempts" INTEGER NOT NULL DEFAULT 0;
