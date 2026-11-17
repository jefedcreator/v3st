import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";

import { type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

import { __resetChainClientsForTests, __setRpcTransportForTests, chainObject, walletClientOn } from "@/backend/services/onchain/chains";
import { loadArtifact, manifestDir, rpcRequest } from "@/backend/services/onchain/testnet";
import type { NetworkManifest } from "@/backend/services/onchain/manifests";
import { db } from "@/server/db";
import { sha256Hex } from "@/utils";

export type RpcCall = { chainId: number; url: string; method: string };

export type SepoliaShapedNode = {
  loopbackUrl: string;
  relayer: Address;
  settlement: Address;
  calls: RpcCall[];
  stop(): Promise<void>;
};

function rawRpc(url: string, method: string, params: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
    const req = http.request(
      url,
      { method: "POST", headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as {
              result?: unknown;
              error?: { message: string };
            };
            if (parsed.error) reject(new Error(parsed.error.message));
            else resolve(parsed.result);
          } catch (error) {
            reject(error instanceof Error ? error : new Error("Invalid RPC response"));
          }
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// Asks the OS for a free loopback port. A random port in a fixed range can collide
// with an ephemeral port already in use, and Anvil then exits instead of listening.
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => (port > 0 ? resolve(port) : reject(new Error("No free port"))));
    });
  });
}

async function waitForNode(url: string, child: ChildProcess): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) {
      throw new Error(`Sepolia-shaped node at ${url} exited with code ${child.exitCode} before it was ready`);
    }
    try {
      await rawRpc(url, "eth_chainId", []);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Sepolia-shaped node at ${url} did not become ready`);
}

// Starts Anvil on a free port, retrying with a fresh port if it exits or never
// answers (another process can take the port between the check and the bind).
async function startNode(): Promise<{ child: ChildProcess; loopbackUrl: string }> {
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const port = await freePort();
    const loopbackUrl = `http://127.0.0.1:${port}`;
    const child: ChildProcess = spawn(
      "anvil",
      ["--host", "127.0.0.1", "--port", String(port), "--chain-id", "84532", "--block-time", "1", "--silent"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    child.stdout?.resume();
    child.stderr?.resume();
    try {
      await waitForNode(loopbackUrl, child);
      return { child, loopbackUrl };
    } catch (error) {
      lastError = error;
      child.kill("SIGKILL");
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Sepolia-shaped node did not start");
}

// Starts a loopback Anvil with chain ID 84532 and wires the shared RPC test
// transport so every chain-84532 call is forwarded to it as raw JSON-RPC while
// the configured Base Sepolia URL (https://sepolia.v3st.test) stays the target
// of record. Deploys TestSettlementToken and writes the Base Sepolia manifest.
export async function startSepoliaShapedNode(): Promise<SepoliaShapedNode> {
  const { child, loopbackUrl } = await startNode();

  const previousRpcUrl = process.env.BASE_SEPOLIA_RPC_URL;
  const previousRelayerKey = process.env.BASE_SEPOLIA_RELAYER_PRIVATE_KEY;
  const relayerKey = generatePrivateKey();
  const relayer = privateKeyToAccount(relayerKey);
  process.env.BASE_SEPOLIA_RPC_URL = "https://sepolia.v3st.test";
  process.env.BASE_SEPOLIA_RELAYER_PRIVATE_KEY = relayerKey;
  await rawRpc(loopbackUrl, "anvil_setBalance", [relayer.address, `0x${(10n ** 24n).toString(16)}`]);

  const calls: RpcCall[] = [];
  __setRpcTransportForTests((url, chainId, method, params) => {
    calls.push({ chainId, url, method });
    if (chainId === 84532) return rawRpc(loopbackUrl, method, params);
    return rpcRequest(url, chainId, method, params);
  });

  const artifact = loadArtifact("TestSettlementToken");
  const walletClient = walletClientOn(84532);
  const hash = await walletClient.deployContract({
    account: relayer,
    chain: chainObject(84532),
    abi: artifact.abi as never,
    bytecode: artifact.bytecode as Hex,
    args: ["V3ST Test USDC", "tUSDC", 6],
  });
  const { publicClientOn } = await import("@/backend/services/onchain/chains");
  const publicClient = publicClientOn(84532);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const settlement = receipt.contractAddress!;
  const code = (await rawRpc(loopbackUrl, "eth_getCode", [settlement, "latest"])) as string;
  const genesis = (await rawRpc(loopbackUrl, "eth_getBlockByNumber", ["0x0", false])) as { hash: Hex };
  const deploymentId = createHash("sha256")
    .update(JSON.stringify({ genesisHash: genesis.hash, chainId: 84532, contracts: ["TestSettlementToken"] }))
    .digest("hex")
    .slice(0, 24);
  const manifest: NetworkManifest = {
    networkId: "basesepolia:84532",
    chainId: 84532,
    genesisHash: genesis.hash,
    deploymentId,
    label: "Base Sepolia shaped local node (tests)",
    integrationKind: "verified_provider_testnet",
    mode: "sandbox",
    rpcUrl: "https://sepolia.v3st.test",
    relayerAddress: relayer.address,
    contracts: {
      TestSettlementToken: { address: settlement, abiHash: sha256Hex("TestSettlementToken").slice(0, 16), codeHash: sha256Hex(code) },
    },
    external: {},
    createdAt: new Date().toISOString(),
  };
  const dir = path.join(manifestDir(), "base-sepolia");
  mkdirSync(dir, { recursive: true });
  const manifestFile = path.join(dir, "manifest.json");
  const hadManifest = existsSync(manifestFile);
  const previousManifest = hadManifest ? readFileSync(manifestFile, "utf8") : null;
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));

  await db.onchainNetwork.upsert({
    where: { deploymentId },
    create: {
      networkId: manifest.networkId,
      chainId: 84532,
      kind: "verified_provider_testnet",
      genesisHash: manifest.genesisHash,
      deploymentId,
      label: manifest.label,
      rpcLoopback: false,
    },
    update: { networkId: manifest.networkId, genesisHash: manifest.genesisHash },
  });

  return {
    loopbackUrl,
    relayer: relayer.address,
    settlement,
    calls,
    async stop() {
      __setRpcTransportForTests(null);
      __resetChainClientsForTests();
      if (previousRpcUrl === undefined) delete process.env.BASE_SEPOLIA_RPC_URL;
      else process.env.BASE_SEPOLIA_RPC_URL = previousRpcUrl;
      if (previousRelayerKey === undefined) delete process.env.BASE_SEPOLIA_RELAYER_PRIVATE_KEY;
      else process.env.BASE_SEPOLIA_RELAYER_PRIVATE_KEY = previousRelayerKey;
      if (hadManifest && previousManifest !== null) writeFileSync(manifestFile, previousManifest);
      else rmSync(manifestFile, { force: true });
      child.kill("SIGTERM");
    },
  };
}
