import { randomBytes } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { now } from "@/backend/clock";
import { controlsService } from "@/backend/services/controls";
import { jobService } from "@/backend/services/jobs";
import { operationsService } from "@/backend/services/operations";
import { walletService } from "@/backend/services/wallets";
import { GET as opsStatusGET } from "@/app/api/v1/ops/status/route";
import { POST as controlsPOST } from "@/app/api/v1/ops/controls/route";
import { db } from "@/server/db";

import { callRoute } from "../helpers/http";
import { useTestDatabase } from "../helpers/db";
import { makeUser, makeVerifiedUser, seedTreasury } from "../helpers/factories";
import { setNow } from "../helpers/time";

useTestDatabase();

let operatorToken: string;
let operatorId: string;

async function sessionFor(userId: string): Promise<string> {
  const sessionToken = randomBytes(32).toString("base64url");
  await db.session.create({
    data: {
      sessionToken,
      userId,
      expires: new Date(now().getTime() + 86_400_000),
    },
  });
  return sessionToken;
}

beforeEach(async () => {
  setNow("2026-11-13T09:00:00Z");
  const op = await makeUser({ role: "operator" });
  operatorId = op.id;
  operatorToken = await sessionFor(op.id);
});

function headers(token: string) {
  return { cookie: `sara-session=${token}`, origin: "http://localhost:3000" };
}

describe("operations", () => {
  it("requires a reason to resume payouts and records the operator", async () => {
    await expect(
      operationsService.setControl(operatorId, {
        scope: "payouts",
        paused: false,
        reason: "ok",
      }),
    ).rejects.toMatchObject({ statusCode: 422 });
    const control = await operationsService.setControl(operatorId, {
      scope: "payouts",
      paused: false,
      reason: "reconciliation cleared by ops",
    });
    expect(control).toMatchObject({ paused: false, updated_by: operatorId });
    expect(await controlsService.isPaused("payouts")).toBe(false);
  });

  it("denies non-operators", async () => {
    const plain = await makeVerifiedUser();
    const token = await sessionFor(plain.id);
    const res = await callRoute(opsStatusGET, {
      method: "GET",
      url: "http://localhost:3000/api/v1/ops/status",
      headers: headers(token),
    });
    expect(res.status).toBe(403);
  });

  it("reports status for operators", async () => {
    const res = await callRoute(opsStatusGET, {
      method: "GET",
      url: "http://localhost:3000/api/v1/ops/status",
      headers: headers(operatorToken),
    });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({
      data: {
        controls: expect.any(Array),
        open_alerts: expect.any(Array),
        dead_jobs: expect.any(Number),
        awaiting_approval_transfers: expect.any(Number),
      },
    });
  });

  it("retries only dead jobs", async () => {
    await jobService.enqueue(db, { kind: "poll.open_work", subjectId: "global" });
    const pending = await db.job.findFirstOrThrow({ where: { kind: "poll.open_work" } });
    await expect(operationsService.retryJob(operatorId, pending.id)).rejects.toMatchObject({
      code: "NOT_DEAD",
    });
    await db.job.update({
      where: { id: pending.id },
      data: { status: "dead", lastError: "NO_HANDLER" },
    });
    await operationsService.retryJob(operatorId, pending.id);
    const after = await db.job.findUniqueOrThrow({ where: { id: pending.id } });
    expect(after.status).toBe("pending");
    expect(after.attempts).toBe(0);
  });

  it("approves an awaiting-approval transfer for an operator", async () => {
    await seedTreasury("base", 1_000_000_000_000n);
    const u = await makeVerifiedUser();
    await walletService.ensureUserWallets(u.id);
    const { withTx } = await import("@/server/db");
    const t = await withTx((tx) =>
      walletService.createTransfer(tx, {
        key: "ops:big",
        purpose: "float_topup",
        chain: "base",
        amount: 25_000_000_000n,
        from: { kind: "treasury" },
        to: { kind: "external", address: "0x9999999999999999999999999999999999999999" },
      }),
    );
    expect(t.status).toBe("awaiting_approval");
    const dto = await operationsService.approveTransfer(operatorId, t.id);
    expect(dto).toMatchObject({ status: "awaiting_approval", approvals: [operatorId] });
    const op2 = await makeUser({ role: "operator" });
    const dto2 = await operationsService.approveTransfer(op2.id, t.id);
    expect(dto2.status).toBe("pending");
  });

  it("sets controls through the route", async () => {
    const res = await callRoute(controlsPOST, {
      method: "POST",
      url: "http://localhost:3000/api/v1/ops/controls",
      body: JSON.stringify({ scope: "deposits", paused: true, reason: "maintenance window" }),
      headers: headers(operatorToken),
    });
    expect(res.status).toBe(200);
    expect(await controlsService.isPaused("deposits")).toBe(true);
  });
});
