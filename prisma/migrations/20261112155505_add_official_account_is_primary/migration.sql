-- AlterTable
ALTER TABLE "official_accounts" ADD COLUMN     "isPrimary" BOOLEAN NOT NULL DEFAULT false;

-- Enforce at most one primary official account per user and non-empty handles
CREATE UNIQUE INDEX "official_accounts_one_primary_per_user_idx" ON "official_accounts" ("userId") WHERE "isPrimary" = true;
ALTER TABLE "official_accounts" ADD CONSTRAINT "official_accounts_handle_not_empty_chk" CHECK (length(trim("handle")) > 0);
