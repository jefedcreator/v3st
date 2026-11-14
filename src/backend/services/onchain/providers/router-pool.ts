import { type Address, type Hex, encodePacked, keccak256 } from "viem";

import { o1RouterAbi } from "@/backend/services/onchain/abis";
import { publicClientFor, readManifest } from "@/backend/services/onchain/testnet";

export class RouterPoolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RouterPoolError";
  }
}

export function routerAddress(): Address {
  const manifest = readManifest();
  const entry = manifest.contracts.O1RouterReplica;
  if (!entry) throw new RouterPoolError("O1RouterReplica is not in the testnet manifest");
  return entry.address;
}

export function pairKey(a: Address, b: Address): Hex {
  // Solidity compares addresses numerically; mirror that ordering exactly.
  const [x, y] = BigInt(a) < BigInt(b) ? [a, b] : [b, a];
  return keccak256(encodePacked(["address", "address"], [x, y]));
}

export async function poolReserves(tokenIn: Address, tokenOut: Address): Promise<{
  settlementIn: boolean;
  reserveIn: bigint;
  reserveOut: bigint;
}> {
  const client = publicClientFor();
  const key = pairKey(tokenIn, tokenOut);
  const pool = (await client.readContract({
    address: routerAddress(),
    abi: o1RouterAbi,
    functionName: "pools",
    args: [key],
  })) as unknown as [Address, Address, bigint, bigint];
  const settlementIn = tokenIn.toLowerCase() === pool[0].toLowerCase();
  return {
    settlementIn,
    reserveIn: settlementIn ? pool[2] : pool[3],
    reserveOut: settlementIn ? pool[3] : pool[2],
  };
}

export async function partialFillBps(): Promise<bigint> {
  const client = publicClientFor();
  const value: unknown = await client.readContract({
    address: routerAddress(),
    abi: o1RouterAbi,
    functionName: "partialFillBps",
  });
  return value as bigint;
}

// Constant-product quote on the net (post-fee) input, floored.
export function fixtureQuoteOut(reserveIn: bigint, reserveOut: bigint, amountInNet: bigint): bigint {
  if (reserveIn === 0n || reserveOut === 0n) return 0n;
  return (amountInNet * reserveOut) / (reserveIn + amountInNet);
}
