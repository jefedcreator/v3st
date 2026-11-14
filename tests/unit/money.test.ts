import { expect, it } from "vitest";

import {
  MoneyFormatError,
  decimalToMinor,
  formatMinor,
  minorToProviderNumber,
  ngnToUsd,
  parseMinor,
  parseProviderJson,
  rateFromNgnPerUsd,
  rateToDto,
  usdToNgn,
} from "@/utils/money";

it("parses canonical integer strings exactly", () => {
  expect(parseMinor("9007199254740993")).toBe(9007199254740993n);
  expect(parseMinor("0")).toBe(0n);
  for (const bad of ["", "-1", "+1", "1.2", "1e6", " 1", "01", "9223372036854775808"])
    expect(() => parseMinor(bad)).toThrow(MoneyFormatError);
});

it("builds reduced rates from decimal naira-per-dollar strings", () => {
  expect(rateFromNgnPerUsd("1600")).toEqual({ kobo: 4n, microUsd: 25n });
  expect(rateFromNgnPerUsd("1550")).toEqual({ kobo: 31n, microUsd: 200n });
  expect(rateFromNgnPerUsd("1580.5")).toEqual({ kobo: 3161n, microUsd: 20_000n });
  expect(() => rateFromNgnPerUsd("0")).toThrow(MoneyFormatError);
});

it("converts with explicit rounding", () => {
  const buy = rateFromNgnPerUsd("1600");
  const sell = rateFromNgnPerUsd("1550");
  expect(ngnToUsd(1_980_000n, buy, "floor")).toBe(12_375_000n);
  expect(ngnToUsd(500_000n, sell, "ceil")).toBe(3_225_807n);
  expect(ngnToUsd(500_000n, sell, "floor")).toBe(3_225_806n);
  expect(usdToNgn(1_290_322n, sell, "floor")).toBe(199_999n);
  expect(usdToNgn(1_290_323n, sell, "floor")).toBe(200_000n);
});

it("reads provider decimals without floating point", () => {
  expect(decimalToMinor("20000", 2, "exact")).toBe(2_000_000n);
  expect(decimalToMinor("12.3456789", 6, "floor")).toBe(12_345_678n);
  expect(() => decimalToMinor("12.3456789", 6, "exact")).toThrow(MoneyFormatError);
  for (const bad of ["1e-7", "-5", "", "1.2.3"]) expect(() => decimalToMinor(bad, 6, "floor")).toThrow(MoneyFormatError);
  expect(parseProviderJson('{"amount": 12.3456789, "n": 9007199254740993, "s": "x"}')).toEqual({
    amount: "12.3456789",
    n: "9007199254740993",
    s: "x",
  });
});

it("serialises minor units for provider bodies and DTOs", () => {
  expect(JSON.stringify({ localAmount: minorToProviderNumber(1_999_999n, 2) })).toBe('{"localAmount":19999.99}');
  expect(() => minorToProviderNumber(2n ** 53n, 2)).toThrow(MoneyFormatError);
  expect(formatMinor(2_000_000n)).toBe("2000000");
  expect(rateToDto({ kobo: 4n, microUsd: 25n })).toEqual({ kobo: "4", micro_usd: "25", ngn_per_usd: "1600.00" });
  expect(rateToDto({ kobo: 3161n, microUsd: 20_000n }).ngn_per_usd).toBe("1580.50");
});
