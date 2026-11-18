import { expect, it, vi } from "vitest";

import { reportError } from "@/backend/observability";
import { appCatalogService } from "@/backend/services/app/catalog";
import { getLandingTicker, profileOnlyTicker } from "@/server/landing";

it("builds profile-only rows with no numbers", () => {
  const dto = profileOnlyTicker();
  expect(dto.rows).toHaveLength(8);
  expect(dto.rows.every((r) => r.price_kobo === null && r.line_kobo.length === 0)).toBe(true);
  expect(dto.rows[0]!.logo_path).toBe("/stocks/aapl.svg");
  expect(dto.rows.at(-1)!.price_is_estimate).toBe(true);
  expect(dto.as_of).toBeNull();
});

it("returns null and reports the error when the read fails", async () => {
  vi.spyOn(appCatalogService, "publicTicker").mockRejectedValue(new Error("db down"));
  await expect(getLandingTicker()).resolves.toBeNull();
  expect(vi.mocked(reportError)).toHaveBeenCalled();
});
