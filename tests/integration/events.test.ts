import { randomBytes } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import type { User } from "@/server/prisma";
import { db } from "@/server/db";
import { now } from "@/backend/clock";
import { authService } from "@/backend/services/auth";
import { eventService } from "@/backend/services/events";
import { SESSION_COOKIE_NAME } from "@/server/auth/constants";
import { GET as eventsGET } from "@/app/api/v1/events/route";

import { useTestDatabase } from "../helpers/db";
import { makeOrder, makeVerifiedUser } from "../helpers/factories";
import { setNow } from "../helpers/time";

useTestDatabase();

let ada: User;
let bob: User;
let adaToken: string;

async function sessionFor(u: User): Promise<string> {
  const sessionToken = randomBytes(32).toString("base64url");
  await db.session.create({
    data: {
      sessionToken,
      userId: u.id,
      expires: new Date(now().getTime() + 86_400_000),
    },
  });
  return sessionToken;
}

beforeEach(async () => {
  setNow("2026-11-13T09:00:00Z");
  ada = await makeVerifiedUser("ada_tier2");
  bob = await makeVerifiedUser("tunde_tier1");
  adaToken = await sessionFor(ada);
});

async function seedEvent(userId: string, subjectId: string, status: string) {
  return db.userEvent.create({
    data: { userId, type: "order.updated", subjectId, status, createdAt: now() },
  });
}

describe("events", () => {
  it("replays only the caller's events after Last-Event-ID", async () => {
    const aOrder = await makeOrder({ userId: ada.id });
    const bOrder = await makeOrder({ userId: bob.id });
    await seedEvent(ada.id, aOrder.id, "created");
    await seedEvent(ada.id, aOrder.id, "awaiting_transfer");
    await seedEvent(bob.id, bOrder.id, "created");

    const events = await eventService.list(ada.id, 1n);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "2",
      type: "order.updated",
      subject_id: aOrder.id,
      status: "awaiting_transfer",
    });
    expect(typeof events[0]!.created_at).toBe("string");

    const bEvents = await eventService.list(bob.id, 0n);
    expect(bEvents.filter((e) => e.subject_id === aOrder.id)).toEqual([]);
    expect(bEvents.map((e) => e.id)).toEqual(["3"]);
  });

  it("streams events and closes when the session is revoked", async () => {
    const order = await makeOrder({ userId: ada.id });
    await seedEvent(ada.id, order.id, "created");

    const req = new NextRequest("http://localhost:3000/api/v1/events", {
      method: "GET",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${adaToken}` },
    });
    const res = await eventsGET(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const first = await reader.read();
    expect(first.done).toBe(false);
    const frame = decoder.decode(first.value);
    expect(frame).toContain("id: 1");
    expect(frame).toContain("event: order.updated");
    expect(frame).toContain(`"subject_id":"${order.id}"`);

    await authService.logout(adaToken);
    const deadline = Date.now() + 10_000;
    let done = false;
    while (Date.now() < deadline) {
      const next = await reader.read();
      if (next.done) {
        done = true;
        break;
      }
    }
    expect(done).toBe(true);
  }, 30_000);
});
