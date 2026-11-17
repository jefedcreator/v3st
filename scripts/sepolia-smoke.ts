import { randomUUID } from "node:crypto";

import { hydrexSwapRouterABI } from "@hydrexfi/hydrex-sdk";
import { zeroAddress, type Abi, type Address, type Hex } from "viem";

import { assertBetaRuntime } from "../src/backend/integrations/beta-policy";
import { BASE_SEPOLIA_CHAIN_ID, parseRpcEndpoint } from "../src/backend/integrations/onchain-policy";
import { settlementTokenAbi } from "../src/backend/services/onchain/abis";
import { chainObject, chainTarget, publicClientOn, relayerOn, walletClientOn } from "../src/backend/services/onchain/chains";
import { ledgerChainFor, manifestFor, verifyManifest } from "../src/backend/services/onchain/manifests";
import { assetKey } from "../src/backend/services/onchain/types";
import { authorizationService } from "../src/backend/services/authorizations";
import { earningsService } from "../src/backend/services/earnings";
import { executionService } from "../src/backend/services/execution";
import { investmentService } from "../src/backend/services/investments";
import { reconciliationService, type CheckResult } from "../src/backend/services/reconciliation";
import { rewardService } from "../src/backend/services/rewards";
import { stockService } from "../src/backend/services/stocks";
import { strategyService } from "../src/backend/services/strategies";
import { executionAccounts } from "../src/backend/services/wallets/execution-accounts";
import { walletService } from "../src/backend/services/wallets";
import { acct } from "../src/backend/services/ledger/accounts";
import { ledgerService } from "../src/backend/services/ledger";
import { openingBalance } from "../src/backend/services/ledger/postings";
import { db, withTx } from "../src/server/db";

// Operator-only live journey on Base Sepolia. Never runs in CI: it requires
// SEPOLIA_LIVE=1, a configured Base Sepolia RPC and a funded testnet relayer key.
async function main(): Promise<void> {
  assertBetaRuntime(process.env);
  if (process.env.SEPOLIA_LIVE !== "1") {
    throw new Error("Refusing to run the live journey: set SEPOLIA_LIVE=1 (operator only, funded testnet relayer required)");
  }
  const rpcUrl = process.env.BASE_SEPOLIA_RPC_URL;
  if (!rpcUrl || !process.env.BASE_SEPOLIA_RELAYER_PRIVATE_KEY) {
    throw new Error("BASE_SEPOLIA_RPC_URL and BASE_SEPOLIA_RELAYER_PRIVATE_KEY are required");
  }
  parseRpcEndpoint(rpcUrl, BASE_SEPOLIA_CHAIN_ID);
  const chainId = BASE_SEPOLIA_CHAIN_ID;
  const manifest = manifestFor(chainId);
  const verified = await verifyManifest(chainId);
  if (!verified.ok) throw new Error(`Base Sepolia manifest does not verify: ${verified.reason}`);
  console.log(`manifest ok: network=${manifest.networkId} deployment=${manifest.deploymentId}`);

  // Refresh live reference prices so the tAAPL stand-in has a usable reference.
  const sync = await stockService.syncReference();
  console.log(`reference sync: updated=${sync.updated} skipped=${sync.skipped}`);
  const stock = await db.stock.findUniqueOrThrow({ where: { assetKey: `basesepolia:${chainId}:${manifest.contracts.StockTokenAAPL!.address.toLowerCase()}` } });
  const strategy = await db.strategy.findUniqueOrThrow({ where: { key: "hydrex-aapl-usdc-basesepolia" } });

  // One synthetic smoke user with a Base Sepolia execution account.
  const user = await db.user.create({
    data: {
      phone: `+2340099${randomUUID().slice(0, 6)}`,
      role: "customer",
      kycStatus: "verified",
      kycTier: "tier2",
    } as never,
  });
  await walletService.ensureUserWallets(user.id);
  const ref = await executionAccounts.ensure(user.id, chainId);
  console.log(`execution account: ${ref.accountAddress}`);

  const publicClient = publicClientOn(chainId);
  const walletClient = walletClientOn(chainId);
  const relayer = relayerOn(chainId);
  const confirmations = chainTarget(chainId).confirmations;
  const usdc = manifest.contracts.TestSettlementToken!.address;
  const stockToken = manifest.contracts.StockTokenAAPL!.address;
  const router = manifest.external.HydrexSwapRouter!.address;

  async function send(label: string, to: Address, abi: Abi, functionName: string, args: readonly unknown[]): Promise<Hex> {
    const hash = await walletClient.writeContract({ account: relayer, chain: chainObject(chainId), address: to, abi, functionName, args });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations });
    if (receipt.status !== "success") throw new Error(`${label} reverted: ${hash}`);
    console.log(`${label}: ${hash}`);
    return hash;
  }

  // 1. Mint test USDC to the execution account (relayer is the token owner) and book
  // the same amount as the smoke user's Base Sepolia cash, so the ledger and the
  // chain agree before the first trade (reconciliation checks this at the end).
  const fundedRaw = 100_000_000n;
  await send("mint test USDC", usdc, settlementTokenAbi, "mint", [ref.accountAddress, fundedRaw]);
  await withTx((tx) =>
    ledgerService.post(tx, openingBalance({ account: acct.userCash(user.id, ledgerChainFor(chainId)), amount: fundedRaw })),
  );

  const settlementAsset = assetKey("basesepolia", chainId, usdc);
  const stockAsset = assetKey("basesepolia", chainId, stockToken);

  async function oneTimeAuth(quote: { id: string }, quoteKind: "investment" | "strategy") {
    const { dto } = await authorizationService.create(
      user.id,
      { kind: "one_time", quote_kind: quoteKind, quote_id: quote.id, policy_version: "smoke", disclosure_version: "1" },
      randomUUID(),
    );
    return dto;
  }

  async function drive(label: string, progress: () => Promise<void>): Promise<void> {
    for (let i = 0; i < 20; i += 1) {
      await progress();
      await new Promise((r) => setTimeout(r, 3_000));
    }
    console.log(`${label} done`);
  }

  // 2. Investment quote + confirm for tAAPL.
  const quote = await investmentService.quote(user.id, { stockId: stock.id, side: "buy", inputRaw: 10_000_000n });
  const auth = await oneTimeAuth(quote, "investment");
  const investment = await investmentService.confirm(user.id, quote.id, auth.id, `sepolia-smoke-buy-${randomUUID()}`);
  await drive("buy", () => investmentService.progress(investment.id));
  console.log(`buy tx: ${(await db.onchainOperation.findUniqueOrThrow({ where: { id: investment.operation_id! } })).txHash}`);

  // 3. Strategy enter.
  const enterQuote = await strategyService.quote(user.id, {
    strategyId: strategy.id,
    action: "enter",
    inputs: [
      { asset: settlementAsset, raw: 5_000_000n },
      { asset: stockAsset, raw: 0n },
    ],
  }).catch(async () => strategyService.quote(user.id, { strategyId: strategy.id, action: "enter", budgetInputRaw: 10_000_000n }));
  const enterAuth = await oneTimeAuth(enterQuote, "strategy");
  const enter = await strategyService.confirm(user.id, enterQuote.id, enterAuth.id, `sepolia-smoke-enter-${randomUUID()}`);
  await drive("enter", () => strategyService.progress(enter.operation_id));
  const position = await db.strategyPosition.findFirstOrThrow({ where: { operationId: enter.operation_id } });
  console.log(`enter tx: ${(await db.onchainOperation.findUniqueOrThrow({ where: { id: enter.operation_id } })).txHash} tokenId=${position.externalTokenId?.toString() ?? "?"}`);

  // 4. Three round-trip swaps from the relayer to generate pool fees.
  for (let i = 0; i < 3; i += 1) {
    await send(`swap ${i} USDC->tAAPL approve`, usdc, settlementTokenAbi, "approve", [router, 1_000_000n]);
    await send(`swap ${i} USDC->tAAPL`, router, hydrexSwapRouterABI, "exactInputSingle", [{
      tokenIn: usdc, tokenOut: stockToken, deployer: zeroAddress, recipient: relayer.address,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 600), amountIn: 1_000_000n, amountOutMinimum: 0n, limitSqrtPrice: 0n,
    }]);
    const stockBalance = await publicClient.readContract({ address: stockToken, abi: settlementTokenAbi, functionName: "balanceOf", args: [relayer.address] });
    await send(`swap ${i} tAAPL->USDC approve`, stockToken, settlementTokenAbi, "approve", [router, stockBalance]);
    await send(`swap ${i} tAAPL->USDC`, router, hydrexSwapRouterABI, "exactInputSingle", [{
      tokenIn: stockToken, tokenOut: usdc, deployer: zeroAddress, recipient: relayer.address,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 600), amountIn: stockBalance, amountOutMinimum: 0n, limitSqrtPrice: 0n,
    }]);
  }

  // 5. Strategy claim (collects the accrued fees to the execution account).
  const claimQuote = await strategyService.quote(user.id, { positionId: position.id, action: "claim" });
  const claimAuth = await oneTimeAuth(claimQuote, "strategy");
  const claim = await strategyService.confirm(user.id, claimQuote.id, claimAuth.id, `sepolia-smoke-claim-${randomUUID()}`);
  await drive("claim", () => strategyService.progress(claim.operation_id));
  const claimOp = await db.onchainOperation.findUniqueOrThrow({ where: { id: claim.operation_id } });
  console.log(`claim tx: ${claimOp.txHash}`);

  // 6. Reward conversion + earnings DTO. Stock-asset fee receipts are sold to test
  // USDC through the normal consent-bound conversion path; settlement receipts are
  // recognized directly. Both end as recognized earnings.
  const network = await db.onchainNetwork.findUniqueOrThrow({ where: { deploymentId: manifest.deploymentId } });
  const receipts = await db.rewardReceipt.findMany({ where: { networkId: network.id, txHash: claimOp.txHash ?? "" } });
  const feeTotal = receipts.reduce((sum, r) => sum + BigInt(r.amountRaw.toString()), 0n);
  console.log(`reward receipts: ${receipts.length} totalRaw=${feeTotal}`);
  const conversionAuth = await authorizationService.create(
    user.id,
    {
      kind: "standing",
      stock_ids: [stock.id],
      strategy_ids: [],
      actions: ["reward_conversion"],
      max_action_ngn: 1_000_000_000_000_000_000n,
      max_total_ngn: 1_000_000_000_000_000_000n,
      max_fee_bps: 10_000,
      max_slippage_bps: 100,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      policy_version: "smoke",
      disclosure_version: "1",
    },
    randomUUID(),
  );
  for (const receipt of receipts) {
    if (receipt.asset === stockAsset) {
      const conversionOpId = await rewardService.convert(receipt.id, conversionAuth.dto.id);
      await drive(`conversion ${receipt.id}`, () => executionService.progress(conversionOpId));
      console.log(`conversion tx: ${(await db.onchainOperation.findUniqueOrThrow({ where: { id: conversionOpId } })).txHash}`);
    }
    await earningsService.recognize(receipt.id);
  }
  const earnings = await earningsService.list(user.id, { page: 1, size: 20 });
  console.log(`earnings DTO: ${JSON.stringify(earnings.data.slice(0, 3))}`);

  // 7. Ledger reconciliation must be clean.
  const recon = await reconciliationService.run(new Date());
  const results = recon.results as unknown as CheckResult[];
  const breaches = results.filter((r) => r.status === "breach");
  console.log(`reconciliation: ${results.length} checks, ${breaches.length} breaches`);

  if (feeTotal === 0n) throw new Error("Claimed fees are zero");
  if (breaches.length > 0) throw new Error(`Ledger reconciliation breaches: ${breaches.map((b) => b.check).join(", ")}`);
  console.log("sepolia smoke journey OK");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
