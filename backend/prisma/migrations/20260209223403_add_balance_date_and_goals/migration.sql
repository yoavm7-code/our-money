-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "balance_date" DATE;

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target_amount" DECIMAL(14,2) NOT NULL,
    "current_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "target_date" DATE,
    "icon" TEXT,
    "color" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "monthly_target" DECIMAL(14,2),
    "ai_tips" TEXT,
    "ai_tips_updated_at" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Goal_household_id_idx" ON "Goal"("household_id");

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
