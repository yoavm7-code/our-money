-- Add index on User.householdId for faster household lookups
CREATE INDEX "User_household_id_idx" ON "User"("household_id");

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringPattern" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "type" TEXT NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'monthly',
    "category_id" TEXT,
    "account_id" TEXT,
    "last_seen_date" DATE NOT NULL,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "is_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "is_dismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringPattern_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Budget_household_id_idx" ON "Budget"("household_id");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_household_id_category_id_key" ON "Budget"("household_id", "category_id");

-- CreateIndex
CREATE INDEX "RecurringPattern_household_id_idx" ON "RecurringPattern"("household_id");

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringPattern" ADD CONSTRAINT "RecurringPattern_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
