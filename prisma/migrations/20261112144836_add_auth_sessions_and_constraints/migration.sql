-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "jti" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_jti_key" ON "sessions"("jti");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_userId_revokedAt_idx" ON "sessions"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce case-insensitive email uniqueness and non-empty / valid session bounds
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (LOWER("email"));
ALTER TABLE "users" ADD CONSTRAINT "users_email_not_empty_chk" CHECK (length(trim("email")) > 0);
ALTER TABLE "users" ADD CONSTRAINT "users_password_hash_not_empty_chk" CHECK (length("passwordHash") > 0);
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_expires_after_created_chk" CHECK ("expiresAt" > "createdAt");
