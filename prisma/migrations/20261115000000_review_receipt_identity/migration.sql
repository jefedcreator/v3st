-- A source log may deliver both settlement and stock rewards. Preserve both
-- without modifying historical receipts or journals.
DROP INDEX "reward_receipts_networkId_source_txHash_logIndex_beneficiary_key";
CREATE UNIQUE INDEX "reward_receipt_event_asset_key" ON "reward_receipts"
  ("networkId", "source", "txHash", "logIndex", "beneficiary", "asset");
ALTER TABLE "reward_receipts" ADD COLUMN "conversionQuoteId" TEXT;
ALTER TABLE "reward_receipts" ADD COLUMN "conversionAuthorizationId" TEXT;
ALTER TABLE "investment_quotes" ADD COLUMN "slippageBps" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "investment_quotes" ADD COLUMN "venueFeeAsset" TEXT;
ALTER TABLE "investment_quotes" ADD COLUMN "venueFeeRaw" DECIMAL(78,0);
ALTER TABLE "wallets" ADD COLUMN "deploymentId" TEXT;
ALTER TABLE "custody_profiles" ADD COLUMN "deploymentId" TEXT;
CREATE TABLE "local_chain_transfers" (
  "id" TEXT NOT NULL PRIMARY KEY, "key" TEXT NOT NULL UNIQUE,
  "deploymentId" TEXT NOT NULL, "requestHash" TEXT NOT NULL,
  "nonce" INTEGER NOT NULL, "txHash" TEXT NOT NULL, "signedTx" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "local_chain_transfers_deploymentId_nonce_idx" ON "local_chain_transfers"("deploymentId", "nonce");
