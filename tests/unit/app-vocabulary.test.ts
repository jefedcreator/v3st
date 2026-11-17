import { describe, expect, it } from "vitest";

import { findCustomerLeaks } from "@/backend/services/app/vocabulary";

describe("findCustomerLeaks", () => {
  it("flags crypto keys and values at any depth", () => {
    const leaks = findCustomerLeaks({
      a: [{ tx_hash: "x" }],
      b: { note: "Paid in USDC" },
      c: "0x52908400098527886E0F7030069857D2E4169EE7",
      d: { why: "MIN_OUTPUT_BREACH" },
    });
    for (const path of ["a[0].tx_hash", "b.note", "c", "d.why"]) {
      expect(leaks.some((leak) => leak.startsWith(path))).toBe(true);
    }
  });

  it("passes clean customer data, including supply-chain wording and lower-case enums", () => {
    expect(
      findCustomerLeaks({
        status: 200,
        message: "Bought Apple",
        code: "NOT_ENOUGH_CASH",
        data: { amount_kobo: "2000000", summary: "A supply chain leader", choice: "payout" },
      }),
    ).toEqual([]);
  });

  it("allows tokenized only in documents", () => {
    expect(findCustomerLeaks({ body: "tokenized stock exposure" })).not.toEqual([]);
    expect(findCustomerLeaks({ body: "tokenized stock exposure" }, { documents: true })).toEqual([]);
    expect(findCustomerLeaks({ body: "your wallet" }, { documents: true })).not.toEqual([]);
  });
});
