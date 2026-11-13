-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('user', 'operator');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('none', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "EarningsMode" AS ENUM ('unset', 'payout', 'reinvest');

-- CreateEnum
CREATE TYPE "WalletFamily" AS ENUM ('evm', 'solana');

-- CreateEnum
CREATE TYPE "ProviderMode" AS ENUM ('sandbox', 'simulated');

-- CreateEnum
CREATE TYPE "ProviderId" AS ENUM ('yellowcard', 'paycrest');

-- CreateEnum
CREATE TYPE "SettlementModel" AS ENUM ('partner_float', 'direct_chain');

-- CreateEnum
CREATE TYPE "OrderKind" AS ENUM ('deposit', 'withdrawal', 'earnings_payout');

-- CreateEnum
CREATE TYPE "OrderDirection" AS ENUM ('in', 'out');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('created', 'awaiting_transfer', 'received', 'funded', 'settled', 'expired', 'refunded', 'failed', 'funds_collected', 'submitted', 'paid', 'reversed');

-- CreateEnum
CREATE TYPE "HoldReason" AS ENUM ('name_mismatch', 'amount_mismatch', 'missing_sender', 'treasury_short', 'float_short', 'rate_moved', 'screening', 'paused', 'needs_review');

-- CreateEnum
CREATE TYPE "BankAccountStatus" AS ENUM ('active', 'replaced', 'rejected');

-- CreateEnum
CREATE TYPE "LedgerOwner" AS ENUM ('user', 'treasury', 'float', 'external', 'clearing', 'venue', 'equity');

-- CreateEnum
CREATE TYPE "TransferPurpose" AS ENUM ('deposit_funding', 'payout_collection', 'payout_return', 'direct_payout_funding', 'float_topup');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('awaiting_approval', 'pending', 'submitted', 'confirmed', 'failed');

-- CreateEnum
CREATE TYPE "TradeSide" AS ENUM ('buy', 'sell');

-- CreateEnum
CREATE TYPE "TradePurpose" AS ENUM ('deposit_buy', 'retry_buy', 'reinvest', 'withdrawal_sell');

-- CreateEnum
CREATE TYPE "TradeSource" AS ENUM ('cash', 'earnings', 'stock');

-- CreateEnum
CREATE TYPE "TradeStatus" AS ENUM ('pending', 'submitted', 'filled', 'failed');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('pending', 'running', 'done', 'dead');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('info', 'warning', 'critical');

-- CreateEnum
CREATE TYPE "TreasuryOpKind" AS ENUM ('float_topup', 'float_withdrawal');

-- CreateEnum
CREATE TYPE "TreasuryOpStatus" AS ENUM ('planned', 'transferring', 'awaiting_provider', 'complete', 'failed');

-- CreateEnum
CREATE TYPE "ReconStatus" AS ENUM ('balanced', 'breached', 'incomplete');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "identitySubject" TEXT NOT NULL,
    "identityMode" "ProviderMode" NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'user',
    "kycStatus" "KycStatus" NOT NULL DEFAULT 'none',
    "kycTier" INTEGER NOT NULL DEFAULT 0,
    "verifiedName" TEXT,
    "kycPersona" TEXT,
    "kycProfile" JSONB,
    "kycMode" "ProviderMode",
    "earningsMode" "EarningsMode" NOT NULL DEFAULT 'unset',
    "reinvestStockId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "family" "WalletFamily" NOT NULL,
    "address" TEXT NOT NULL,
    "providerWalletId" TEXT NOT NULL,
    "providerMode" "ProviderMode" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treasury_wallets" (
    "id" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "providerWalletId" TEXT NOT NULL,
    "providerMode" "ProviderMode" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "treasury_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "resolvedName" TEXT NOT NULL,
    "nameMatch" BOOLEAN NOT NULL,
    "status" "BankAccountStatus" NOT NULL,
    "provider" "ProviderId" NOT NULL,
    "providerMode" "ProviderMode" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawal_quotes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "ProviderId" NOT NULL,
    "providerMode" "ProviderMode" NOT NULL,
    "ngnAmount" BIGINT NOT NULL,
    "feeNgn" BIGINT NOT NULL,
    "netNgn" BIGINT NOT NULL,
    "usdAmount" BIGINT NOT NULL,
    "debitUsdc" BIGINT NOT NULL,
    "rateKobo" BIGINT NOT NULL,
    "rateMicroUsd" BIGINT NOT NULL,
    "chain" TEXT NOT NULL,
    "stockId" TEXT,
    "sellQuantity" BIGINT,
    "bankAccountId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "withdrawal_quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ramp_orders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "OrderKind" NOT NULL,
    "direction" "OrderDirection" NOT NULL,
    "provider" "ProviderId" NOT NULL,
    "providerMode" "ProviderMode" NOT NULL,
    "settlementModel" "SettlementModel" NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'created',
    "holdReason" "HoldReason",
    "version" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "providerRef" TEXT,
    "ngnAmount" BIGINT NOT NULL,
    "feeNgn" BIGINT,
    "usdAmount" BIGINT,
    "lockedUsd" BIGINT,
    "rateKobo" BIGINT,
    "rateMicroUsd" BIGINT,
    "receivedNgn" BIGINT,
    "netNgn" BIGINT,
    "debitUsdc" BIGINT,
    "chain" TEXT,
    "stockId" TEXT,
    "quoteId" TEXT,
    "sourceBankAccountId" TEXT,
    "payToBankName" TEXT,
    "payToAccountNumber" TEXT,
    "payToAccountName" TEXT,
    "payToReference" TEXT,
    "destBankCode" TEXT,
    "destBankName" TEXT,
    "destAccountNumber" TEXT,
    "destAccountName" TEXT,
    "bankReference" TEXT,
    "fundingAddress" TEXT,
    "fundingAmount" BIGINT,
    "expiresAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ramp_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_transitions" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "holdReason" "HoldReason",
    "actor" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "ownerType" "LedgerOwner" NOT NULL,
    "userId" TEXT,
    "allowNegative" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_journals" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "orderId" TEXT,
    "requestHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_journals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "debitAccountId" TEXT NOT NULL,
    "creditAccountId" TEXT NOT NULL,
    "asset" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chain_transfers" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "purpose" "TransferPurpose" NOT NULL,
    "status" "TransferStatus" NOT NULL,
    "chain" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "orderId" TEXT,
    "treasuryOperationId" TEXT,
    "txHash" TEXT,
    "approvals" TEXT[],
    "failureReason" TEXT,
    "gasAsset" TEXT,
    "gasAmount" BIGINT,
    "providerMode" "ProviderMode" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chain_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stocks" (
    "id" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "tokenAddress" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "simPriceMicroUsdc" BIGINT NOT NULL,
    "simWeeklyEarningMicroPerShare" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trade_orders" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "purpose" "TradePurpose" NOT NULL,
    "fundsSource" "TradeSource" NOT NULL,
    "stockId" TEXT NOT NULL,
    "orderId" TEXT,
    "chain" TEXT NOT NULL,
    "venueId" TEXT,
    "amountIn" BIGINT NOT NULL,
    "minAmountOut" BIGINT,
    "amountOut" BIGINT,
    "status" "TradeStatus" NOT NULL DEFAULT 'pending',
    "failureReason" TEXT,
    "venueRef" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "providerMode" "ProviderMode" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trade_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "earnings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "week" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "amountUsdc" BIGINT NOT NULL,
    "harvestedAt" TIMESTAMP(3) NOT NULL,
    "payoutOrderId" TEXT,
    "reinvestTradeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "provider" "ProviderId" NOT NULL,
    "eventKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "signatureValid" BOOLEAN NOT NULL,
    "providerMode" "ProviderMode" NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'pending',
    "runAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 10,
    "lockedUntil" TIMESTAMP(3),
    "lockedBy" TEXT,
    "rearmAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_runs" (
    "name" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_runs_pkey" PRIMARY KEY ("name","slot")
);

-- CreateTable
CREATE TABLE "user_events" (
    "seq" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "status" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_events_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "operational_controls" (
    "scope" TEXT NOT NULL,
    "paused" BOOLEAN NOT NULL,
    "reason" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operational_controls_pkey" PRIMARY KEY ("scope")
);

-- CreateTable
CREATE TABLE "operational_alerts" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "operational_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "treasury_operations" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "TreasuryOpKind" NOT NULL,
    "provider" "ProviderId" NOT NULL,
    "chain" TEXT NOT NULL,
    "amountUsd" BIGINT NOT NULL,
    "amountUsdc" BIGINT,
    "status" "TreasuryOpStatus" NOT NULL DEFAULT 'planned',
    "externalRef" TEXT,
    "failureReason" TEXT,
    "providerMode" "ProviderMode" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "treasury_operations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_runs" (
    "id" TEXT NOT NULL,
    "asOf" TIMESTAMP(3) NOT NULL,
    "status" "ReconStatus" NOT NULL,
    "results" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_health" (
    "provider" "ProviderId" NOT NULL,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "lastFailureAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "openUntil" TIMESTAMP(3),

    CONSTRAINT "provider_health_pkey" PRIMARY KEY ("provider")
);

-- CreateTable
CREATE TABLE "sim_ramp_txs" (
    "id" TEXT NOT NULL,
    "provider" "ProviderId" NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "direction" "OrderDirection",
    "state" TEXT NOT NULL,
    "ngnAmount" BIGINT,
    "usdAmount" BIGINT NOT NULL,
    "feeNgn" BIGINT,
    "rateKobo" BIGINT,
    "rateMicroUsd" BIGINT,
    "sourceAccountNumber" TEXT,
    "sourceAccountName" TEXT,
    "senderName" TEXT,
    "destinationAccountNumber" TEXT,
    "bankReference" TEXT,
    "chain" TEXT,
    "recipientAddress" TEXT,
    "fundingAddress" TEXT,
    "settleAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sim_ramp_txs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sim_chain_txs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "chain" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" TEXT NOT NULL,
    "confirmAt" TIMESTAMP(3) NOT NULL,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sim_chain_txs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sim_swaps" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "stockId" TEXT NOT NULL,
    "side" "TradeSide" NOT NULL,
    "amountIn" BIGINT NOT NULL,
    "minAmountOut" BIGINT NOT NULL,
    "amountOut" BIGINT,
    "status" TEXT NOT NULL,
    "settleAt" TIMESTAMP(3) NOT NULL,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sim_swaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sim_faults" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sim_faults_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_identitySubject_key" ON "users"("identitySubject");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_sessionToken_key" ON "sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_userId_family_key" ON "wallets"("userId", "family");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_family_address_key" ON "wallets"("family", "address");

-- CreateIndex
CREATE UNIQUE INDEX "treasury_wallets_chain_key" ON "treasury_wallets"("chain");

-- CreateIndex
CREATE INDEX "bank_accounts_userId_idx" ON "bank_accounts"("userId");

-- CreateIndex
CREATE INDEX "withdrawal_quotes_userId_idx" ON "withdrawal_quotes"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ramp_orders_idempotencyKey_key" ON "ramp_orders"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ramp_orders_quoteId_key" ON "ramp_orders"("quoteId");

-- CreateIndex
CREATE INDEX "ramp_orders_userId_createdAt_idx" ON "ramp_orders"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ramp_orders_status_idx" ON "ramp_orders"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ramp_orders_provider_providerRef_key" ON "ramp_orders"("provider", "providerRef");

-- CreateIndex
CREATE INDEX "order_transitions_orderId_idx" ON "order_transitions"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_accounts_code_key" ON "ledger_accounts"("code");

-- CreateIndex
CREATE INDEX "ledger_accounts_userId_idx" ON "ledger_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_journals_key_key" ON "ledger_journals"("key");

-- CreateIndex
CREATE INDEX "ledger_entries_debitAccountId_idx" ON "ledger_entries"("debitAccountId");

-- CreateIndex
CREATE INDEX "ledger_entries_creditAccountId_idx" ON "ledger_entries"("creditAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "chain_transfers_key_key" ON "chain_transfers"("key");

-- CreateIndex
CREATE INDEX "chain_transfers_status_idx" ON "chain_transfers"("status");

-- CreateIndex
CREATE UNIQUE INDEX "chain_transfers_chain_txHash_key" ON "chain_transfers"("chain", "txHash");

-- CreateIndex
CREATE UNIQUE INDEX "stocks_symbol_key" ON "stocks"("symbol");

-- CreateIndex
CREATE UNIQUE INDEX "trade_orders_key_key" ON "trade_orders"("key");

-- CreateIndex
CREATE INDEX "trade_orders_userId_idx" ON "trade_orders"("userId");

-- CreateIndex
CREATE INDEX "trade_orders_status_idx" ON "trade_orders"("status");

-- CreateIndex
CREATE INDEX "earnings_userId_payoutOrderId_idx" ON "earnings"("userId", "payoutOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "earnings_userId_stockId_week_key" ON "earnings"("userId", "stockId", "week");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_eventKey_key" ON "webhook_events"("provider", "eventKey");

-- CreateIndex
CREATE UNIQUE INDEX "jobs_key_key" ON "jobs"("key");

-- CreateIndex
CREATE INDEX "jobs_status_runAt_idx" ON "jobs"("status", "runAt");

-- CreateIndex
CREATE INDEX "user_events_userId_seq_idx" ON "user_events"("userId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "treasury_operations_key_key" ON "treasury_operations"("key");

-- CreateIndex
CREATE UNIQUE INDEX "sim_ramp_txs_provider_key_key" ON "sim_ramp_txs"("provider", "key");

-- CreateIndex
CREATE UNIQUE INDEX "sim_chain_txs_key_key" ON "sim_chain_txs"("key");

-- CreateIndex
CREATE UNIQUE INDEX "sim_chain_txs_hash_key" ON "sim_chain_txs"("hash");

-- CreateIndex
CREATE UNIQUE INDEX "sim_swaps_key_key" ON "sim_swaps"("key");

-- CreateIndex
CREATE UNIQUE INDEX "sim_faults_scope_key_key" ON "sim_faults"("scope", "key");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CHECK constraints Prisma cannot express
ALTER TABLE "ramp_orders" ADD CONSTRAINT ramp_orders_ngn_amount_positive CHECK ("ngnAmount" > 0);
ALTER TABLE "ledger_entries" ADD CONSTRAINT ledger_entries_amount_positive CHECK ("amount" > 0);
ALTER TABLE "ledger_entries" ADD CONSTRAINT ledger_entries_not_self CHECK ("debitAccountId" <> "creditAccountId");

-- Partial unique indexes
CREATE UNIQUE INDEX "bank_accounts_one_active_per_user" ON "bank_accounts" ("userId") WHERE "status" = 'active';
CREATE UNIQUE INDEX "operational_alerts_open_dedupe_key" ON "operational_alerts" ("dedupeKey") WHERE "resolvedAt" IS NULL;
CREATE UNIQUE INDEX "treasury_operations_one_active_per_provider" ON "treasury_operations" ("provider") WHERE "status" NOT IN ('complete', 'failed');

-- Ledger entries must move one asset between accounts that both hold that asset
CREATE OR REPLACE FUNCTION ledger_entry_assert_asset() RETURNS trigger AS $$
DECLARE
    debit_asset text;
    credit_asset text;
BEGIN
    SELECT asset INTO debit_asset FROM "ledger_accounts" WHERE id = NEW."debitAccountId";
    SELECT asset INTO credit_asset FROM "ledger_accounts" WHERE id = NEW."creditAccountId";
    IF debit_asset IS NULL OR credit_asset IS NULL OR debit_asset <> NEW.asset OR credit_asset <> NEW.asset THEN
        RAISE EXCEPTION 'asset mismatch: entry asset % does not match accounts (% , %)', NEW.asset, debit_asset, credit_asset;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_assert_asset
    BEFORE INSERT ON "ledger_entries"
    FOR EACH ROW EXECUTE FUNCTION ledger_entry_assert_asset();

-- Journals and entries are append-only (no TRUNCATE trigger: the test reset truncates)
CREATE OR REPLACE FUNCTION ledger_append_only() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'ledger rows are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entries_append_only
    BEFORE UPDATE OR DELETE ON "ledger_entries"
    FOR EACH ROW EXECUTE FUNCTION ledger_append_only();

CREATE TRIGGER ledger_journals_append_only
    BEFORE UPDATE OR DELETE ON "ledger_journals"
    FOR EACH ROW EXECUTE FUNCTION ledger_append_only();
