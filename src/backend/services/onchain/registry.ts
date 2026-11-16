import { assertOnchainContext, OnchainPolicyError } from "@/backend/integrations/onchain-policy";
import { getProviderEvidence } from "@/backend/integrations/provider-evidence";
import { HttpException } from "@/utils/exceptions";


import type {
  BetaContext,
  ProviderCapabilities,
  SpotAdapter,
  StockProviderId,
  StrategyAdapter,
} from "./types";

export class UnsupportedCapabilityError extends HttpException {
  constructor(message: string) {
    super(message, 422, "CAPABILITY_UNAVAILABLE");
  }
}

export class UnverifiedProviderError extends HttpException {
  constructor(message: string) {
    super(message, 503, "PROVIDER_UNVERIFIED");
  }
}

type AdapterFactory = {
  spot?: () => SpotAdapter;
  strategy?: () => StrategyAdapter;
  actual?: () => never;
  // Real provider adapters for a verified provider testnet; only registered for
  // providers whose evidence is verified (hydrex on Base Sepolia in Phase A).
  verified?: { spot?: () => SpotAdapter; strategy?: () => StrategyAdapter };
};

class OnchainRegistry {
  private readonly adapters = new Map<StockProviderId, AdapterFactory>();
  actualFactoryCalls = 0;

  register(id: StockProviderId, factory: AdapterFactory): void {
    this.adapters.set(id, factory);
  }

  private resolve(id: StockProviderId, context: BetaContext): AdapterFactory {
    assertOnchainContext(context);
    if (context.providerId !== id) {
      throw new OnchainPolicyError(
        `Context provider ${context.providerId} does not match requested adapter ${id}`,
      );
    }
    const evidence = getProviderEvidence(id);
    if (evidence.betaAdapter !== "local_testnet_replica") {
      throw new UnverifiedProviderError(`Provider ${id} has no enabled beta adapter`);
    }
    const factory = this.adapters.get(id);
    if (!factory) {
      throw new UnsupportedCapabilityError(`No adapter registered for provider ${id}`);
    }
    if (context.integrationKind === "verified_provider_testnet" && !factory.verified) {
      throw new UnverifiedProviderError(
        `Provider ${id} has no verified testnet evidence; only local_testnet_replica is enabled`,
      );
    }
    return factory;
  }

  private checkCapabilities(
    capabilities: ProviderCapabilities,
    kind: "spot" | "strategy",
    context: BetaContext,
  ): void {
    if (capabilities.kind !== context.integrationKind) {
      throw new UnsupportedCapabilityError(
        `Adapter ${capabilities.id} is ${capabilities.kind}, context is ${context.integrationKind}`,
      );
    }
    if (kind === "spot" && !capabilities.spot) {
      throw new UnsupportedCapabilityError(`Provider ${capabilities.id} has no spot capability`);
    }
    if (kind === "strategy" && !capabilities.distributions && !capabilities.liquidity) {
      throw new UnsupportedCapabilityError(`Provider ${capabilities.id} has no strategy capability`);
    }
  }

  spot(id: StockProviderId, context: BetaContext): SpotAdapter {
    const factory = this.resolve(id, context);
    if (context.integrationKind === "verified_provider_testnet") {
      if (!factory.verified?.spot) {
        throw new UnverifiedProviderError(`Provider ${id} exposes no verified testnet spot adapter`);
      }
      this.actualFactoryCalls += 1;
      const adapter = factory.verified.spot();
      this.checkCapabilities(adapter.capabilities, "spot", context);
      return adapter;
    }
    if (!factory.spot) {
      throw new UnsupportedCapabilityError(`Provider ${id} exposes no spot adapter in beta`);
    }
    const adapter = factory.spot();
    this.checkCapabilities(adapter.capabilities, "spot", context);
    return adapter;
  }

  strategy(id: StockProviderId, context: BetaContext): StrategyAdapter {
    const factory = this.resolve(id, context);
    if (context.integrationKind === "verified_provider_testnet") {
      if (!factory.verified?.strategy) {
        throw new UnverifiedProviderError(`Provider ${id} exposes no verified testnet strategy adapter`);
      }
      this.actualFactoryCalls += 1;
      const adapter = factory.verified.strategy();
      this.checkCapabilities(adapter.capabilities, "strategy", context);
      return adapter;
    }
    if (!factory.strategy) {
      throw new UnsupportedCapabilityError(`Provider ${id} exposes no strategy adapter in beta`);
    }
    const adapter = factory.strategy();
    this.checkCapabilities(adapter.capabilities, "strategy", context);
    return adapter;
  }

  describe(id: StockProviderId, kind: IntegrationKindLabel): ProviderCapabilities | null {
    const factory = this.adapters.get(id);
    if (!factory) return null;
    const adapter = kind === "spot" ? factory.spot?.() : factory.strategy?.();
    return adapter ? adapter.capabilities : null;
  }
}

type IntegrationKindLabel = "spot" | "strategy";

export const onchainRegistry = new OnchainRegistry();
