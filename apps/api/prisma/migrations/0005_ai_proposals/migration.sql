-- CreateEnum
CREATE TYPE "AIProposalType" AS ENUM ('RECATEGORIZE', 'SAVINGS_LIST');

-- CreateEnum
CREATE TYPE "AIProposalStatus" AS ENUM ('ACTIVE', 'DISMISSED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "AIActionType" ADD VALUE IF NOT EXISTS 'PROPOSE';

-- CreateTable
CREATE TABLE "AIProposal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "AIProposalType" NOT NULL,
    "status" "AIProposalStatus" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" VARCHAR(300) NOT NULL,
    "payload" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + interval '14 days'),

    CONSTRAINT "AIProposal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIProposal_userId_createdAt_idx" ON "AIProposal"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AIProposal_userId_status_idx" ON "AIProposal"("userId", "status");

-- AddForeignKey
ALTER TABLE "AIProposal" ADD CONSTRAINT "AIProposal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
