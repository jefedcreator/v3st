export const policy = {
  defaultChain: "base",
  earnings: {
    minPayoutKobo: 200_000n,
  },
  compliance: {
    travelRuleMicroUsd: 1_000_000_000n,
    limits: {
      tier1: { dayKobo: 30_000_000n, monthKobo: 100_000_000n },
      tier2: { dayKobo: 500_000_000n, monthKobo: 2_000_000_000n },
    },
  },
  deposits: {
    minKobo: 100_000n,
    maxKobo: 500_000_000n,
    toleranceBps: 100,
    latePaymentWatchHours: 24,
  },
  withdrawals: {
    quoteTtlSeconds: 60,
    fxDriftBps: 100,
  },
  trading: {
    maxSlippageBps: 100,
  },
  rates: {
    displayCacheSeconds: 5,
  },
  treasury: {
    float: {
      floorMicroUsd: 5_000_000_000n,
      targetMicroUsd: 10_000_000_000n,
      ceilingMicroUsd: 20_000_000_000n,
      topUpMarginMicroUsd: 1_000_000_000n,
    },
    quorumThresholdMicroUsdc: 25_000_000_000n,
    userTransferCapMicroUsdc: 10_000_000_000n,
    treasuryTransferCapMicroUsdc: 100_000_000_000n,
  },
  recon: {
    thresholdMicro: 1_000_000n,
  },
  schedule: {
    pollEveryMinutes: 1,
    rebalanceMinuteOfHour: 30,
    reconcileHour: 2,
    harvest: { weekday: 4, hour: 22, minute: 0 },
    floatPrecheck: { weekday: 4, hour: 23, minute: 0 },
    payouts: { weekday: 5, startHour: 8, endHour: 23 },
  },
  providers: {
    circuit: { consecutiveFailures: 5, openSeconds: 300 },
  },
  worker: {
    concurrency: 4,
    idlePollMs: 1_000,
    leaseSeconds: 120,
    maxAttempts: 10,
  },
  auth: {
    identityTokenTtlSeconds: 300,
    sessionTtlSeconds: 2_592_000,
    testPhonePattern: "^\\+2340000000\\d{3}$",
  },
  sim: {
    yellowcard: {
      buyNgnPerUsd: "1600",
      sellNgnPerUsd: "1550",
      settleSeconds: 5,
      collectionTtlMinutes: 240,
      payinFeeBelowKobo: 10_000_000n,
      payinFeeBelowBps: 100,
      payinFeeBelowMinKobo: 5_500n,
      payinFeeAboveBps: 50,
      payinFeeAboveMinKobo: 135_000n,
      payoutFeeKobo: 10_000n,
    },
    paycrest: {
      buyNgnPerUsd: "1610",
      sellNgnPerUsd: "1540",
      feeMicroUsd: 0n,
      minMicroUsd: 500_000n,
      settleSeconds: 5,
    },
    chain: {
      confirmSeconds: { base: 4, solana: 2 },
    },
  },
} as const;

export type Policy = typeof policy;
