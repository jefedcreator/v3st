import { policy } from "@/backend/config/policy";
import type { WalletFamily } from "@/server/prisma";
import { BadRequestException } from "@/utils/exceptions";

export type Chain = "base" | "solana";

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
};

export const CHAIN_LIST: readonly Chain[] = ["base", "solana"];

export function assertChain(chain: string): Chain {
  if (chain === "base" || chain === "solana") return chain;
  throw new BadRequestException(`Unknown chain ${chain}`);
}
