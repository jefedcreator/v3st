import { Prisma, type ProviderId } from "@/server/prisma";
import { db, withTx } from "@/server/db";
import { now } from "@/backend/clock";
import { rampRegistry } from "@/backend/services/ramp";
import { alertService } from "@/backend/services/alerts";
import { jobService } from "@/backend/services/jobs";
import { sha256Hex } from "@/utils";
import { parseProviderJson } from "@/utils/money";
import { NotFoundException, UnauthorizedException } from "@/utils/exceptions";

class WebhookService {
  async accept(
    provider: ProviderId,
    headers: Headers,
    rawBody: Uint8Array,
  ): Promise<{ duplicate: boolean }> {
    const p = rampRegistry.get(provider);
    const webhooksAllowed =
      p.mode === "sandbox" || (provider === "paycrest" && p.mode === "simulated");
    if (!webhooksAllowed) {
      throw new NotFoundException("Webhook endpoint is not available in simulated mode");
    }
    const valid = p.verifyWebhook(headers, rawBody);
    const text = new TextDecoder().decode(rawBody);
    let payload: unknown = {};
    try {
      payload = parseProviderJson(text);
    } catch {
      payload = {};
    }
    if (!valid) {
      const eventKey = `invalid:${sha256Hex(rawBody)}`;
      const data: Prisma.WebhookEventCreateInput = {
        provider,
        eventKey,
        payload: payload as Prisma.InputJsonValue,
        signatureValid: false,
        providerMode: p.mode,
        receivedAt: now(),
      };
      try {
        await db.webhookEvent.create({ data });
      } catch (error) {
        if (
          !(
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          )
        ) {
          throw error;
        }
      }
      throw new UnauthorizedException("Invalid webhook signature");
    }

    const hint = p.parseWebhook(rawBody);
    const storedPayload = {
      ...(payload as Record<string, unknown>),
      provider,
      ref: hint.ref,
      key: hint.key,
      direction: hint.direction,
    };
    return withTx(async (tx) => {
      const eventData: Prisma.WebhookEventCreateInput = {
        provider,
        eventKey: hint.eventKey,
        payload: storedPayload as Prisma.InputJsonValue,
        signatureValid: true,
        providerMode: p.mode,
        receivedAt: now(),
      };
      try {
        await tx.webhookEvent.create({ data: eventData });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          return { duplicate: true };
        }
        throw error;
      }
      await jobService.enqueue(tx, {
        kind: "webhook.process",
        subjectId: hint.eventKey,
        payload: {
          provider,
          eventKey: hint.eventKey,
          ref: hint.ref,
          key: hint.key ?? "",
          direction: hint.direction ?? "",
        },
      });
      return { duplicate: false };
    });
  }

  async process(eventKey: string): Promise<void> {
    const event = await db.webhookEvent.findFirst({ where: { eventKey } });
    if (!event) return;
    const payload = event.payload as {
      provider?: ProviderId;
      ref?: string;
      key?: string;
    };
    const provider = payload.provider ?? event.provider;
    let order = null as null | Awaited<ReturnType<typeof db.rampOrder.findFirst>>;
    if (payload.ref) {
      order = await db.rampOrder.findFirst({
        where: { provider, providerRef: payload.ref },
      });
    }
    if (!order && payload.key) {
      order = await db.rampOrder.findFirst({
        where: { provider, id: payload.key },
      });
    }
    if (order) {
      await jobService.enqueue(db, {
        kind: order.kind === "deposit" ? "deposit.progress" : "payout.progress",
        subjectId: order.id,
      });
    } else {
      await alertService.raise(db, {
        kind: "webhook.unmatched",
        severity: "warning",
        dedupeKey: `webhook.unmatched:${provider}:${payload.ref ?? payload.key ?? eventKey}`,
        message: `Webhook ${eventKey} matched no order`,
        context: { provider, ref: payload.ref ?? "", key: payload.key ?? "" },
      });
    }
    await db.webhookEvent.update({
      where: { id: event.id },
      data: { processedAt: now() },
    });
  }
}

export const webhookService = new WebhookService();
