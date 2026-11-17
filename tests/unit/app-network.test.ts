import { afterEach, describe, expect, it } from "vitest";

import {
  chainIdForLedgerChain,
  customerChain,
  customerChainId,
} from "@/backend/services/app/network";

afterEach(() => {
  delete process.env.APP_CUSTOMER_CHAIN;
});

describe("customer network", () => {
  it("defaults to the local testnet chain", () => {
    expect(customerChain()).toBe("testnet");
    expect(customerChainId()).toBe(31337);
  });

  it("maps basesepolia to chain 84532", () => {
    process.env.APP_CUSTOMER_CHAIN = "basesepolia";
    expect(customerChain()).toBe("basesepolia");
    expect(customerChainId()).toBe(84532);
  });

  it("maps ledger chains to chain ids and rejects others", () => {
    expect(chainIdForLedgerChain("testnet")).toBe(31337);
    expect(chainIdForLedgerChain("basesepolia")).toBe(84532);
    expect(() => chainIdForLedgerChain("base")).toThrow();
  });
});
