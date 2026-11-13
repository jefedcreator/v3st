import {
  authMiddleware,
  operatorMiddleware,
  withMiddleware,
  type QueryParameters,
} from "@/backend/middleware";
import { operationsService } from "@/backend/services/operations";
import { ok } from "@/utils/response";

export const GET = withMiddleware<unknown, QueryParameters>(
  async () => {
    return ok(await operationsService.status(), "Operations status");
  },
  [authMiddleware, operatorMiddleware],
);
