import { describe, expect, it } from "vitest";
import * as landing from "@/components/landing/format";
import {
  countdown, formatChangeBps, formatLagosDateTime, formatLagosDay, formatLagosTime,
  formatNaira, formatShares, formatSignedNaira, lagosDayLabel, parseNairaInput,
} from "@/utils/format";

describe("money", () => {
  it("keeps the landing's formatters as one implementation", () => {
    expect(formatNaira("124000")).toBe("₦1,240");
    expect(formatNaira("231015")).toBe("₦2,310.15");
    expect(landing.formatNaira).toBe(formatNaira);
    expect(landing.formatChangeBps).toBe(formatChangeBps);
  });
  it("signs by direction with a true minus", () => {
    expect(formatSignedNaira("500000", "in")).toBe("+₦5,000");
    expect(formatSignedNaira("500000", "out")).toBe("−₦5,000");
    expect(formatSignedNaira("500000", "none")).toBe("₦5,000");
  });
  it("formats shares from millionths", () => {
    expect(formatShares("412000")).toBe("0.412 shares");
    expect(formatShares("1000000")).toBe("1 share");
    expect(formatShares("2500000")).toBe("2.5 shares");
    expect(formatShares("1")).toBe("0.000001 shares");
    expect(formatShares("12345678900000")).toBe("12,345,678.9 shares");
  });
  it("parses typed naira into exact kobo", () => {
    expect(parseNairaInput("₦12,500.50")).toBe("1250050");
    expect(parseNairaInput(" 12500 ")).toBe("1250000");
    expect(parseNairaInput("0.5")).toBe("50");
    expect(parseNairaInput("007")).toBe("700");
    for (const bad of ["", "abc", "-5", "12.345", "1e3", "₦"]) expect(parseNairaInput(bad)).toBeNull();
  });
});

describe("Lagos time, whatever the device's timezone", () => {
  it("formats in Africa/Lagos", () => {
    expect(formatLagosTime("2026-11-19T13:20:00Z")).toBe("14:20");
    expect(formatLagosDay("2026-11-20")).toBe("Fri 20 Nov");
    expect(formatLagosDay("2026-11-19T23:30:00Z")).toBe("Fri 20 Nov");
    expect(formatLagosDateTime("2026-11-22T08:40:00Z")).toBe("Sun 22 Nov, 09:40");
  });
  it("labels days relative to now", () => {
    const now = new Date("2026-11-20T10:00:00Z");
    expect(lagosDayLabel("2026-11-19T23:30:00Z", now)).toBe("Today");
    expect(lagosDayLabel("2026-11-19T10:00:00Z", now)).toBe("Yesterday");
    expect(lagosDayLabel("2026-11-16T10:00:00Z", now)).toBe("Mon 16 Nov");
  });
});

describe("countdown", () => {
  it("counts mm:ss, then h:mm:ss, then stops", () => {
    expect(countdown("2026-11-19T13:44:00Z", new Date("2026-11-19T13:20:19Z"))).toEqual({ text: "23:41", done: false });
    expect(countdown("2026-11-19T15:00:00Z", new Date("2026-11-19T13:57:57Z"))).toEqual({ text: "1:02:03", done: false });
    expect(countdown("2026-11-19T13:44:00Z", new Date("2026-11-19T13:44:01Z"))).toEqual({ text: "00:00", done: true });
  });
});
