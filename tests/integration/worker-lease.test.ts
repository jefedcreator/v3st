import { describe, expect, it } from "vitest";

import { now } from "@/backend/clock";
import { withLease } from "@/backend/services/jobs/lease";
import { db } from "@/server/db";

import { useTestDatabase } from "../helpers/db";

useTestDatabase();

describe("worker leases", () => {
  it("lets one holder run at a time and frees the lease afterwards", async () => {
    let inner: string | null = "unset";
    const outer = await withLease("lease-test", 60, async () => {
      inner = await withLease("lease-test", 60, async () => "second");
      return "first";
    });
    expect(outer).toBe("first");
    expect(inner).toBeNull();
    expect(await db.workerLease.count()).toBe(0);
    expect(await withLease("lease-test", 60, async () => "again")).toBe("again");
  });

  it("takes over a lease its holder never released once it expires", async () => {
    await db.workerLease.create({
      data: { name: "lease-crashed", holder: "crashed-worker", expiresAt: new Date(now().getTime() - 1_000) },
    });
    expect(await withLease("lease-crashed", 60, async () => "ok")).toBe("ok");
  });

  it("releases the lease when the job throws", async () => {
    await expect(withLease("lease-throws", 60, async () => { throw new Error("boom"); })).rejects.toThrow("boom");
    expect(await db.workerLease.count({ where: { name: "lease-throws" } })).toBe(0);
  });
});
