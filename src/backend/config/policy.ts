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
  onchain: {
    chainId: 31337,
    networkNamespace: "testnet",
    requiredConfirmations: 2,
    confirmations: { 31337: 2, 84532: 3, 8453: 5 } as Record<number, number>,
    quoteTtlSeconds: 30,
    executionWindowSeconds: 120,
    referenceMaxAgeSeconds: 60,
    maxPriceImpactBps: 100,
    authorizationMaxDays: 30,
    strategy: {
      capBps: 2000,
      maxUsdEquivalentMicroUsd: 100_000_000n,
    },
    sponsor: {
      dailyCapWei: 10n ** 21n,
      perOperationCapWei: 10n ** 19n,
      // Per-network overrides; chains not listed keep the defaults above.
      byChain: {
        84532: { dailyCapWei: 2n * 10n ** 16n, perOperationCapWei: 2n * 10n ** 15n },
      } as Record<number, { dailyCapWei: bigint; perOperationCapWei: bigint }>,
    },
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
    referenceSyncSeconds: 30,
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
  app: {
    policyVersion: "app-2026-11-17",
    privy: {
      reauthMaxAgeSeconds: 300,
      simulatedAppId: "v3st-simulated",
    },
    pin: {
      digits: 4,
      maxFailures: 5,
      lockSeconds: 1_800,
      saltBytes: 16,
      scrypt: { N: 16_384, r: 8, p: 1, keyLength: 32 },
    },
    orders: {
      lifetimeSeconds: 259_200,
      priceProtectionBps: 300,
      previewSeconds: 300,
      minBuyKobo: 100_000n,
      consent: { maxFeeBps: 100, maxSlippageBps: 100 },
    },
    earn: {
      minKobo: 500_000n,
      automation: {
        actions: ["claim", "reward_conversion"],
        perActionCapKobo: 50_000_000n,
        totalCapKobo: 2_000_000_000n,
        expiryDays: 30,
        renewReminderDays: 5,
      },
    },
    earnings: {
      maxConversionFeeBps: 100,
      maxFxBps: 200,
      allowBackgroundConversion: true,
      consentVersion: "app-2026-11-17",
    },
    keeper: {
      slotSeconds: 300,
      bandBps: 50,
      maxSpendMicroUsd: 5_000_000_000n,
    },
    sweepSeconds: 60,
    notificationsSlotSeconds: 15,
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
      confirmSeconds: { base: 4, solana: 2, testnet: 2 },
    },
  },
} as const;

export type Policy = typeof policy;
