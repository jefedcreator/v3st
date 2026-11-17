import {
  authMiddleware,
  bodyValidatorMiddleware,
  idempotencyKeyMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appOrdersService } from "@/backend/services/app/orders";
import {
  orderPlaceBodySchema,
  type OrderPlaceBodySchema,
} from "@/backend/validators/app/orders.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<OrderPlaceBodySchema, null, null>(
  async (request) => {
    const { preview_id, pin } = request.validatedData!;
    const { dto, created } = await appOrdersService.place(
      request.user!.id,
      { previewId: preview_id, pin },
      request.idempotencyKey!,
    );
    return ok(dto, "Order placed", created ? 201 : 200);
  },
  [
    authMiddleware,
    originMiddleware,
    idempotencyKeyMiddleware,
    bodyValidatorMiddleware(orderPlaceBodySchema),
  ],
  { audience: "customer" },
);
