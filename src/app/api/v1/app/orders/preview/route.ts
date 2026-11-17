import {
  authMiddleware,
  bodyValidatorMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { appOrdersService } from "@/backend/services/app/orders";
import {
  orderPreviewBodySchema,
  type OrderPreviewBody,
} from "@/backend/validators/app/orders.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<OrderPreviewBody, null, null>(
  async (request) => {
    return ok(
      await appOrdersService.preview(request.user!.id, request.validatedData!),
      "Order preview",
    );
  },
  [authMiddleware, originMiddleware, bodyValidatorMiddleware(orderPreviewBodySchema)],
  { audience: "customer" },
);
