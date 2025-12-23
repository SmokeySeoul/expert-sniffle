-- CreateEnum
CREATE TYPE "PrivacyJobType" AS ENUM ('EXPORT', 'DELETE');

-- CreateEnum
CREATE TYPE "PrivacyJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "PrivacyJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" "PrivacyJobType" NOT NULL,
    "status" "PrivacyJobStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "filePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrivacyJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrivacyJob_userId_createdAt_idx" ON "PrivacyJob"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PrivacyJob_status_idx" ON "PrivacyJob"("status");

-- AddForeignKey
ALTER TABLE "PrivacyJob" ADD CONSTRAINT "PrivacyJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
