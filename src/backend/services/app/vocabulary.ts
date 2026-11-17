const LEAK_KEY_SEGMENTS = new Set([
  "wallet",
  "address",
  "chain",
  "network",
  "token",
  "gas",
  "tx",
  "hash",
  "onchain",
  "provider",
  "asset",
  "raw",
  "wei",
  "usdc",
  "swap",
  "pool",
  "liquidity",
  "contract",
  "integration",
  "deployment",
  "relayer",
  "sponsor",
  "nonce",
  "block",
  "calldata",
  "signature",
  "simulated",
]);

const LEAK_VALUE_PATTERNS = [
  /0x[0-9a-f]{8,}/i,
  /\b(crypto|cryptocurrency|blockchain|on-?chain|wallets?|tokens?|usdc|stablecoins?|web3|defi|swaps?|smart contracts?|liquidity|seed phrase|private key|wei|ethereum|sepolia|anvil|testnet|mainnet|hydrex|hydropump|bankr|o1 exchange|stonks|basestonk|feel\.cash|privy|relayer|gas fees?)\b/i,
];

const TOKENIZED_PATTERN = /\btokeni[sz](ed|ation)\b/i;
const INTERNAL_CODE_PATTERN = /\b[A-Z]+(?:_[A-Z]+)+\b/;

function keyLeaks(key: string): boolean {
  const segments = key.toLowerCase().split("_");
  return segments.some((segment) => LEAK_KEY_SEGMENTS.has(segment));
}

// Walks any payload and returns "path: reason" entries for every key or value
// that would leak internal vocabulary to a customer. Legal documents may use
// "tokenized" when opts.documents is set; nothing else may.
export function findCustomerLeaks(value: unknown, opts?: { documents?: boolean }): string[] {
  const leaks: string[] = [];
  const walk = (node: unknown, path: string, parentKey: string | null): void => {
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, `${path}[${index}]`, null));
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        const childPath = path ? `${path}.${key}` : key;
        if (keyLeaks(key)) {
          leaks.push(`${childPath}: forbidden key`);
        }
        walk(child, childPath, key);
      }
      return;
    }
    if (typeof node === "string") {
      if (LEAK_VALUE_PATTERNS.some((pattern) => pattern.test(node))) {
        leaks.push(`${path}: forbidden wording`);
        return;
      }
      if (!opts?.documents && TOKENIZED_PATTERN.test(node)) {
        leaks.push(`${path}: tokenized wording outside documents`);
        return;
      }
      if (parentKey !== "code" && INTERNAL_CODE_PATTERN.test(node)) {
        leaks.push(`${path}: internal code`);
      }
    }
  };
  walk(value, "", null);
  return leaks;
}
