import { policy } from "@/backend/config/policy";

export const PAYOUT_FEE_KOBO = 10_000n;

export function payInFeeKobo(kobo: bigint): bigint {
  const yc = policy.sim.yellowcard;
  if (kobo < yc.payinFeeBelowKobo) {
    const fee = (kobo * BigInt(yc.payinFeeBelowBps)) / 10_000n;
    return fee > yc.payinFeeBelowMinKobo ? fee : yc.payinFeeBelowMinKobo;
  }
  const fee = (kobo * BigInt(yc.payinFeeAboveBps)) / 10_000n;
  return fee > yc.payinFeeAboveMinKobo ? fee : yc.payinFeeAboveMinKobo;
}
