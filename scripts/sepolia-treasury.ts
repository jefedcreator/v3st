import { encodeFunctionData, keccak256, toHex, type Hex } from "viem";

import { assertBetaRuntime } from "../src/backend/integrations/beta-policy";
import { BASE_SEPOLIA_CHAIN_ID } from "../src/backend/integrations/onchain-policy";
import { settlementTokenAbi } from "../src/backend/services/onchain/abis";
import { chainObject, chainTarget, publicClientOn, relayerOn, rpcOn, walletClientOn } from "../src/backend/services/onchain/chains";
import { ledgerChainFor, manifestFor, verifyManifest } from "../src/backend/services/onchain/manifests";
import { ledgerService } from "../src/backend/services/ledger";
import { testTreasuryMinted } from "../src/backend/services/ledger/postings";
import { walletService } from "../src/backend/services/wallets";
import { withTx } from "../src/server/db";

// Operator-only Base Sepolia treasury top-up: mints test USDC straight into the
// basesepolia treasury with the relayer's managedMint and posts the ledger journal.
// Usage: yarn sepolia:treasury --micro 5000000000
async function main(): Promise<void> {
  assertBetaRuntime(process.env);
  const argIndex = process.argv.indexOf("--micro");
  const microRaw = argIndex >= 0 ? process.argv[argIndex + 1] : undefined;
  if (!microRaw || !/^\d+$/.test(microRaw)) {
    throw new Error("Usage: yarn sepolia:treasury --micro <integer micro-USD amount>");
  }
  const amount = BigInt(microRaw);
  if (amount <= 0n) throw new Error("Amount must be positive");
  if (!process.env.BASE_SEPOLIA_RPC_URL || !process.env.BASE_SEPOLIA_RELAYER_PRIVATE_KEY) {
    throw new Error("BASE_SEPOLIA_RPC_URL and BASE_SEPOLIA_RELAYER_PRIVATE_KEY are required");
  }
  const chainId = BASE_SEPOLIA_CHAIN_ID;
  const manifest = manifestFor(chainId);
  const verified = await verifyManifest(chainId);
  if (!verified.ok) throw new Error(`Base Sepolia manifest does not verify: ${verified.reason}`);

  const chain = ledgerChainFor(chainId);
  const treasuryAddress = await walletService.treasuryAddress(chain);
  const key = `topup:basesepolia:${new Date().toISOString()}`;
  const settlement = manifest.contracts.TestSettlementToken!.address;
  const relayer = relayerOn(chainId);
  const walletClient = walletClientOn(chainId);
  const publicClient = publicClientOn(chainId);
  const nonce = await publicClient.getTransactionCount({ address: relayer.address, blockTag: "pending" });
  const gasPrice = BigInt(await rpcOn<Hex>(chainId, "eth_gasPrice"));
  const data = encodeFunctionData({
    abi: settlementTokenAbi,
    functionName: "managedMint",
    args: [keccak256(toHex(key)), treasuryAddress as Hex, amount],
  });
  const signedTx = await walletClient.signTransaction({ to: settlement, data, nonce, gas: 200_000n, gasPrice });
  const txHash = keccak256(signedTx);
  await publicClient.sendRawTransaction({ serializedTransaction: signedTx });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as Hex });
  if (receipt.status !== "success") throw new Error(`managedMint reverted: ${txHash}`);
  const target = chainTarget(chainId);
  const required = receipt.blockNumber + BigInt(target.confirmations);
  const deadline = Date.now() + 120_000;
  let head = await publicClient.getBlockNumber();
  while (head < required && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    head = await publicClient.getBlockNumber();
  }
  if (head < required) throw new Error("Confirmations not reached; the mint is on chain, rerun after it confirms");

  await withTx((tx) => ledgerService.post(tx, testTreasuryMinted({ key, chain, amount })));
  const balance = await publicClient.readContract({
    address: settlement,
    abi: settlementTokenAbi,
    functionName: "balanceOf",
    args: [treasuryAddress as Hex],
  });
  console.log(`minted ${amount} micro-USD test tokens to the ${chain} treasury (${treasuryAddress})`);
  console.log(`journal key=${key} tx=${txHash}`);
  console.log(`treasury balance now ${balance.toString()} raw units`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
