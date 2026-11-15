import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db, withTx } from "@/server/db";
import { applyFillToLots, totalRealized, totalCostBasis } from "@/backend/services/positions/lots";
import { useTestDatabase } from "../helpers/db";
import { makeUser } from "../helpers/factories";

useTestDatabase();

describe("FIFO allocation regression", () => {
  it("allocates proceeds exactly across lots and accumulates partial-sale losses", async () => {
    const user = await makeUser();
    const common = { userId: user.id, stockId: "fixture-stock", asset: "fixture", source: "review" };
    const fill = (side: "buy" | "sell", quantityRaw: bigint, cashRaw: bigint, feeRaw: bigint) =>
      withTx((tx) => applyFillToLots(tx, { ...common, side, quantityRaw, cashRaw, feeRaw, operationId: randomUUID() }));
    await fill("buy", 10n, 100n, 0n);
    await fill("buy", 10n, 100n, 0n);
    const sold = await fill("sell", 15n, 180n, 3n);
    expect(sold.realizedGainRaw).toBe(27n);
    expect(await totalRealized(db, user.id, common.stockId)).toBe(27n);
    expect(await totalCostBasis(db, user.id, common.stockId)).toBe(50n);
    await fill("sell", 5n, 40n, 1n);
    expect(await totalRealized(db, user.id, common.stockId)).toBe(16n);
    expect(await totalCostBasis(db, user.id, common.stockId)).toBe(0n);
    const lots = await db.positionLot.findMany({ where: { userId: user.id } });
    expect(lots.every((lot) => lot.closedAt !== null)).toBe(true);
  });

  it("does not partially mutate lots when inventory is insufficient", async () => {
    const user = await makeUser();
    const common = { userId: user.id, stockId: "fixture-stock", asset: "fixture", source: "review" };
    await withTx((tx) => applyFillToLots(tx, { ...common, side: "buy", quantityRaw: 1n, cashRaw: 10n, feeRaw: 0n, operationId: randomUUID() }));
    await expect(withTx((tx) => applyFillToLots(tx, { ...common, side: "sell", quantityRaw: 2n, cashRaw: 10n, feeRaw: 0n, operationId: randomUUID() }))).rejects.toThrow("exceeds tracked");
    expect(await totalCostBasis(db, user.id, common.stockId)).toBe(10n);
    expect(await totalRealized(db, user.id, common.stockId)).toBe(0n);
  });
});
