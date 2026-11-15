import { type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { now } from "@/backend/clock";
import type { OnchainOperation } from "@/server/prisma";
import { db } from "@/server/db";
import { RetryableError } from "@/backend/services/jobs/types";
import {
  loadArtifact,
  publicClientFor,
  readManifest,
  relayerAccount,
  testnetService,
  walletClientFor,
} from "@/backend/services/onchain/testnet";
import type { ExecutionObservation } from "@/backend/services/onchain/types";
import {
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@/utils/exceptions";

import { BANKR_SCHEMA_VERSION, type BankrSwapEnvelope } from "./schemas";

export const BANKR_GATEWAY_TIMEOUT = "BANKR_GATEWAY_TIMEOUT";

// Local replica of Bankr's managed-wallet gateway. It always uses the loopback
// testnet execution path; Bankr's real hostname is never contacted in beta.
export class BankrGatewayReplica {
  // Stays empty by design: the actual provider factory is disabled until verified
  // testnet evidence exists.
  readonly realProviderCalls: string[] = [];

  // Provisions one managed account per synthetic customer plus a scoped server-key
  // reference. The server key is ephemeral: only its address-derived reference is
  // persisted, never the key itself, and Privy keys are never exported or imported.
  async provision(ownerKey: string): Promise<{ custodyProfileId: string; walletId: string }> {
    const wallet = await db.wallet.findUnique({
      where: { userId_family: { userId: ownerKey, family: "evm" } },
    });
    if (!wallet) throw new NotFoundException("Owner wallet not provisioned", "WALLET_NOT_READY");
    const manifest = readManifest();
    const verified = await testnetService.verify(manifest);
    if (!verified.ok) {
      throw new ServiceUnavailableException(`Testnet unavailable: ${verified.reason}`, "NETWORK_UNHEALTHY");
    }
    const existing = await db.custodyProfile.findUnique({ where: { kind_walletId: { kind: "provider_managed", walletId: wallet.id } } });
    if (existing) {
      if (existing.deploymentId !== manifest.deploymentId) throw new ServiceUnavailableException("Managed account deployment requires restore", "NETWORK_UNHEALTHY");
      return { custodyProfileId: existing.id, walletId: wallet.id };
    }
    const serverKey = privateKeyToAccount(generatePrivateKey());
    const relayer = relayerAccount();
    const walletClient = walletClientFor(relayer);
    const artifact = loadArtifact("TestExecutionAccount");
    const hash = await walletClient.deployContract({
      abi: artifact.abi as never,
      bytecode: artifact.bytecode as Hex,
      args: [serverKey.address, relayer.address],
    });
    const receipt = await publicClientFor().waitForTransactionReceipt({ hash });
    if (!receipt.contractAddress) {
      throw new ServiceUnavailableException("Managed account deployment failed", "NETWORK_UNHEALTHY");
    }
    const profile = await db.custodyProfile.upsert({
      where: { kind_walletId: { kind: "provider_managed", walletId: wallet.id } },
      create: {
        kind: "provider_managed",
        label: `bankr managed account for ${ownerKey}`,
        walletId: wallet.id,
        externalProfileId: `bankr-server-key:${serverKey.address.toLowerCase()}`,
        managedAddress: receipt.contractAddress,
        deploymentId: manifest.deploymentId,
      },
      update: {},
    });
    return { custodyProfileId: profile.id, walletId: wallet.id };
  }

  private async assertBankrOperation(operationId: string): Promise<OnchainOperation> {
    const op = await db.onchainOperation.findUniqueOrThrow({ where: { id: operationId } });
    if (op.providerId !== "bankr") {
      throw new UnprocessableEntityException("Operation is not routed to the Bankr gateway", "CAPABILITY_UNAVAILABLE");
    }
    const profile = await db.custodyProfile.findUnique({ where: { id: op.custodyProfileId } });
    if (profile?.kind !== "provider_managed" || !profile.managedAddress) {
      throw new UnprocessableEntityException(
        "Ordinary application-account orders cannot route through the Bankr gateway",
        "CAPABILITY_UNAVAILABLE",
      );
    }
    return op;
  }

  // A timeout/ambiguous gateway response is unresolved: the original operation and
  // its signed hash are kept, and onchain evidence is reconciled (lookup) before any
  // resend. Replaying the same operation UUID never creates a new economic action.
  async submit(operationId: string): Promise<{ txHash: Hex }> {
    const op = await this.assertBankrOperation(operationId);
    const fault = await db.simFault.findUnique({
      where: { scope_key: { scope: "bankr.gateway.submit", key: op.key } },
    });
    if (fault && !fault.consumedAt) {
      await db.simFault.update({
        where: { scope_key: { scope: "bankr.gateway.submit", key: op.key } },
        data: { consumedAt: now() },
      });
      throw new RetryableError(BANKR_GATEWAY_TIMEOUT, 1_000);
    }
    const { executionService } = await import("@/backend/services/execution");
    await executionService.progress(operationId);
    const reloaded = await db.onchainOperation.findUniqueOrThrow({ where: { id: operationId } });
    if (!reloaded.txHash) {
      throw new ServiceUnavailableException("Gateway response unresolved", "OPERATION_UNRESOLVED");
    }
    return { txHash: reloaded.txHash as Hex };
  }

  async lookup(operationId: string): Promise<ExecutionObservation> {
    await this.assertBankrOperation(operationId);
    const { executionService } = await import("@/backend/services/execution");
    return executionService.observe(operationId);
  }

  // Wraps submit + lookup in the synthetic Bankr Wallet API envelope. The envelope
  // always carries HTTP 200; success:false marks reverts and unresolved responses.
  async swap(operationId: string): Promise<BankrSwapEnvelope> {
    const op = await this.assertBankrOperation(operationId);
    const { txHash } = await this.submit(operationId);
    const observation = await this.lookup(operationId);
    if (observation.state === "confirmed") {
      return {
        httpStatus: 200,
        body: {
          schemaVersion: BANKR_SCHEMA_VERSION,
          success: true,
          operationId: op.key,
          status: "submitted",
          txHash,
        },
      };
    }
    if (observation.state === "reverted") {
      return {
        httpStatus: 200,
        body: {
          schemaVersion: BANKR_SCHEMA_VERSION,
          success: false,
          operationId: op.key,
          status: "reverted",
          txHash,
          error: "execution reverted onchain",
        },
      };
    }
    return {
      httpStatus: 200,
      body: {
        schemaVersion: BANKR_SCHEMA_VERSION,
        success: false,
        operationId: op.key,
        status: "unresolved",
        txHash,
        error: "ambiguous gateway response; reconcile onchain evidence before any resend",
      },
    };
  }
}

export const bankrReplicaGateway = new BankrGatewayReplica();
