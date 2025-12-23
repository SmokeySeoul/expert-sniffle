-- AlterTable
ALTER TABLE "NotificationPreference" ALTER COLUMN "channels" SET DEFAULT '{"email":true,"push":false}'::jsonb;
