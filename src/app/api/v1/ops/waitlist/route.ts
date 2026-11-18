import {
  authMiddleware,
  operatorMiddleware,
  queryValidatorMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { waitlistService } from "@/backend/services/waitlist";
import {
  paginationQuerySchema,
  type PaginationQuerySchema,
} from "@/backend/validators/index.validator";
import { paginated } from "@/utils/response";

export const GET = withMiddleware<null, null, PaginationQuerySchema>(
  async (request) => {
    const { page, size } = request.query!;
    const result = await waitlistService.list({ page, size });
    return paginated(result.items, "Waitlist", page, size, result.total);
  },
  [authMiddleware, operatorMiddleware, queryValidatorMiddleware(paginationQuerySchema)],
);
