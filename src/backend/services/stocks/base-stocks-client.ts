import { ALLOWED_REFERENCE_HOST } from "@/backend/integrations/onchain-policy";

// The only mainnet read allowed in Phase A: Base's Tokenized Stocks API. GET only,
// short timeout, no redirects, host pinned to the policy allowlist.
export const BASE_STOCKS_URL = "https://api.coinbase.com/v1/tokenized-stocks";

const baseUrl = new URL(BASE_STOCKS_URL);
if (baseUrl.host !== ALLOWED_REFERENCE_HOST) {
  throw new Error(`Stocks API host ${baseUrl.host} is not on the reference allowlist`);
}

type StocksFetch = (url: string) => Promise<unknown>;

let fetchOverride: StocksFetch | null = null;

export function __setStocksFetchForTests(fn: StocksFetch | null): void {
  fetchOverride = fn;
}

async function defaultFetch(url: string): Promise<unknown> {
  const response = await fetch(url, {
    method: "GET",
    redirect: "error",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Tokenized stocks API returned HTTP ${response.status}`);
  }
  return response.json();
}

export async function fetchStocksPage(pageToken: string | null): Promise<unknown> {
  const url = new URL(BASE_STOCKS_URL);
  url.searchParams.set("page_size", "100");
  if (pageToken) url.searchParams.set("page_token", pageToken);
  const run = fetchOverride ?? defaultFetch;
  return run(url.toString());
}
