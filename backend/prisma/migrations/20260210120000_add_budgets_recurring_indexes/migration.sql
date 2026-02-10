-- Add index on User.householdId for faster household lookups
CREATE INDEX IF NOT EXISTS "User_household_id_idx" ON "User"("household_id");

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "Budget" (
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

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "RecurringPattern" (
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

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "Budget_household_id_idx" ON "Budget"("household_id");

-- CreateIndex (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS "Budget_household_id_category_id_key" ON "Budget"("household_id", "category_id");

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "RecurringPattern_household_id_idx" ON "RecurringPattern"("household_id");

-- AddForeignKey (idempotent - only add if not exists)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Budget_household_id_fkey') THEN
    ALTER TABLE "Budget" ADD CONSTRAINT "Budget_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Budget_category_id_fkey') THEN
    ALTER TABLE "Budget" ADD CONSTRAINT "Budget_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'RecurringPattern_household_id_fkey') THEN
    ALTER TABLE "RecurringPattern" ADD CONSTRAINT "RecurringPattern_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
