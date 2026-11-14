import { createHash } from "node:crypto";

import { env } from "@/env";
import { sha256Hex } from "@/utils";

import { createSimulatedRampProvider } from "../simulated";
import type { Chain, RampProvider, WebhookHint } from "../types";
import { keyFromRef } from "@/backend/services/simulator/ramp";
import { verifyPaycrestSignature } from "./webhook";

export function paycrestSimAddress(chain: Chain): string {
  if (chain === "solana") {
    return `pc${createHash("sha256").update(`paycrest:sim:${chain}`).digest("hex").slice(0, 32)}`;
  }
  return `0x${sha256Hex(`paycrest:sim:${chain}`).slice(0, 40)}`;
}

export function paycrestFundingAddress(chain: Chain, key: string): string {
  if (chain === "solana") {
    return `pc${createHash("sha256")
      .update(`paycrest:funding:${chain}:${key}`)
      .digest("hex")
      .slice(0, 32)}`;
  }
  return `0x${sha256Hex(`paycrest:funding:${chain}:${key}`).slice(0, 40)}`;
}

export function paycrestSettleKey(key: string): string {
  return `paycrest:settle:${key}`;
}

export function paycrestRefundKey(key: string): string {
  return `paycrest:refund:${key}`;
}

export function createPaycrestProvider(): RampProvider {
  const base = createSimulatedRampProvider("paycrest");
  return {
    ...base,
    verifyWebhook(headers: Headers, rawBody: Uint8Array): boolean {
      const secret = env.PAYCREST_SIM_WEBHOOK_SECRET;
      if (!secret) return false;
      return verifyPaycrestSignature(headers, rawBody, secret);
    },
    parseWebhook(rawBody: Uint8Array): WebhookHint {
      const payload = JSON.parse(new TextDecoder().decode(rawBody)) as {
        event?: string;
        data?: { id?: string; status?: string };
      };
      const id = String(payload.data?.id ?? "");
      const status = String(payload.data?.status ?? "");
      return {
        eventKey: `${id}:${status}`,
        ref: id,
        key: keyFromRef(id),
        direction: null,
        event: String(payload.event ?? ""),
      };
    },
  };
}
