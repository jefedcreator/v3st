import {
  authMiddleware,
  queryValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { earningsService } from "@/backend/services/earnings";
import {
  paginationQuerySchema,
  type PaginationQuerySchema,
} from "@/backend/validators/index.validator";
import { paginated } from "@/utils/response";

export const GET = withMiddleware<unknown, PaginationQuerySchema>(
  async (request) => {
    const result = await earningsService.list(request.user!.id, request.query!);
    return paginated(result.data, "Earnings", result.page, result.size, result.total);
  },
  [authMiddleware, queryValidatorMiddleware(paginationQuerySchema)],
);
