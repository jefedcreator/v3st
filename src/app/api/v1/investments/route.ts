import {
  authMiddleware,
  bodyValidatorMiddleware,
  idempotencyKeyMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { investmentService } from "@/backend/services/investments";
import {
  investmentConfirmBodySchema,
  type InvestmentConfirmBodySchema,
} from "@/backend/validators/investment.validator";
import { db } from "@/server/db";
import { accepted, ok } from "@/utils/response";

export const GET = withMiddleware<null, null, null>(
  async (request) => {
    const res = ok(await investmentService.list(request.user!.id), "Investments");
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  },
  [authMiddleware],
);

export const POST = withMiddleware<InvestmentConfirmBodySchema, null, null>(
  async (request) => {
    const body = request.validatedData!;
    const key = request.idempotencyKey!;
    // Replaying the same idempotency key returns the one created resource (200).
    const existing = await db.investment.findUnique({ where: { key } });
    if (existing?.userId === request.user!.id) {
      const dto = await investmentService.get(request.user!.id, existing.id);
      return ok(dto, "Investment", 200);
    }
    const investment = await investmentService.confirm(
      request.user!.id,
      body.quote_id,
      body.authorization_id,
      key,
    );
    const res = accepted(investment, "Investment accepted");
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  },
  [
    authMiddleware,
    originMiddleware,
    idempotencyKeyMiddleware,
    bodyValidatorMiddleware(investmentConfirmBodySchema),
  ],
);
