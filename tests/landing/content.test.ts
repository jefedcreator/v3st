import { expect, it } from "vitest";

import { policy } from "@/backend/config/policy";
import { EARN_AUTOMATION_COPY } from "@/backend/content/earn-products";
import {
  EARN_BADGE_STOCKS,
  EARN_CARDS,
  FAQ_ITEMS,
  HERO_COUNTERS,
  JOURNEY_STAGES,
  SAFEGUARD_STATS,
} from "@/components/landing/content";

it("derives the hero counters from policy and the catalog", () => {
  expect(HERO_COUNTERS.map((c) => [c.finalText, c.label])).toEqual([
    ["₦1,000", "MINIMUM TO START"],
    ["8", "US COMPANIES IN THE BETA"],
    ["₦2,000", "SMALLEST FRIDAY PAYOUT"],
  ]);
});

it("derives the safeguards from policy", () => {
  expect(SAFEGUARD_STATS.map((s) => s.finalText)).toEqual(["₦0", "1%", "30 days"]);
  expect(Math.min(policy.app.earn.automation.expiryDays, policy.onchain.authorizationMaxDays)).toBe(30);
});

it("leads the Earn cards with real rules, never an APR", () => {
  expect(EARN_CARDS.map((c) => c.figure)).toEqual(["₦5,000", "Weekly", "1%", "Any time"]);
  expect(EARN_CARDS[2]!.body).toContain("2%");
  expect(JSON.stringify(EARN_CARDS)).not.toMatch(/APR|APY|yield/i);
});

it("orders the journey and the FAQ as the spec does", () => {
  expect(JOURNEY_STAGES.map((s) => s.title)).toEqual([
    "Add naira",
    "Buy shares",
    "Earn, if you choose",
    "Friday payouts",
    "Back to your bank",
  ]);
  expect(FAQ_ITEMS).toHaveLength(10);
  expect(FAQ_ITEMS[1]!.question).toBe("Do I own the shares?");
});

it("keeps crypto vocabulary out of the copy", () => {
  const copy = JSON.stringify([HERO_COUNTERS, SAFEGUARD_STATS, EARN_CARDS, JOURNEY_STAGES, FAQ_ITEMS]);
  expect(copy).not.toMatch(
    /\b(wallet|tokens?|tokeni[sz]ed|usdc|gas|on-?chain|blockchain|swaps?|liquidity|sepolia)\b/i,
  );
});

it("keeps the figures inside sentences derived, not typed", () => {
  const days = Math.min(policy.app.earn.automation.expiryDays, policy.onchain.authorizationMaxDays);
  expect(SAFEGUARD_STATS[2]!.line).toContain(`ends after ${days} days`);
  // The Earn card's collection night is the product's own automation copy.
  expect(EARN_CARDS[1]!.body).toContain("every Thursday night");
  expect(EARN_AUTOMATION_COPY).toContain("every Thursday night");
});

it("badges the first Earn card with four profiled stocks by name", () => {
  expect(EARN_BADGE_STOCKS).toEqual([
    { ticker: "AAPL", name: "Apple", logoPath: "/stocks/aapl.svg" },
    { ticker: "NVDA", name: "NVIDIA", logoPath: "/stocks/nvda.svg" },
    { ticker: "TSLA", name: "Tesla", logoPath: "/stocks/tsla.svg" },
    { ticker: "AMZN", name: "Amazon", logoPath: "/stocks/amzn.svg" },
  ]);
});
