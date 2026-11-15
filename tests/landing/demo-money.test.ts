import { describe, expect, it } from "vitest";
import {
  formatNgn,
  formatUnits,
  payoutPreview,
} from "@/components/landing/demo-money";
describe("exact illustrative money", () => {
  it.each([
    ["500000", "₦5,000"],
    ["199999", "₦1,999.99"],
    ["-200000", "−₦2,000"],
    ["0", "₦0"],
    ["900719925474099301", "₦9,007,199,254,740,993.01"],
  ])("formats %s exactly", (raw, formatted) =>
    expect(formatNgn(raw)).toBe(formatted),
  );
  it.each(["1.2", "1e6", "01", "-0", "+1", " 5", "1\n", "1\r\n", ""])(
    "rejects malformed integer %s",
    (value) => expect(() => formatNgn(value)).toThrow(),
  );
  it("formats quantities without float conversion", () => {
    expect(formatUnits("250000", 6)).toBe("0.25");
    expect(formatUnits("1250000", 6)).toBe("1.25");
    expect(formatUnits("0", 18)).toBe("0");
    expect(formatUnits("900719925474099301", 0)).toBe("900719925474099301");
  });
  it.each([-1, 19, 1.5, NaN, Infinity])(
    "rejects invalid decimals %s",
    (decimals) => expect(() => formatUnits("1", decimals)).toThrow(),
  );
  it.each(["-1", "01", "1e3", "1\n"])(
    "rejects invalid raw quantity %s",
    (raw) => expect(() => formatUnits(raw, 6)).toThrow(),
  );
  it("checks gross threshold before fee and charges nothing on rollover", () => {
    expect(payoutPreview("199999")).toEqual({
      status: "rollover",
      grossKobo: "199999",
      feeKobo: "0",
      receivedKobo: "0",
      rolloverKobo: "199999",
    });
    expect(payoutPreview("200000")).toMatchObject({
      status: "qualifies",
      feeKobo: "10000",
      receivedKobo: "190000",
      rolloverKobo: "0",
    });
    expect(payoutPreview("500000").receivedKobo).toBe("490000");
    expect(() => payoutPreview("-1")).toThrow();
  });
});
