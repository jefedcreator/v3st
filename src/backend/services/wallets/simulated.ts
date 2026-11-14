import { createHash } from "node:crypto";

import type { WalletFamily } from "@/server/prisma";
import { simChain } from "@/backend/services/simulator/chain";

import { CHAINS, type Chain } from "./chains";
import type { WalletProvider } from "./provider";

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(input: Buffer): string {
  const digits: number[] = [0];
  for (const byte of input) {
    let carry = byte;
    for (let i = 0; i < digits.length; i += 1) {
      carry += digits[i]! << 8;
      digits[i] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let out = "";
  for (const byte of input) {
    if (byte === 0) out += "1";
    else break;
  }
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    out += BASE58_ALPHABET[digits[i]!]!;
  }
  return out;
}

export function simulatedAddress(ownerKey: string, family: WalletFamily): string {
  if (family === "evm") {
    return `0x${createHash("sha256").update(`sim-evm:${ownerKey}`).digest("hex").slice(0, 40)}`;
  }
  return base58Encode(createHash("sha256").update(`sim-sol:${ownerKey}`).digest());
}

export const simulatedWalletProvider: WalletProvider = {
  mode: "simulated",

  async createWallet(i: { ownerKey: string; family: WalletFamily }) {
    const address = simulatedAddress(i.ownerKey, i.family);
    return { providerWalletId: `sim-${address}`, address };
  },

  async submitTransfer(i) {
    return simChain.submit(i.chain, {
      key: i.key,
      from: i.from.address,
      to: i.to,
      token: i.token,
      amount: i.amount,
    });
  },

  async getTransfer(key: string) {
    return simChain.getTransfer(key);
  },

  async getByHash(chain: Chain, txHash: string) {
    return simChain.getByHash(chain, txHash);
  },

  async balance(chain: Chain, address: string, token: string) {
    return simChain.balance(chain, address, token);
  },
};

export function chainToken(chain: Chain): string {
  return CHAINS[chain].usdc;
}
