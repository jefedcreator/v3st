import { z } from "zod";

import {
  BASE_SEPOLIA_CHAIN_ID,
  TESTNET_CHAIN_ID,
} from "@/backend/integrations/onchain-policy";
import { BadRequestException, InternalServerErrorException } from "@/utils/exceptions";

export type CustomerChain = "testnet" | "basesepolia";

// The customer network of this deployment. Read from the live process env so
// tests can switch it; src/env.js validates the same variable when the app boots.
export function customerChain(): CustomerChain {
  const parsed = z
    .enum(["testnet", "basesepolia"])
    .default("testnet")
    .safeParse(process.env.APP_CUSTOMER_CHAIN || undefined);
  if (!parsed.success) {
    throw new InternalServerErrorException("Invalid APP_CUSTOMER_CHAIN");
  }
  return parsed.data;
}

export function customerChainId(): 31337 | 84532 {
  return customerChain() === "testnet" ? TESTNET_CHAIN_ID : BASE_SEPOLIA_CHAIN_ID;
}

export function chainIdForLedgerChain(chain: string): number {
  if (chain === "testnet") return TESTNET_CHAIN_ID;
  if (chain === "basesepolia") return BASE_SEPOLIA_CHAIN_ID;
  throw new BadRequestException(`Unknown ledger chain ${chain}`);
}
