import { beforeEach, expect, it, vi } from "vitest";

import { GET } from "@/app/api/v1/rates/ngn/route";
import { now } from "@/backend/clock";
import { register, reset } from "@/backend/services/ramp";
import { ratesService } from "@/backend/services/rates";
import { createSimulatedRampProvider } from "@/backend/services/ramp/simulated";
import { rateFromNgnPerUsd } from "@/utils/money";

import { callRoute } from "../helpers/http";
import { setNow } from "../helpers/time";

beforeEach(() => {
  reset();
  ratesService.clearCache();
});

it("serves display rates for five seconds, then refreshes", async () => {
  setNow("2026-11-13T07:00:00Z");
  const ratesSpy = vi.fn(async () => ({
    buy: rateFromNgnPerUsd("1600"),
    sell: rateFromNgnPerUsd("1550"),
    asOf: now(),
  }));
  register({ ...createSimulatedRampProvider("yellowcard"), rates: ratesSpy });

  const first = await callRoute(GET, { method: "GET", url: "/api/v1/rates/ngn" });
  await callRoute(GET, { method: "GET", url: "/api/v1/rates/ngn" });
  expect(ratesSpy).toHaveBeenCalledTimes(1);
  expect(first.status).toBe(200);
  expect((first.json as { data: { deposit_rate: { ngn_per_usd: string } } }).data.deposit_rate.ngn_per_usd).toBe(
    "1600.00",
  );

  setNow("2026-11-13T07:00:06Z");
  await callRoute(GET, { method: "GET", url: "/api/v1/rates/ngn" });
  expect(ratesSpy).toHaveBeenCalledTimes(2);
});

it("answers 503 RATES_UNAVAILABLE when the provider fails", async () => {
  setNow("2026-11-13T07:00:00Z");
  register({
    ...createSimulatedRampProvider("yellowcard"),
    rates: async () => {
      throw new Error("boom");
    },
  });
  const res = await callRoute(GET, { method: "GET", url: "/api/v1/rates/ngn" });
  expect(res.status).toBe(503);
  expect(res.json).toMatchObject({ code: "RATES_UNAVAILABLE", data: null });
});
