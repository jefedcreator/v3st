import { db } from "@/server/db";

import type { TestnetManifest } from "./testnet";

export async function persistNetwork(manifest: TestnetManifest): Promise<void> {
  await db.onchainNetwork.upsert({
    where: { deploymentId: manifest.deploymentId },
    create: {
      networkId: manifest.networkId,
      chainId: manifest.chainId,
      kind: manifest.integrationKind,
      genesisHash: manifest.genesisHash,
      deploymentId: manifest.deploymentId,
      label: manifest.label,
      rpcLoopback: true,
    },
    update: { networkId: manifest.networkId, genesisHash: manifest.genesisHash },
  });
}

export async function loadNetworkByDeployment(deploymentId: string) {
  return db.onchainNetwork.findUnique({ where: { deploymentId } });
}

export async function loadNetworkByNetworkId(networkId: string) {
  return db.onchainNetwork.findUnique({ where: { networkId } });
}
