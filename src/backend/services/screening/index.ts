import type { Chain } from "@/backend/services/wallets/chains";

export const SIMULATED_DENYLIST = [
  "0x000000000000000000000000000000000000dEaD",
];

class ScreeningService {
  async screen(_chain: Chain, address: string): Promise<"allow" | "deny"> {
    const normalized = address.toLowerCase();
    return SIMULATED_DENYLIST.some((entry) => entry.toLowerCase() === normalized)
      ? "deny"
      : "allow";
  }
}

export const screeningService = new ScreeningService();
