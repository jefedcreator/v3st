import {
  authMiddleware,
  queryValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { earningsService } from "@/backend/services/earnings";
import { paginationQuerySchema } from "@/backend/validators/index.validator";
import { paginated } from "@/utils/response";

export const GET = withMiddleware<unknown, { page: number; size: number }>(
  async (request) => {
    const query = request.query as { page: number; size: number };
    const result = await earningsService.list(request.user!.id, query);
    return paginated(result.data, "Earnings", result.page, result.size, result.total);
  },
  [authMiddleware, queryValidatorMiddleware(paginationQuerySchema)],
);
