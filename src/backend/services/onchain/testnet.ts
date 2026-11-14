import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";

import { createPublicClient, createWalletClient, custom, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { now } from "@/backend/clock";
import { policy } from "@/backend/config/policy";
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
  data?: unknown;

  constructor(message: string, data?: unknown) {
    super(message);
    this.name = "TestnetError";
    this.data = data;
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
            if (parsed.error) {
              reject(
                new TestnetError(
                  `RPC ${method} failed: ${parsed.error.message}`,
                  (parsed.error as { data?: unknown }).data,
                ),
              );
            } else resolve(parsed.result as T);
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
    pollingInterval: 250,
    cacheTime: 0,
    chain: localChain(),
    transport: custom({
      async request({ method, params }) {
        return rpcRequest(url, method, params as unknown[]);
      },
    }),
  });
}

// Onchain deadlines must be derived from the chain clock, not the wall clock: on the
// local testnet rapid block mining can run block.timestamp ahead of wall time.
export async function chainDeadlineFromNow(extraSeconds?: number): Promise<Date> {
  const block = await publicClientFor().getBlock({ blockTag: "latest" });
  const window = extraSeconds ?? policy.onchain.executionWindowSeconds;
  return new Date((Number(block.timestamp) + window) * 1000);
}

// The quote expiry is the latest permitted acceptance and broadcast bound, so a
// plan/contract deadline is derived from the chain clock but never extends past it.
export async function chainDeadlineBounded(latestMs: number, extraSeconds?: number): Promise<Date> {
  const chainDeadline = await chainDeadlineFromNow(extraSeconds);
  return new Date(Math.min(chainDeadline.getTime(), latestMs));
}

export async function chainNowMs(): Promise<number> {
  const block = await publicClientFor().getBlock({ blockTag: "latest" });
  return Number(block.timestamp) * 1000;
}

// Onchain quote expiry anchors to the later of the app and chain clocks: the
// contract deadline copied from this expiry is enforced against block.timestamp,
// while acceptance checks compare it against the app clock, so the bound must
// satisfy both (rapid local mining can run the chain clock ahead of the wall
// clock, and evm_revert can run it behind).
export async function onchainExpiryMs(ttlSeconds: number): Promise<number> {
  const chain = await chainNowMs();
  return Math.max(now().getTime(), chain) + ttlSeconds * 1000;
}

// Test signing keys live in a restricted local keystore per deployment directory,
// never only in process memory: a restart reloads the same account owner, and a
// missing key with an existing deployment holds the deployment instead of
// silently assigning a new owner.
export function keystorePath(dir: string = manifestDir()): string {
  return path.join(dir, "relayer-key.json");
}

export function keystoreRelayerKey(dir: string = manifestDir()): Hex {
  const file = keystorePath(dir);
  if (existsSync(file)) {
    const raw = JSON.parse(readFileSync(file, "utf8")) as { privateKey?: string };
    if (!raw.privateKey) throw new TestnetError("Relayer keystore entry is malformed");
    return raw.privateKey as Hex;
  }
  if (existsSync(path.join(dir, "manifest.json"))) {
    throw new TestnetError(
      "Relayer key missing for an existing deployment; holding the deployment instead of reassigning the account owner",
    );
  }
  const key = generatePrivateKey();
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify({ privateKey: key, createdAt: new Date().toISOString() }, null, 2), {
    mode: 0o600,
  });
  chmodSync(file, 0o600);
  return key;
}

export function relayerAccount(): ReturnType<typeof privateKeyToAccount> {
  const key = process.env.TESTNET_SIGNER_PRIVATE_KEY;
  if (key) return privateKeyToAccount(key as Hex);
  return privateKeyToAccount(keystoreRelayerKey());
}

export function walletClientFor(account: ReturnType<typeof privateKeyToAccount>, url: string = testnetRpcUrl()) {
  return createWalletClient({
    account,
    pollingInterval: 250,
    cacheTime: 0,
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
      return { abi: raw.abi, bytecode: bytecode.startsWith("0x") ? (bytecode) : `0x${bytecode}` };
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
        args: spec.args,
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
