import {
  authMiddleware,
  bodyValidatorMiddleware,
  operatorMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { operationsService } from "@/backend/services/operations";
import { controlSchema, type ControlSchema } from "@/backend/validators/ops.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<ControlSchema, null, null>(
  async (request) => {
    const body = request.validatedData!;
    const control = await operationsService.setControl(request.user!.id, body);
    return ok(control, "Control updated");
  },
  [authMiddleware, operatorMiddleware, originMiddleware, bodyValidatorMiddleware(controlSchema)],
);
