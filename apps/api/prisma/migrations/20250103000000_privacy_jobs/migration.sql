-- Enums
CREATE TYPE "PrivacyJobType" AS ENUM ('EXPORT', 'DELETE');
CREATE TYPE "PrivacyJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');

-- Table
CREATE TABLE "PrivacyJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT,
    "sessionId" TEXT,
    "type" "PrivacyJobType" NOT NULL,
    "status" "PrivacyJobStatus" NOT NULL,
    "error" TEXT,
    "filePath" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrivacyJob_pkey" PRIMARY KEY ("id")
);

-- Index
CREATE INDEX "PrivacyJob_userId_createdAt_idx" ON "PrivacyJob"("userId", "createdAt");

-- FKs
ALTER TABLE "PrivacyJob" ADD CONSTRAINT "PrivacyJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PrivacyJob" ADD CONSTRAINT "PrivacyJob_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PrivacyJob" ADD CONSTRAINT "PrivacyJob_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

