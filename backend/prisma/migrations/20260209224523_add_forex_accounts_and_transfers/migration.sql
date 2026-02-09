-- CreateEnum
CREATE TYPE "ForexTransferType" AS ENUM ('BUY', 'SELL', 'TRANSFER');

-- CreateTable
CREATE TABLE "ForexAccount" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "balance" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "provider" TEXT,
    "account_num" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForexAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForexTransfer" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "forex_account_id" TEXT,
    "type" "ForexTransferType" NOT NULL,
    "from_currency" TEXT NOT NULL,
    "to_currency" TEXT NOT NULL,
    "from_amount" DECIMAL(14,2) NOT NULL,
    "to_amount" DECIMAL(14,2) NOT NULL,
    "exchange_rate" DECIMAL(14,6) NOT NULL,
    "fee" DECIMAL(14,2),
    "date" DATE NOT NULL,
    "description" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForexTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ForexAccount_household_id_idx" ON "ForexAccount"("household_id");

-- CreateIndex
CREATE INDEX "ForexTransfer_household_id_idx" ON "ForexTransfer"("household_id");

-- CreateIndex
CREATE INDEX "ForexTransfer_forex_account_id_idx" ON "ForexTransfer"("forex_account_id");

-- CreateIndex
CREATE INDEX "ForexTransfer_date_idx" ON "ForexTransfer"("date");

-- AddForeignKey
ALTER TABLE "ForexAccount" ADD CONSTRAINT "ForexAccount_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForexTransfer" ADD CONSTRAINT "ForexTransfer_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForexTransfer" ADD CONSTRAINT "ForexTransfer_forex_account_id_fkey" FOREIGN KEY ("forex_account_id") REFERENCES "ForexAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
