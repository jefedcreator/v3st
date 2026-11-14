import { describe, expect, it } from "vitest";

import {
  BETA_ALLOWED_MODES,
  BetaPolicyError,
  assertAllowedUrl,
  assertBetaRuntime,
} from "@/backend/integrations/beta-policy";

const valid = { APP_STAGE: "beta", NODE_ENV: "development", YELLOWCARD_MODE: "simulated" };

describe("assertBetaRuntime", () => {
  it("rejects any stage other than beta", () => {
    expect(() => assertBetaRuntime({ ...valid, APP_STAGE: "production" })).toThrow(BetaPolicyError);
    expect(() => assertBetaRuntime({ ...valid, APP_STAGE: undefined })).toThrow(BetaPolicyError);
  });

  it("keeps simulated providers under NODE_ENV=production", () => {
    expect(assertBetaRuntime({ ...valid, NODE_ENV: "production" }).yellowcard).toBe("simulated");
  });

  it("requires credentials for the Yellow Card sandbox and rejects unknown modes", () => {
    expect(() => assertBetaRuntime({ ...valid, YELLOWCARD_MODE: "sandbox" })).toThrow(BetaPolicyError);
    expect(
      assertBetaRuntime({ ...valid, YELLOWCARD_MODE: "sandbox", YELLOWCARD_API_KEY: "k", YELLOWCARD_API_SECRET: "s" })
        .yellowcard,
    ).toBe("sandbox");
    expect(() => assertBetaRuntime({ ...valid, YELLOWCARD_MODE: "live" })).toThrow(BetaPolicyError);
  });

  it("pins every other integration to simulated", () => {
    const modes = assertBetaRuntime(valid);
    for (const id of ["paycrest", "identity", "kyc", "screening", "wallets", "venues", "earnings", "settlement"] as const) {
      expect(modes[id]).toBe("simulated");
      expect(BETA_ALLOWED_MODES[id]).toEqual(["simulated"]);
    }
  });
});

describe("assertAllowedUrl", () => {
  it("allows only the Yellow Card sandbox host", () => {
    expect(() => assertAllowedUrl("yellowcard", "https://sandbox.api.yellowcard.io/business/rates")).not.toThrow();
    expect(() => assertAllowedUrl("yellowcard", "https://api.yellowcard.io/business/rates")).toThrow(BetaPolicyError);
    expect(() => assertAllowedUrl("yellowcard", "https://sandbox.api.yellowcard.io.evil.test/business/rates")).toThrow(
      BetaPolicyError,
    );
    expect(() => assertAllowedUrl("yellowcard", "http://sandbox.api.yellowcard.io/business/rates")).toThrow(
      BetaPolicyError,
    );
  });
});

describe("test network containment", () => {
  it("blocks live network access from tests", async () => {
    await expect(fetch("https://example.com")).rejects.toThrow("Live network access is disabled in tests");
  });
});
