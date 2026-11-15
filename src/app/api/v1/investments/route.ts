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
    const { dto, created } = await investmentService.confirmRequest(
      request.user!.id, body.quote_id, body.authorization_id, request.idempotencyKey!,
    );
    const res = created ? accepted(dto, "Accepted") : ok(dto, "Existing operation");
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
