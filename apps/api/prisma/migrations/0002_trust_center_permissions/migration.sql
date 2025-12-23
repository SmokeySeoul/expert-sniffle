-- AlterTable
ALTER TABLE "User" ADD COLUMN     "aiAssistEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autopilotEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bankConnectionsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "emailParsingEnabled" BOOLEAN NOT NULL DEFAULT false;
