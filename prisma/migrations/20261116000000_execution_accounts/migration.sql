-- Per-network execution accounts and the Hydrex position NFT id on strategy positions.

CREATE TABLE "execution_accounts" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "deploymentId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "custodyProfileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "execution_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "execution_accounts_walletId_deploymentId_key" ON "execution_accounts"("walletId", "deploymentId");

ALTER TABLE "execution_accounts" ADD CONSTRAINT "execution_accounts_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "strategy_positions" ADD COLUMN "externalTokenId" numeric(78,0);

-- Backfill one execution account per wallet that already has a local execution
-- address, pinned to the local network (chain 31337).
INSERT INTO "execution_accounts" ("id", "walletId", "chainId", "deploymentId", "address", "custodyProfileId", "createdAt")
SELECT 'execacct-' || "id", "id", 31337, "deploymentId", "executionAddress", "custodyProfileId", CURRENT_TIMESTAMP
FROM "wallets"
WHERE "executionAddress" IS NOT NULL
  AND "deploymentId" IS NOT NULL
  AND "custodyProfileId" IS NOT NULL;
