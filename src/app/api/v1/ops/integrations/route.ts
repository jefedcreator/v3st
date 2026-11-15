import {
  authMiddleware,
  operatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { operationsService } from "@/backend/services/operations";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, null, null>(
  async () => {
    return ok(await operationsService.integrations(), "Integration evidence");
  },
  [authMiddleware, operatorMiddleware],
);
