import { hydrexPositionManagerABI } from "@hydrexfi/hydrex-sdk";
import { encodeAbiParameters, encodeEventTopics, type Address, type Hex, type Log } from "viem";
import { describe, expect, it } from "vitest";

import { parseHydrexFill } from "@/backend/services/onchain/providers/hydrex/events";

const PM = "0xb7875b8Dc8f49c2D6BBb658905dBF88843B54Da8" as Address;
const ACCOUNT = "0x0000000000000000000000000000000000000c01" as Address;
const ATTACKER = "0x000000000000000000000000000000000000dEaD" as Address;
const POOL = "0x0000000000000000000000000000000000000b01" as Address;

type PmEvent = Extract<(typeof hydrexPositionManagerABI)[number], { type: "event" }>;

function logOf(eventName: PmEvent["name"], args: Record<string, unknown>, emitter: Address = PM): Log {
  const event = hydrexPositionManagerABI.find((e): e is PmEvent => e.type === "event" && e.name === eventName)!;
  const topics = encodeEventTopics({ abi: [event], eventName, args });
  const dataInputs = event.inputs.filter((i) => !i.indexed);
  const data = encodeAbiParameters(
    dataInputs,
    dataInputs.map((i) => args[i.name ?? ""]) as never,
  );
  return { address: emitter, topics, data, logIndex: 0, blockHash: null, blockNumber: null, transactionHash: null, transactionIndex: null, removed: false } as unknown as Log;
}

function collectLog(o: { tokenId: bigint; recipient: Address; amount0: bigint; amount1: bigint; emitter?: Address }): Log {
  return logOf("Collect", { tokenId: o.tokenId, recipient: o.recipient, amount0: o.amount0, amount1: o.amount1 }, o.emitter ?? PM);
}

function decreaseLog(o: { tokenId: bigint; liquidity?: bigint; amount0: bigint; amount1: bigint; emitter?: Address }): Log {
  return logOf("DecreaseLiquidity", { tokenId: o.tokenId, liquidity: o.liquidity ?? 0n, amount0: o.amount0, amount1: o.amount1 }, o.emitter ?? PM);
}

function increaseLog(o: { tokenId: bigint; liquidity: bigint; amount0: bigint; amount1: bigint }): Log {
  return logOf("IncreaseLiquidity", { tokenId: o.tokenId, liquidityDesired: o.liquidity, actualLiquidity: o.liquidity, amount0: o.amount0, amount1: o.amount1, pool: POOL });
}

function transferLog(o: { tokenId: bigint; to: Address }): Log {
  return logOf("Transfer", { from: "0x0000000000000000000000000000000000000000", to: o.to, tokenId: o.tokenId });
}

describe("hydrex fill parsing", () => {
  it("splits an exit into principal and fees", () => {
    const fill = parseHydrexFill(
      "exit",
      [decreaseLog({ tokenId: 42n, liquidity: 100n, amount0: 900n, amount1: 4n }), collectLog({ tokenId: 42n, recipient: ACCOUNT, amount0: 930n, amount1: 5n })],
      PM,
      ACCOUNT,
    );
    expect(fill).toEqual({ kind: "exit", tokenId: 42n, principal0: 900n, principal1: 4n, fee0: 30n, fee1: 1n });
  });

  it("reports zero fees as zero, and rejects a collect paid to another recipient", () => {
    expect(parseHydrexFill("claim", [collectLog({ tokenId: 42n, recipient: ACCOUNT, amount0: 0n, amount1: 0n })], PM, ACCOUNT)).toMatchObject({ fee0: 0n, fee1: 0n });
    expect(() => parseHydrexFill("claim", [collectLog({ tokenId: 42n, recipient: ATTACKER, amount0: 5n, amount1: 0n })], PM, ACCOUNT)).toThrow();
  });

  it("ignores logs from other contracts and rejects a missing Collect", () => {
    expect(() => parseHydrexFill("claim", [collectLog({ tokenId: 42n, recipient: ACCOUNT, amount0: 5n, amount1: 0n, emitter: ATTACKER })], PM, ACCOUNT)).toThrow(/collect/i);
  });

  it("reads enter from IncreaseLiquidity plus the NFT transfer to the account", () => {
    const fill = parseHydrexFill(
      "enter",
      [increaseLog({ tokenId: 42n, liquidity: 777n, amount0: 1_000n, amount1: 2_000n }), transferLog({ tokenId: 42n, to: ACCOUNT })],
      PM,
      ACCOUNT,
    );
    expect(fill).toEqual({ kind: "enter", tokenId: 42n, liquidity: 777n, amount0: 1_000n, amount1: 2_000n });
  });

  it("rejects a negative fee split on exit", () => {
    expect(() =>
      parseHydrexFill(
        "exit",
        [decreaseLog({ tokenId: 42n, amount0: 900n, amount1: 4n }), collectLog({ tokenId: 42n, recipient: ACCOUNT, amount0: 100n, amount1: 5n })],
        PM,
        ACCOUNT,
      ),
    ).toThrow(/negative/i);
  });
});
