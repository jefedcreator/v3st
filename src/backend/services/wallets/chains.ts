import { policy } from "@/backend/config/policy";
import type { WalletFamily } from "@/server/prisma";
import { BadRequestException } from "@/utils/exceptions";

export type Chain = "base" | "solana" | "testnet";

export const CHAINS: Record<
  Chain,
  { family: WalletFamily; usdc: string; confirmSeconds: number }
> = {
  base: {
    family: "evm",
    usdc: "sim-usdc-base",
    confirmSeconds: policy.sim.chain.confirmSeconds.base,
  },
  solana: {
    family: "solana",
    usdc: "sim-usdc-solana",
    confirmSeconds: policy.sim.chain.confirmSeconds.solana,
  },
  // Local Anvil replica namespace used by onchain stock operations; transfers here
  // ride the same simulated wallet provider as the other beta chains.
  testnet: {
    family: "evm",
    usdc: "sim-usdc-testnet",
    confirmSeconds: policy.sim.chain.confirmSeconds.testnet,
  },
};

export const CHAIN_LIST: readonly Chain[] = ["base", "solana", "testnet"];

export function assertChain(chain: string): Chain {
  if (chain === "base" || chain === "solana" || chain === "testnet") return chain;
  throw new BadRequestException(`Unknown chain ${chain}`);
}
