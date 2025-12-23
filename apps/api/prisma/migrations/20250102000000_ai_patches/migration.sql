-- Enums
CREATE TYPE "AIPatchStatus" AS ENUM ('APPLIED', 'ROLLED_BACK');
ALTER TYPE "AIActionType" ADD VALUE IF NOT EXISTS 'APPLY';
ALTER TYPE "AIActionType" ADD VALUE IF NOT EXISTS 'ROLLBACK';
ALTER TYPE "AIProposalStatus" ADD VALUE IF NOT EXISTS 'APPLIED';
ALTER TYPE "AIProposalStatus" ADD VALUE IF NOT EXISTS 'ROLLED_BACK';

-- Table
CREATE TABLE "AIPatch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "status" "AIPatchStatus" NOT NULL,
    "patch" JSONB NOT NULL,
    "inversePatch" JSONB NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL,
    "rolledBackAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AIPatch_pkey" PRIMARY KEY ("id")
);

-- Index
CREATE INDEX "AIPatch_userId_createdAt_idx" ON "AIPatch"("userId", "createdAt");

-- FKs
ALTER TABLE "AIPatch" ADD CONSTRAINT "AIPatch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AIPatch" ADD CONSTRAINT "AIPatch_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "AIProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Proposal appliedPatch optional column
ALTER TABLE "AIProposal" ADD COLUMN "appliedPatchId" TEXT;
ALTER TABLE "AIProposal" ADD CONSTRAINT "AIProposal_appliedPatchId_fkey" FOREIGN KEY ("appliedPatchId") REFERENCES "AIPatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

