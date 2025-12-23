-- AlterEnum
ALTER TYPE "AIProposalStatus" ADD VALUE IF NOT EXISTS 'APPLIED';
ALTER TYPE "AIProposalStatus" ADD VALUE IF NOT EXISTS 'ROLLED_BACK';

-- AlterEnum
ALTER TYPE "AIActionType" ADD VALUE IF NOT EXISTS 'APPLY';
ALTER TYPE "AIActionType" ADD VALUE IF NOT EXISTS 'ROLLBACK';

-- CreateEnum
CREATE TYPE "AIPatchType" AS ENUM ('RECATEGORIZE');

-- CreateEnum
CREATE TYPE "AIPatchStatus" AS ENUM ('APPLIED', 'ROLLED_BACK');

-- CreateTable
CREATE TABLE "AIPatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "type" "AIPatchType" NOT NULL,
    "status" "AIPatchStatus" NOT NULL DEFAULT 'APPLIED',
    "forwardPatch" JSONB NOT NULL,
    "rollbackPatch" JSONB NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rolledBackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIPatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIPatch_userId_createdAt_idx" ON "AIPatch"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AIPatch_proposalId_idx" ON "AIPatch"("proposalId");

-- AddForeignKey
ALTER TABLE "AIPatch" ADD CONSTRAINT "AIPatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIPatch" ADD CONSTRAINT "AIPatch_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "AIProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
