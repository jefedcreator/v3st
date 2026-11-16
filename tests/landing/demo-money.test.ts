import { describe, expect, it } from "vitest";

import {
  EXAMPLE_PAYOUT_FEE_KOBO,
  formatNgn,
  formatUnits,
  fxSettlementMicro,
  MINIMUM_GROSS_KOBO,
  payoutPreview,
} from "@/components/landing/demo-money";

describe("formatNgn", () => {
  it("formats whole naira without decimals", () => {
    expect(formatNgn("500000")).toBe("\u20a65,000");
    expect(formatNgn("0")).toBe("\u20a60");
  });

  it("formats fractional kobo with two decimals", () => {
    expect(formatNgn("199999")).toBe("\u20a61,999.99");
  });

  it("uses a Unicode minus before the naira sign", () => {
    expect(formatNgn("-200000")).toBe("\u2212\u20a62,000");
  });

  it("handles large integers exactly without Number conversion", () => {
    expect(formatNgn("900719925474099301")).toBe(
      "\u20a69,007,199,254,740,993.01",
    );
  });

  it("rejects malformed decimal and exponent input", () => {
    expect(() => formatNgn("1.5")).toThrow();
    expect(() => formatNgn("1e3")).toThrow();
    expect(() => formatNgn("")).toThrow();
    expect(() => formatNgn("01")).toThrow();
    expect(() => formatNgn("12a")).toThrow();
  });
});

describe("formatUnits", () => {
  it("converts raw quantities exactly", () => {
    expect(formatUnits("250000", 6)).toBe("0.25");
    expect(formatUnits("1250000", 6)).toBe("1.25");
    expect(formatUnits("1000000", 6)).toBe("1");
    expect(formatUnits("0", 6)).toBe("0");
    expect(formatUnits("5", 0)).toBe("5");
    expect(formatUnits("1000000000000000000", 18)).toBe("1");
  });

  it("never uses exponential notation", () => {
    expect(formatUnits("1", 18)).toBe("0.000000000000000001");
  });

  it("rejects invalid inputs and decimal counts", () => {
    expect(() => formatUnits("-1", 6)).toThrow();
    expect(() => formatUnits("1.5", 6)).toThrow();
    expect(() => formatUnits("250000", -1)).toThrow();
    expect(() => formatUnits("250000", 19)).toThrow();
    expect(() => formatUnits("250000", 2.5)).toThrow();
  });
});

describe("payoutPreview", () => {
  it("rolls over below the gross minimum with no fee charged", () => {
    expect(payoutPreview("199999")).toEqual({
      status: "rollover",
      grossKobo: "199999",
      feeKobo: "0",
      receivedKobo: "0",
      rolloverKobo: "199999",
    });
  });

  it("qualifies at the minimum before fees", () => {
    expect(payoutPreview("200000")).toEqual({
      status: "qualifies",
      grossKobo: "200000",
      feeKobo: "10000",
      receivedKobo: "190000",
      rolloverKobo: "0",
    });
  });

  it("applies the example fee to qualifying amounts", () => {
    expect(payoutPreview("500000")).toEqual({
      status: "qualifies",
      grossKobo: "500000",
      feeKobo: "10000",
      receivedKobo: "490000",
      rolloverKobo: "0",
    });
  });

  it("checks the gross threshold first and rejects invalid input", () => {
    expect(payoutPreview("0").status).toBe("rollover");
    expect(() => payoutPreview("-1")).toThrow();
    expect(() => payoutPreview("1.5")).toThrow();
    expect(MINIMUM_GROSS_KOBO).toBe("200000");
    expect(EXAMPLE_PAYOUT_FEE_KOBO).toBe("10000");
  });
});

describe("fxSettlementMicro", () => {
  it("gives exactly 66000000 micro-units for the funding example", () => {
    expect(fxSettlementMicro("9900000", "150000")).toBe("66000000");
  });
});
