import { hydrexPositionManagerABI } from "@hydrexfi/hydrex-sdk";
import { parseEventLogs, type Address, type Log } from "viem";

import type { StrategyAction } from "@/backend/services/onchain/types";

// A fill proved only by logs of the Hydrex position manager itself. Enter reads
// IncreaseLiquidity plus the ERC-721 Transfer of the NFT to the account; claim reads
// Collect; exit splits principal (DecreaseLiquidity) from fees (Collect − decrease).
export type HydrexFill =
  | { kind: "enter"; tokenId: bigint; liquidity: bigint; amount0: bigint; amount1: bigint }
  | { kind: "claim"; tokenId: bigint; fee0: bigint; fee1: bigint }
  | { kind: "exit"; tokenId: bigint; principal0: bigint; principal1: bigint; fee0: bigint; fee1: bigint };

export class HydrexEventError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HydrexEventError";
  }
}

function pmLogs(logs: readonly Log[], positionManager: Address): Log[] {
  const pm = positionManager.toLowerCase();
  return logs.filter((l) => l.address.toLowerCase() === pm);
}

export function parseHydrexFill(
  action: StrategyAction,
  logs: readonly Log[],
  positionManager: Address,
  account: Address,
): HydrexFill {
  const relevant = pmLogs(logs, positionManager);
  const accountLower = account.toLowerCase();
  if (action === "enter") {
    const increase = parseEventLogs({ abi: hydrexPositionManagerABI, logs: relevant, eventName: ["IncreaseLiquidity"] });
    const transfers = parseEventLogs({ abi: hydrexPositionManagerABI, logs: relevant, eventName: ["Transfer"] });
    const tokenId = transfers.find((t) => t.args.to.toLowerCase() === accountLower)?.args.tokenId;
    const inc = increase[0];
    if (!inc || tokenId === undefined) {
      throw new HydrexEventError("Enter fill requires an IncreaseLiquidity log and the NFT transfer to the account");
    }
    return {
      kind: "enter",
      tokenId,
      liquidity: inc.args.actualLiquidity,
      amount0: inc.args.amount0,
      amount1: inc.args.amount1,
    };
  }
  const collects = parseEventLogs({ abi: hydrexPositionManagerABI, logs: relevant, eventName: ["Collect"] });
  const collect = collects[0];
  if (!collect) throw new HydrexEventError("Missing Collect log from the Hydrex position manager");
  if (collect.args.recipient.toLowerCase() !== accountLower) {
    throw new HydrexEventError("Collect was paid to a recipient other than the execution account");
  }
  if (action === "claim") {
    return { kind: "claim", tokenId: collect.args.tokenId, fee0: collect.args.amount0, fee1: collect.args.amount1 };
  }
  const decreases = parseEventLogs({ abi: hydrexPositionManagerABI, logs: relevant, eventName: ["DecreaseLiquidity"] });
  const decrease = decreases[0];
  if (!decrease) throw new HydrexEventError("Exit fill requires a DecreaseLiquidity log");
  if (decrease.args.tokenId !== collect.args.tokenId) {
    throw new HydrexEventError("DecreaseLiquidity and Collect token ids differ");
  }
  const fee0 = collect.args.amount0 - decrease.args.amount0;
  const fee1 = collect.args.amount1 - decrease.args.amount1;
  if (fee0 < 0n || fee1 < 0n) {
    throw new HydrexEventError("Collect paid less than the decreased principal; negative fees are rejected");
  }
  // Returned principal is never income: only the fee part is.
  return {
    kind: "exit",
    tokenId: collect.args.tokenId,
    principal0: decrease.args.amount0,
    principal1: decrease.args.amount1,
    fee0,
    fee1,
  };
}
