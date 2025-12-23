-- CreateEnum
CREATE TYPE "AIActionType" AS ENUM ('EXPLAIN');

-- CreateTable
CREATE TABLE "AIActionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actionType" "AIActionType" NOT NULL,
    "topic" TEXT NOT NULL,
    "inputRedacted" JSONB NOT NULL,
    "outputSummary" VARCHAR(500) NOT NULL,
    "confidence" DOUBLE PRECISION,
    "provider" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIActionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIActionLog_userId_createdAt_idx" ON "AIActionLog"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "AIActionLog" ADD CONSTRAINT "AIActionLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
