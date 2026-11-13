import type { ProviderMode, WalletFamily } from "@/server/prisma";

import type { Chain } from "./chains";

export interface WalletProvider {
  readonly mode: ProviderMode;
  createWallet(i: {
    ownerKey: string;
    family: WalletFamily;
  }): Promise<{ providerWalletId: string; address: string }>;
  submitTransfer(i: {
    key: string;
    chain: Chain;
    from: { providerWalletId: string; address: string };
    to: string;
    token: string;
    amount: bigint;
  }): Promise<{ txHash: string }>;
  getTransfer(
    key: string,
  ): Promise<{
    status: "pending" | "confirmed" | "failed";
    txHash: string;
    failureReason: string | null;
  } | null>;
  getByHash(
    chain: Chain,
    txHash: string,
  ): Promise<{
    status: "pending" | "confirmed" | "failed";
    from: string;
    to: string;
    token: string;
    amount: bigint;
  } | null>;
  balance(chain: Chain, address: string, token: string): Promise<bigint>;
}
