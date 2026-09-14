-- CreateEnum
CREATE TYPE "JobSource" AS ENUM ('INTERNAL', 'EXTERNAL');

-- AlterEnum
ALTER TYPE "CompetitionEventType" ADD VALUE 'JOB_UNPUBLISHED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN "externalUserId" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "source" "JobSource" NOT NULL DEFAULT 'INTERNAL';
ALTER TABLE "Job" ADD COLUMN "externalJobId" TEXT;
ALTER TABLE "Job" ALTER COLUMN "companyId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_externalUserId_key" ON "User"("externalUserId");
CREATE UNIQUE INDEX "Job_externalJobId_key" ON "Job"("externalJobId");
CREATE INDEX "Job_source_externalJobId_idx" ON "Job"("source", "externalJobId");
