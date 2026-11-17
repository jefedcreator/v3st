-- Customer-facing display ticker on stocks and the keeper's pool alignment audit rows.

ALTER TABLE "stocks" ADD COLUMN "displayTicker" TEXT;

CREATE TABLE "test_pool_alignments" (
    "id" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "pool" TEXT NOT NULL,
    "beforeMicroUsd" BIGINT NOT NULL,
    "afterMicroUsd" BIGINT NOT NULL,
    "referenceMicroUsd" BIGINT NOT NULL,
    "txHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_pool_alignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "test_pool_alignments_stockId_createdAt_idx" ON "test_pool_alignments"("stockId", "createdAt");
