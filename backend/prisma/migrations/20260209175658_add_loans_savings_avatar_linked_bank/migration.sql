-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "linked_bank_account_id" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatar_path" TEXT;

-- CreateTable
CREATE TABLE "Loan" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "lender" TEXT,
    "original_amount" DECIMAL(14,2) NOT NULL,
    "remaining_amount" DECIMAL(14,2) NOT NULL,
    "interest_rate" DECIMAL(5,2),
    "monthly_payment" DECIMAL(14,2),
    "start_date" DATE,
    "end_date" DATE,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Saving" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "target_amount" DECIMAL(14,2),
    "current_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "interest_rate" DECIMAL(5,2),
    "start_date" DATE,
    "target_date" DATE,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Saving_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Loan_household_id_idx" ON "Loan"("household_id");

-- CreateIndex
CREATE INDEX "Saving_household_id_idx" ON "Saving"("household_id");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_linked_bank_account_id_fkey" FOREIGN KEY ("linked_bank_account_id") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Saving" ADD CONSTRAINT "Saving_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
