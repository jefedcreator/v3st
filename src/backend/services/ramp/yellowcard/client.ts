import { createHash, createHmac } from "node:crypto";

import {
  assertAllowedUrl,
  YELLOWCARD_SANDBOX_URL,
} from "@/backend/integrations/beta-policy";
import { parseProviderJson } from "@/utils/money";

import { ProviderError } from "../errors";

export type YellowCardClientOpts = {
  apiKey: string;
  secret: string;
  fetch?: typeof fetch;
  clock?: () => Date;
  timeoutMs?: number;
};

function safeJson(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = parseProviderJson(text);
    if (parsed !== null && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

export function createYellowCardClient(opts: YellowCardClientOpts) {
  const fetchFn = opts.fetch ?? globalThis.fetch;
  const clock = opts.clock ?? (() => new Date());
  const timeoutMs = opts.timeoutMs ?? 10_000;

  return {
    async request(
      method: "GET" | "POST",
      path: string,
      body?: object,
    ): Promise<unknown> {
      const url = `${YELLOWCARD_SANDBOX_URL}${path}`;
      assertAllowedUrl("yellowcard", url);

      const timestamp = clock().toISOString();
      const bodyText = body !== undefined ? JSON.stringify(body) : "";
      const bodyHash =
        body !== undefined
          ? createHash("sha256").update(bodyText).digest("base64")
          : "";
      const signPath = `/business${path.split("?")[0]}`;
      const message = `${timestamp}${signPath}${method}${bodyHash}`;
      const signature = createHmac("sha256", opts.secret)
        .update(message)
        .digest("base64");

      const headers = new Headers({
        "X-YC-Timestamp": timestamp,
        Authorization: `YcHmacV1 ${opts.apiKey}:${signature}`,
        Accept: "application/json",
      });
      if (body !== undefined) {
        headers.set("Content-Type", "application/json");
      }

      const request = new Request(url, {
        method,
        headers,
        body: body !== undefined ? bodyText : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const timeout = new Promise<never>((_resolve, reject) => {
        request.signal.addEventListener("abort", () => {
          reject(request.signal.reason ?? new Error("Request timed out"));
        });
      });

      let res: Response;
      try {
        res = await Promise.race([fetchFn(request), timeout]);
      } catch (error) {
        throw new ProviderError(
          "transient",
          error instanceof Error ? error.name : "NETWORK_ERROR",
        );
      }

      const text = await res.text();
      if (!res.ok) {
        const parsed = safeJson(text);
        const code = String(
          parsed?.code ?? parsed?.errorCode ?? parsed?.error ?? res.status,
        );
        const message = String(parsed?.message ?? "");
        if (res.status === 429 || res.status >= 500) {
          throw new ProviderError("transient", code);
        }
        if (res.status === 404) {
          throw new ProviderError("not_found", code || "NOT_FOUND");
        }
        if (/duplicate|sequence/i.test(`${code} ${message}`)) {
          throw new ProviderError("duplicate", code);
        }
        throw new ProviderError("rejected", code || `HTTP_${res.status}`);
      }
      return parseProviderJson(text);
    },
  };
}
