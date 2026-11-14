-- Onchain investments: exact raw quantities (numeric(78,0)), persisted operations,
-- consent, strategy positions, source receipts and sponsor budgets.
-- Cash-only columns stay BIGINT; raw-asset columns widen beyond BIGINT.

CREATE TYPE "IntegrationKind" AS ENUM ('local_testnet_replica', 'verified_provider_testnet');
CREATE TYPE "CustodyKind" AS ENUM ('application_account', 'provider_managed');
CREATE TYPE "AuthScope" AS ENUM ('investments', 'strategies', 'all');
CREATE TYPE "OperationKind" AS ENUM ('spot', 'strategy');
CREATE TYPE "OperationStatus" AS ENUM ('pending', 'prepared', 'signed', 'broadcast', 'confirmed', 'finalized', 'reverted', 'failed', 'unknown', 'needs_review');
CREATE TYPE "StepStatus" AS ENUM ('pending', 'prepared', 'signed', 'broadcast', 'confirmed', 'reverted', 'failed', 'unknown');
CREATE TYPE "ObsState" AS ENUM ('pending', 'confirmed', 'reverted', 'unknown', 'reorged');
CREATE TYPE "InvestmentStatus" AS ENUM ('quoted', 'reserved', 'executing', 'filled', 'partial', 'failed', 'cancelled', 'needs_confirmation');
CREATE TYPE "StrategyPositionState" AS ENUM ('reserved', 'executing', 'active', 'exit_pending', 'exited', 'needs_review');
CREATE TYPE "ReceiptState" AS ENUM ('estimated', 'received_asset', 'conversion_pending', 'available', 'reserved_for_payout', 'paid', 'reinvested');
CREATE TYPE "RewardSource" AS ENUM ('hydrex_lp_fees', 'hydropump_creator_fees', 'stonks_distribution', 'basestonk_hook_fees', 'feel_distribution', 'cash_distribution', 'sale_gain', 'legacy_fixture');
CREATE TYPE "AllocationState" AS ENUM ('reserved', 'paid', 'reinvested', 'released');

-- Widen raw-asset columns beyond BIGINT (exact unsigned 256-bit integers).
ALTER TABLE "ledger_entries" ALTER COLUMN "amount" TYPE numeric(78,0) USING ("amount")::numeric(78,0);
ALTER TABLE "chain_transfers" ALTER COLUMN "amount" TYPE numeric(78,0) USING ("amount")::numeric(78,0);
ALTER TABLE "chain_transfers" ALTER COLUMN "gasAmount" TYPE numeric(78,0) USING ("gasAmount")::numeric(78,0);
ALTER TABLE "trade_orders" ALTER COLUMN "amountIn" TYPE numeric(78,0) USING ("amountIn")::numeric(78,0);
ALTER TABLE "trade_orders" ALTER COLUMN "minAmountOut" TYPE numeric(78,0) USING ("minAmountOut")::numeric(78,0);
ALTER TABLE "trade_orders" ALTER COLUMN "amountOut" TYPE numeric(78,0) USING ("amountOut")::numeric(78,0);
ALTER TABLE "withdrawal_quotes" ALTER COLUMN "sellQuantity" TYPE numeric(78,0) USING ("sellQuantity")::numeric(78,0);
ALTER TABLE "sim_chain_txs" ALTER COLUMN "amount" TYPE numeric(78,0) USING ("amount")::numeric(78,0);
ALTER TABLE "sim_swaps" ALTER COLUMN "amountIn" TYPE numeric(78,0) USING ("amountIn")::numeric(78,0);
ALTER TABLE "sim_swaps" ALTER COLUMN "minAmountOut" TYPE numeric(78,0) USING ("minAmountOut")::numeric(78,0);
ALTER TABLE "sim_swaps" ALTER COLUMN "amountOut" TYPE numeric(78,0) USING ("amountOut")::numeric(78,0);

-- Stock identity moves to chain+address asset keys; symbol uniqueness is dropped only
-- after stable IDs exist. Legacy sim-* rows keep their synthetic namespace.
DROP INDEX "stocks_symbol_key";
ALTER TABLE "stocks" ADD COLUMN "assetKey" TEXT;
ALTER TABLE "stocks" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'stock';
ALTER TABLE "stocks" ADD COLUMN "issuer" TEXT;
ALTER TABLE "stocks" ADD COLUMN "rightsSummary" TEXT;
ALTER TABLE "stocks" ADD COLUMN "networkId" TEXT;
ALTER TABLE "stocks" ADD COLUMN "paused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "stocks" ADD COLUMN "delisted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "stocks" ADD COLUMN "multiplierWad" numeric(78,0) NOT NULL DEFAULT 1000000000000000000;
ALTER TABLE "stocks" ADD COLUMN "referencePriceMicroUsd" BIGINT;
ALTER TABLE "stocks" ADD COLUMN "referenceBasis" TEXT;
ALTER TABLE "stocks" ADD COLUMN "referenceAsOf" TIMESTAMPTZ(6);
ALTER TABLE "stocks" ADD COLUMN "provenance" JSONB;
UPDATE "stocks" SET "assetKey" = 'sim:' || "chain" || ':' || lower("tokenAddress") WHERE "assetKey" IS NULL;
CREATE UNIQUE INDEX "stocks_assetKey_key" ON "stocks"("assetKey");
CREATE INDEX "stocks_symbol_idx" ON "stocks"("symbol");

ALTER TABLE "wallets" ADD COLUMN "executionAddress" TEXT;
ALTER TABLE "wallets" ADD COLUMN "custodyProfileId" TEXT;

ALTER TABLE "earnings" ADD COLUMN "provenance" TEXT NOT NULL DEFAULT 'legacy_fixture';
ALTER TABLE "earnings" ADD COLUMN "receiptId" TEXT;

ALTER TABLE "trade_orders" ADD COLUMN "investmentId" TEXT;
CREATE UNIQUE INDEX "trade_orders_investmentId_key" ON "trade_orders"("investmentId");

CREATE TABLE "onchain_networks" (
    "id" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "kind" "IntegrationKind" NOT NULL,
    "genesisHash" TEXT,
    "deploymentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "rpcLoopback" BOOLEAN NOT NULL DEFAULT true,
    "finalizedBlock" numeric(78,0),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "onchain_networks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "onchain_networks_networkId_key" ON "onchain_networks"("networkId");
CREATE UNIQUE INDEX "onchain_networks_deploymentId_key" ON "onchain_networks"("deploymentId");

CREATE TABLE "custody_profiles" (
    "id" TEXT NOT NULL,
    "kind" "CustodyKind" NOT NULL,
    "label" TEXT NOT NULL,
    "walletId" TEXT,
    "externalProfileId" TEXT,
    "managedAddress" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "custody_profiles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "custody_profiles_kind_walletId_key" ON "custody_profiles"("kind", "walletId");

CREATE TABLE "investment_authorizations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" "AuthScope" NOT NULL,
    "stockId" TEXT,
    "strategyId" TEXT,
    "maxSpendUsdc" numeric(78,0) NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "epoch" INTEGER NOT NULL DEFAULT 0,
    "policyVersion" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "investment_authorizations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "investment_authorizations_key_key" ON "investment_authorizations"("key");
CREATE INDEX "investment_authorizations_userId_idx" ON "investment_authorizations"("userId");

CREATE TABLE "investment_quotes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "inputAsset" TEXT NOT NULL,
    "inputRaw" numeric(78,0) NOT NULL,
    "outputAsset" TEXT NOT NULL,
    "expectedOutputRaw" numeric(78,0) NOT NULL,
    "minOutputRaw" numeric(78,0) NOT NULL,
    "budgetNgn" BIGINT,
    "feeUsdc" numeric(78,0) NOT NULL,
    "fxFeeUsdc" numeric(78,0) NOT NULL DEFAULT 0,
    "venueFeeUsdc" numeric(78,0) NOT NULL DEFAULT 0,
    "priceImpactBps" INTEGER NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerVersion" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "consumedAt" TIMESTAMPTZ(6),
    "sourceBlock" numeric(78,0) NOT NULL,
    "routeFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "investment_quotes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "investment_quotes_userId_idx" ON "investment_quotes"("userId");

CREATE TABLE "investments" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "quoteId" TEXT,
    "authorizationId" TEXT,
    "stockId" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "purpose" "TradePurpose" NOT NULL DEFAULT 'deposit_buy',
    "orderId" TEXT,
    "status" "InvestmentStatus" NOT NULL DEFAULT 'quoted',
    "operationId" TEXT,
    "amountIn" numeric(78,0) NOT NULL,
    "amountOut" numeric(78,0),
    "minAmountOut" numeric(78,0),
    "failureReason" TEXT,
    "holdReason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "investments_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "investments_key_key" ON "investments"("key");
CREATE UNIQUE INDEX "investments_quoteId_key" ON "investments"("quoteId");
CREATE UNIQUE INDEX "investments_operationId_key" ON "investments"("operationId");
CREATE INDEX "investments_userId_idx" ON "investments"("userId");
CREATE INDEX "investments_status_idx" ON "investments"("status");

CREATE TABLE "onchain_operations" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "kind" "OperationKind" NOT NULL,
    "userId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "custodyProfileId" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "quoteId" TEXT,
    "authorizationId" TEXT,
    "status" "OperationStatus" NOT NULL DEFAULT 'pending',
    "nonce" INTEGER,
    "signedPayloadHash" TEXT,
    "txHash" TEXT,
    "blockHash" TEXT,
    "blockNumber" numeric(78,0),
    "requiredConfirmations" INTEGER NOT NULL DEFAULT 2,
    "fingerprint" TEXT NOT NULL,
    "expected" JSONB,
    "actual" JSONB,
    "errorReason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "onchain_operations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "onchain_operations_key_key" ON "onchain_operations"("key");
CREATE INDEX "onchain_operations_userId_idx" ON "onchain_operations"("userId");
CREATE INDEX "onchain_operations_status_idx" ON "onchain_operations"("status");

CREATE TABLE "onchain_steps" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "to" TEXT NOT NULL,
    "callHash" TEXT NOT NULL,
    "status" "StepStatus" NOT NULL DEFAULT 'pending',
    "txHash" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "onchain_steps_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "onchain_steps_operationId_index_key" ON "onchain_steps"("operationId", "index");

CREATE TABLE "chain_observations" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "txHash" TEXT,
    "blockHash" TEXT,
    "blockNumber" numeric(78,0),
    "state" "ObsState" NOT NULL,
    "gasCostWei" numeric(78,0),
    "actualInput" JSONB,
    "actualOutput" JSONB,
    "observedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chain_observations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "chain_observations_operationId_idx" ON "chain_observations"("operationId");

CREATE TABLE "stock_actions" (
    "id" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "txHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "blockNumber" numeric(78,0) NOT NULL,
    "multiplierWad" numeric(78,0),
    "effectiveAt" TIMESTAMPTZ(6),
    "cancelledAt" TIMESTAMPTZ(6),
    "payload" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stock_actions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stock_actions_networkId_txHash_logIndex_key" ON "stock_actions"("networkId", "txHash", "logIndex");
CREATE INDEX "stock_actions_stockId_idx" ON "stock_actions"("stockId");

CREATE TABLE "position_lots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "operationId" TEXT,
    "quantity" numeric(78,0) NOT NULL,
    "costUsdc" numeric(78,0) NOT NULL,
    "fxRateKobo" BIGINT,
    "source" TEXT NOT NULL,
    "openedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMPTZ(6),
    CONSTRAINT "position_lots_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "position_lots_userId_stockId_idx" ON "position_lots"("userId", "stockId");

CREATE TABLE "strategies" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "disclosureVersion" TEXT NOT NULL,
    "inputAssets" JSONB NOT NULL,
    "receiptAsset" TEXT NOT NULL,
    "rewardAssets" JSONB NOT NULL,
    "separateClaim" BOOLEAN NOT NULL DEFAULT false,
    "permanentLock" BOOLEAN NOT NULL DEFAULT false,
    "capBps" INTEGER NOT NULL DEFAULT 2000,
    "maxUsdEquivalent" numeric(78,0) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "experimental" BOOLEAN NOT NULL DEFAULT false,
    "provenance" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "strategies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "strategies_key_key" ON "strategies"("key");

CREATE TABLE "strategy_positions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "operationId" TEXT,
    "state" "StrategyPositionState" NOT NULL DEFAULT 'reserved',
    "receiptRaw" numeric(78,0) NOT NULL DEFAULT 0,
    "principalUsdc" numeric(78,0) NOT NULL DEFAULT 0,
    "valueUsdc" numeric(78,0),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "strategy_positions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "strategy_positions_operationId_key" ON "strategy_positions"("operationId");
CREATE INDEX "strategy_positions_userId_idx" ON "strategy_positions"("userId");

CREATE TABLE "strategy_quotes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "strategyId" TEXT NOT NULL,
    "positionId" TEXT,
    "action" TEXT NOT NULL,
    "maximumInputs" JSONB NOT NULL,
    "minimumOutputs" JSONB NOT NULL,
    "userFeeUsdc" numeric(78,0) NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "consumedAt" TIMESTAMPTZ(6),
    "strategyVersion" TEXT NOT NULL,
    "disclosureVersion" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "authorizationId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "strategy_quotes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "strategy_quotes_userId_idx" ON "strategy_quotes"("userId");

CREATE TABLE "reward_receipts" (
    "id" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "source" "RewardSource" NOT NULL,
    "sourceRef" TEXT,
    "txHash" TEXT,
    "logIndex" INTEGER,
    "beneficiary" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "amountRaw" numeric(78,0) NOT NULL,
    "accrualPeriod" TEXT,
    "week" TEXT,
    "state" "ReceiptState" NOT NULL DEFAULT 'estimated',
    "conversionOperationId" TEXT,
    "payoutOrderId" TEXT,
    "reinvestTradeId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "reward_receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "reward_receipts_networkId_source_txHash_logIndex_beneficiary_key" ON "reward_receipts"("networkId", "source", "txHash", "logIndex", "beneficiary");
CREATE INDEX "reward_receipts_beneficiary_idx" ON "reward_receipts"("beneficiary");

CREATE TABLE "earning_allocations" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountUsdc" numeric(78,0) NOT NULL,
    "state" "AllocationState" NOT NULL DEFAULT 'reserved',
    "payoutOrderId" TEXT,
    "reinvestTradeId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "earning_allocations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "earning_allocations_receiptId_key" ON "earning_allocations"("receiptId");
CREATE INDEX "earning_allocations_userId_week_idx" ON "earning_allocations"("userId", "week");

CREATE TABLE "sponsor_budgets" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "windowStart" TIMESTAMPTZ(6) NOT NULL,
    "spentWei" numeric(78,0) NOT NULL DEFAULT 0,
    "capWei" numeric(78,0) NOT NULL,
    CONSTRAINT "sponsor_budgets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sponsor_budgets_scope_key" ON "sponsor_budgets"("scope");

CREATE TABLE "signed_payloads" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "approveTx" TEXT NOT NULL,
    "executeTx" TEXT NOT NULL,
    "approveHash" TEXT NOT NULL,
    "executeHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "signed_payloads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "signed_payloads_operationId_key" ON "signed_payloads"("operationId");

-- Foreign keys.
ALTER TABLE "stocks" ADD CONSTRAINT "stocks_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "onchain_networks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "investments" ADD CONSTRAINT "investments_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "investment_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "investments" ADD CONSTRAINT "investments_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "investment_authorizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "investments" ADD CONSTRAINT "investments_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "onchain_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "trade_orders" ADD CONSTRAINT "trade_orders_investmentId_fkey" FOREIGN KEY ("investmentId") REFERENCES "investments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "onchain_operations" ADD CONSTRAINT "onchain_operations_custodyProfileId_fkey" FOREIGN KEY ("custodyProfileId") REFERENCES "custody_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "onchain_operations" ADD CONSTRAINT "onchain_operations_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "onchain_networks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "onchain_steps" ADD CONSTRAINT "onchain_steps_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "onchain_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "chain_observations" ADD CONSTRAINT "chain_observations_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "onchain_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "stock_actions" ADD CONSTRAINT "stock_actions_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "onchain_networks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "strategy_positions" ADD CONSTRAINT "strategy_positions_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "strategies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "strategy_positions" ADD CONSTRAINT "strategy_positions_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "onchain_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "strategy_quotes" ADD CONSTRAINT "strategy_quotes_strategyId_fkey" FOREIGN KEY ("strategyId") REFERENCES "strategies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "strategy_quotes" ADD CONSTRAINT "strategy_quotes_authorizationId_fkey" FOREIGN KEY ("authorizationId") REFERENCES "investment_authorizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reward_receipts" ADD CONSTRAINT "reward_receipts_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "onchain_networks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "earning_allocations" ADD CONSTRAINT "earning_allocations_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "reward_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Track one-time local testnet funding of the user's execution account per ramp order.
ALTER TABLE "ramp_orders" ADD COLUMN "onchainFundedAt" TIMESTAMPTZ(6);
