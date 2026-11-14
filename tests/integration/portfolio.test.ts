import { describe, expect, it } from "vitest";

import { portfolioService } from "@/backend/services/portfolio";
import { ratesService } from "@/backend/services/rates";
import { ProviderError } from "@/backend/services/ramp/errors";
import { register, rampRegistry, reset } from "@/backend/services/ramp";
import { ledgerService } from "@/backend/services/ledger";
import { acct } from "@/backend/services/ledger/accounts";
import { openingBalance } from "@/backend/services/ledger/postings";
import { withTx } from "@/server/db";

import { useTestDatabase } from "../helpers/db";
import { fundCash, makeStock, makeUserWithWallets } from "../helpers/factories";
import { setNow } from "../helpers/time";

useTestDatabase();

function providerWithFailingRates() {
  const base = rampRegistry.get("yellowcard");
  return {
    ...base,
    rates: () => {
      throw new ProviderError("transient", "RATES_UNAVAILABLE");
    },
  };
}

describe("portfolio", () => {
  it("values holdings in naira at read time", async () => {
    const u = await makeUserWithWallets();
    const s = await makeStock();
    await withTx((tx) =>
      ledgerService.post(
        tx,
        openingBalance({ account: acct.userStock(u.id, s.id), amount: 5_000_000n }),
      ),
    );
    const p = await portfolioService.get(u.id);
    expect(p.valuation).toBe("ok");
    expect(p.rate).not.toBeNull();
    expect(p.holdings).toHaveLength(1);
    expect(p.holdings[0]).toMatchObject({
      stock_id: s.id,
      symbol: "TSTA",
      quantity: "5000000",
      price_usdc: "2000000",
      value_usdc: "10000000",
      value_ngn: "1550000",
    });
  });

  it("reports unavailable valuation instead of zero naira when rates fail", async () => {
    const u = await makeUserWithWallets();
    await fundCash(u.id, 10_000_000n);
    const base = rampRegistry.get("yellowcard");
    register(providerWithFailingRates());
    ratesService.clearCache();
    try {
      setNow(new Date(Date.now() + 60_000).toISOString());
      const p = await portfolioService.get(u.id);
      expect(p).toMatchObject({
        cash_usdc: "10000000",
        cash_ngn: null,
        pending_ngn: null,
        earnings_ngn: null,
        valuation: "unavailable",
        rate: null,
      });
    } finally {
      reset();
      register(base);
      ratesService.clearCache();
    }
  });
});
