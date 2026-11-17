-- CreateEnum
CREATE TYPE "CustomerOrderSide" AS ENUM ('buy', 'sell');

-- CreateEnum
CREATE TYPE "CustomerOrderFunding" AS ENUM ('cash', 'bank_transfer');

-- CreateEnum
CREATE TYPE "CustomerOrderStatus" AS ENUM ('waiting_for_payment', 'waiting_for_price', 'executing', 'completed', 'failed', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "CustomerPreviewMode" AS ENUM ('now', 'waiting');

-- DropForeignKey
ALTER TABLE "earning_allocations" DROP CONSTRAINT "earning_allocations_receiptId_fkey";

-- AlterTable
ALTER TABLE "chain_observations" ALTER COLUMN "observedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "custody_profiles" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "earning_allocations" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "investment_authorizations" ALTER COLUMN "stockIds" DROP DEFAULT,
ALTER COLUMN "strategyIds" DROP DEFAULT,
ALTER COLUMN "actions" DROP DEFAULT,
ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "revokedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "investment_quotes" ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "consumedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "investments" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "onchain_networks" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "onchain_operations" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "onchain_steps" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "position_lots" ALTER COLUMN "openedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "closedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ramp_orders" ALTER COLUMN "onchainFundedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "reward_receipts" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "signed_payloads" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sponsor_budgets" ALTER COLUMN "windowStart" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "stock_actions" ALTER COLUMN "effectiveAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "cancelledAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "stocks" ALTER COLUMN "referenceAsOf" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "strategies" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "strategy_positions" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "strategy_quotes" ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "consumedAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "customer_order_previews" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "side" "CustomerOrderSide" NOT NULL,
    "funding" "CustomerOrderFunding",
    "mode" "CustomerPreviewMode" NOT NULL,
    "amountKobo" BIGINT NOT NULL,
    "quantityRaw" DECIMAL(78,0),
    "budgetMicroUsd" BIGINT,
    "investmentQuoteId" TEXT,
    "referencePriceMicroUsd" BIGINT NOT NULL,
    "limitPriceMicroUsd" BIGINT NOT NULL,
    "rateKobo" BIGINT NOT NULL,
    "rateMicroUsd" BIGINT NOT NULL,
    "terms" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_order_previews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_orders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "previewId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "side" "CustomerOrderSide" NOT NULL,
    "funding" "CustomerOrderFunding",
    "status" "CustomerOrderStatus" NOT NULL,
    "amountKobo" BIGINT NOT NULL,
    "budgetMicroUsd" BIGINT,
    "quantityRaw" DECIMAL(78,0),
    "limitPriceMicroUsd" BIGINT NOT NULL,
    "rateKobo" BIGINT NOT NULL,
    "rateMicroUsd" BIGINT NOT NULL,
    "authorizationId" TEXT,
    "depositOrderId" TEXT,
    "investmentId" TEXT,
    "holdKey" TEXT,
    "holdReleasedAt" TIMESTAMP(3),
    "settledKobo" BIGINT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_order_previews_investmentQuoteId_key" ON "customer_order_previews"("investmentQuoteId");

-- CreateIndex
CREATE INDEX "customer_order_previews_userId_createdAt_idx" ON "customer_order_previews"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "customer_orders_key_key" ON "customer_orders"("key");

-- CreateIndex
CREATE UNIQUE INDEX "customer_orders_previewId_key" ON "customer_orders"("previewId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_orders_depositOrderId_key" ON "customer_orders"("depositOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_orders_investmentId_key" ON "customer_orders"("investmentId");

-- CreateIndex
CREATE INDEX "customer_orders_userId_createdAt_idx" ON "customer_orders"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "customer_orders_status_idx" ON "customer_orders"("status");

-- AddForeignKey
ALTER TABLE "earning_allocations" ADD CONSTRAINT "earning_allocations_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "reward_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
