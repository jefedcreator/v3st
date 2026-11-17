-- Price history snapshots per stock and reference time.

CREATE TABLE "stock_price_snapshots" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "priceMicroUsd" BIGINT NOT NULL,
    "basis" TEXT NOT NULL,
    "multiplierWad" DECIMAL(78,0) NOT NULL,
    "rateKobo" BIGINT,
    "rateMicroUsd" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_price_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stock_price_snapshots_stockId_asOf_key" ON "stock_price_snapshots"("stockId", "asOf");
