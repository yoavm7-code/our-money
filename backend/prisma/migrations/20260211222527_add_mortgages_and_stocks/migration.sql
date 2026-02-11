-- AlterTable
ALTER TABLE "User" ALTER COLUMN "avatar_mime" SET DATA TYPE TEXT;

-- CreateTable
CREATE TABLE "Mortgage" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bank" TEXT,
    "property_value" DECIMAL(14,2),
    "total_amount" DECIMAL(14,2) NOT NULL,
    "remaining_amount" DECIMAL(14,2),
    "total_monthly" DECIMAL(14,2),
    "start_date" DATE,
    "end_date" DATE,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mortgage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MortgageTrack" (
    "id" TEXT NOT NULL,
    "mortgage_id" TEXT NOT NULL,
    "name" TEXT,
    "track_type" TEXT NOT NULL,
    "index_type" TEXT,
    "amount" DECIMAL(14,2) NOT NULL,
    "interest_rate" DECIMAL(5,2) NOT NULL,
    "monthly_payment" DECIMAL(14,2),
    "total_payments" INTEGER,
    "remaining_payments" INTEGER,
    "start_date" DATE,
    "end_date" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MortgageTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockPortfolio" (
    "id" TEXT NOT NULL,
    "household_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "broker" TEXT,
    "account_num" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'ILS',
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockPortfolio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockHolding" (
    "id" TEXT NOT NULL,
    "portfolio_id" TEXT NOT NULL,
    "ticker" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "exchange" TEXT,
    "sector" TEXT,
    "shares" DECIMAL(14,4) NOT NULL,
    "avg_buy_price" DECIMAL(14,4) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "buy_date" DATE,
    "current_price" DECIMAL(14,4),
    "price_updated_at" TIMESTAMP(3),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockHolding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Mortgage_household_id_idx" ON "Mortgage"("household_id");

-- CreateIndex
CREATE INDEX "MortgageTrack_mortgage_id_idx" ON "MortgageTrack"("mortgage_id");

-- CreateIndex
CREATE INDEX "StockPortfolio_household_id_idx" ON "StockPortfolio"("household_id");

-- CreateIndex
CREATE INDEX "StockHolding_portfolio_id_idx" ON "StockHolding"("portfolio_id");

-- CreateIndex
CREATE INDEX "StockHolding_ticker_idx" ON "StockHolding"("ticker");

-- AddForeignKey
ALTER TABLE "Mortgage" ADD CONSTRAINT "Mortgage_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MortgageTrack" ADD CONSTRAINT "MortgageTrack_mortgage_id_fkey" FOREIGN KEY ("mortgage_id") REFERENCES "Mortgage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockPortfolio" ADD CONSTRAINT "StockPortfolio_household_id_fkey" FOREIGN KEY ("household_id") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockHolding" ADD CONSTRAINT "StockHolding_portfolio_id_fkey" FOREIGN KEY ("portfolio_id") REFERENCES "StockPortfolio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
