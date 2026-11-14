import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";

import { createPublicClient, createWalletClient, custom, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { assertChainIdAllowed, parseRpcEndpoint } from "@/backend/integrations/onchain-policy";
import type { BetaContext, StockProviderId } from "@/backend/services/onchain/types";
import { sha256Hex } from "@/utils";

export const TESTNET_CHAIN_ID = 31337;

export type ContractArtifact = { abi: unknown; bytecode: string };

export type TestnetManifest = {
  networkId: string;
  chainId: number;
  genesisHash: Hex;
  deploymentId: string;
  label: string;
  integrationKind: "local_testnet_replica";
  mode: "simulated";
  rpcUrl: string;
  relayerAddress: Address;
  contracts: Record<string, { address: Address; abiHash: string }>;
  createdAt: string;
};

export class TestnetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TestnetError";
  }
}

export function testnetRpcUrl(): string {
  return process.env.TESTNET_RPC_URL ?? "http://127.0.0.1:8545";
}

export function rpcRequest<T = unknown>(url: string, method: string, params: unknown[] = []): Promise<T> {
  const endpoint = parseRpcEndpoint(url);
  return new Promise<T>((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const req = http.request(
      endpoint.url,
      { method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
              result?: T;
              error?: { message: string };
            };
            if (parsed.error) reject(new TestnetError(`RPC ${method} failed: ${parsed.error.message}`));
            else resolve(parsed.result as T);
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on("error", reject);
    req.setTimeout(15_000, () => req.destroy(new TestnetError(`RPC ${method} timed out`)));
    req.write(body);
    req.end();
  });
}

export function localChain() {
  const rpcUrl = testnetRpcUrl();
  return {
    id: TESTNET_CHAIN_ID,
    name: "v3st-local-anvil",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  } as const;
}

export function publicClientFor(url: string = testnetRpcUrl()) {
  return createPublicClient({
    chain: localChain(),
    transport: custom({
      async request({ method, params }) {
        return rpcRequest(url, method, params as unknown[]);
      },
    }),
  });
}

export function relayerAccount(): ReturnType<typeof privateKeyToAccount> {
  const key = process.env.TESTNET_SIGNER_PRIVATE_KEY;
  if (key) return privateKeyToAccount(key as Hex);
  return privateKeyToAccount(generatePrivateKey());
}

export function walletClientFor(account: ReturnType<typeof privateKeyToAccount>, url: string = testnetRpcUrl()) {
  return createWalletClient({
    account,
    chain: localChain(),
    transport: custom({
      async request({ method, params }) {
        return rpcRequest(url, method, params as unknown[]);
      },
    }),
  });
}

export function findAnvilBinary(): string {
  const candidates = [
    process.env.ANVIL_BIN,
    path.join(process.env.HOME ?? "", "tools", "anvil"),
    path.join(process.env.HOME ?? "", ".foundry", "bin", "anvil"),
    "anvil",
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    if (candidate === "anvil") return candidate;
    if (existsSync(candidate)) return candidate;
  }
  return "anvil";
}

export async function waitForRpc(url: string, attempts = 60): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const chainId = await rpcRequest<Hex>(url, "eth_chainId");
      assertChainIdAllowed(Number(BigInt(chainId)));
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new TestnetError(`Local testnet RPC at ${url} did not become ready`);
}

export function startAnvil(opts?: { port?: number; rpcUrl?: string }): ChildProcess {
  const url = opts?.rpcUrl ?? testnetRpcUrl();
  const parsed = new URL(url);
  const port = opts?.port ?? Number(parsed.port || 8545);
  const child = spawn(
    findAnvilBinary(),
    [
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--chain-id",
      String(TESTNET_CHAIN_ID),
      "--silent",
    ],
    { stdio: ["ignore", "pipe", "pipe"], detached: false },
  );
  child.on("error", (error) => {
    throw new TestnetError(`Failed to start anvil: ${error.message}`);
  });
  return child;
}

export function loadArtifact(name: string): ContractArtifact {
  const candidates = [
    path.join(process.cwd(), "build", "foundry", "out", `${name}.sol`, `${name}.json`),
    path.join(process.cwd(), "out", `${name}.sol`, `${name}.json`),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      const raw = JSON.parse(readFileSync(candidate, "utf8")) as {
        abi: unknown;
        bytecode?: { object?: string } | string;
      };
      const bytecode = typeof raw.bytecode === "string" ? raw.bytecode : raw.bytecode?.object;
      if (!bytecode || bytecode === "0x") {
        throw new TestnetError(`Artifact ${name} has no bytecode; run forge build first`);
      }
      return { abi: raw.abi, bytecode: bytecode.startsWith("0x") ? (bytecode as string) : `0x${bytecode}` };
    }
  }
  throw new TestnetError(`Artifact ${name} not found; run forge build first`);
}

export function abiHash(abi: unknown): string {
  return sha256Hex(JSON.stringify(abi)).slice(0, 16);
}

export function manifestDir(): string {
  return path.join(process.cwd(), ".testnet");
}

export function manifestPath(): string {
  return path.join(manifestDir(), "manifest.json");
}

export function readManifest(): TestnetManifest {
  const file = manifestPath();
  if (!existsSync(file)) {
    throw new TestnetError("No testnet manifest; run yarn testnet:deploy first");
  }
  return JSON.parse(readFileSync(file, "utf8")) as TestnetManifest;
}

function writeManifest(manifest: TestnetManifest): void {
  mkdirSync(manifestDir(), { recursive: true });
  writeFileSync(manifestPath(), JSON.stringify(manifest, null, 2));
  writeFileSync(path.join(manifestDir(), `manifest-${manifest.deploymentId}.json`), JSON.stringify(manifest, null, 2));
}

export type DeployContractSpec = { name: string; artifact: string; args: unknown[] };

class TestnetService {
  async isReachable(url: string = testnetRpcUrl()): Promise<boolean> {
    try {
      const chainId = await rpcRequest<Hex>(url, "eth_chainId");
      return Number(BigInt(chainId)) === TESTNET_CHAIN_ID;
    } catch {
      return false;
    }
  }

  async chainIdentity(url: string = testnetRpcUrl()): Promise<{ chainId: number; genesisHash: Hex }> {
    const chainIdHex = await rpcRequest<Hex>(url, "eth_chainId");
    const chainId = Number(BigInt(chainIdHex));
    assertChainIdAllowed(chainId);
    const genesis = await rpcRequest<{ hash: Hex }>(url, "eth_getBlockByNumber", ["0x0", false]);
    return { chainId, genesisHash: genesis.hash };
  }

  async fundEphemeral(account: ReturnType<typeof privateKeyToAccount>, url: string = testnetRpcUrl()): Promise<void> {
    const version = await rpcRequest<string>(url, "web3_clientVersion");
    if (!/anvil/i.test(version)) {
      throw new TestnetError("Ephemeral signer funding requires a local anvil node");
    }
    await rpcRequest(url, "anvil_setBalance", [account.address, `0x${(10n ** 24n).toString(16)}`]);
  }

  async deploy(specs: DeployContractSpec[], opts?: { url?: string; label?: string }): Promise<TestnetManifest> {
    const url = opts?.url ?? testnetRpcUrl();
    const { chainId, genesisHash } = await this.chainIdentity(url);
    const account = relayerAccount();
    if (!process.env.TESTNET_SIGNER_PRIVATE_KEY) {
      await this.fundEphemeral(account, url);
    }
    const client = walletClientFor(account, url);
    const publicClient = publicClientFor(url);
    const contracts: TestnetManifest["contracts"] = {};
    for (const spec of specs) {
      const artifact = loadArtifact(spec.artifact);
      const hash = await client.deployContract({
        abi: artifact.abi as never,
        bytecode: artifact.bytecode as Hex,
        args: spec.args as never,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const address = receipt.contractAddress;
      if (!address) throw new TestnetError(`Deployment of ${spec.name} produced no address`);
      contracts[spec.name] = { address, abiHash: abiHash(artifact.abi) };
    }
    const deploymentId = sha256Hex(
      JSON.stringify({ genesisHash, chainId, contracts: Object.keys(contracts).sort().map((k) => [k, contracts[k]!.address, contracts[k]!.abiHash]) }),
    ).slice(0, 24);
    const manifest: TestnetManifest = {
      networkId: `testnet:${chainId}:${genesisHash.slice(0, 12)}`,
      chainId,
      genesisHash,
      deploymentId,
      label: opts?.label ?? "isolated local anvil",
      integrationKind: "local_testnet_replica",
      mode: "simulated",
      rpcUrl: url,
      relayerAddress: account.address,
      contracts,
      createdAt: new Date().toISOString(),
    };
    writeManifest(manifest);
    return manifest;
  }

  async verify(manifest: TestnetManifest, url: string = testnetRpcUrl()): Promise<{ ok: boolean; reason?: string }> {
    try {
      parseRpcEndpoint(url);
    } catch {
      return { ok: false, reason: "RPC endpoint is not loopback" };
    }
    const { chainId, genesisHash } = await this.chainIdentity(url);
    if (chainId !== manifest.chainId) return { ok: false, reason: `chain id ${chainId} != ${manifest.chainId}` };
    if (genesisHash !== manifest.genesisHash) {
      return { ok: false, reason: "genesis hash mismatch: local chain was reset or redeployed" };
    }
    for (const [name, entry] of Object.entries(manifest.contracts)) {
      const code = await rpcRequest<Hex>(url, "eth_getCode", [entry.address, "latest"]);
      if (!code || code === "0x") return { ok: false, reason: `contract ${name} missing at ${entry.address}` };
    }
    return { ok: true };
  }

  async defaultContext(
    providerId: StockProviderId,
    providerVersion: string,
    custodyProfileId: string,
  ): Promise<BetaContext> {
    const manifest = readManifest();
    const verified = await this.verify(manifest);
    if (!verified.ok) throw new TestnetError(`Testnet verification failed: ${verified.reason}`);
    return {
      stage: "beta",
      mode: "simulated",
      integrationKind: "local_testnet_replica",
      networkId: manifest.networkId,
      chainId: manifest.chainId,
      deploymentId: manifest.deploymentId,
      providerId,
      providerVersion,
      custodyProfileId,
    };
  }
}

export const testnetService = new TestnetService();

export function settlementAssetKey(manifest: TestnetManifest): string {
  const entry = manifest.contracts.TestSettlementToken;
  if (!entry) throw new TestnetError("Manifest has no TestSettlementToken");
  return `testnet:${manifest.chainId}:${entry.address.toLowerCase()}`;
}

export function stockAssetKey(manifest: TestnetManifest, address: Address): string {
  return `testnet:${manifest.chainId}:${address.toLowerCase()}`;
}

export function deploymentFingerprint(manifest: TestnetManifest): string {
  return createHash("sha256")
    .update(JSON.stringify({ networkId: manifest.networkId, deploymentId: manifest.deploymentId, contracts: manifest.contracts }))
    .digest("hex");
}
