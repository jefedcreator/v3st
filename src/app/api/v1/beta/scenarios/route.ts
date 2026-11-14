import {
  authMiddleware,
  bodyValidatorMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { scenarioService } from "@/backend/services/scenarios";
import {
  scenarioBodySchema,
  type ScenarioBodySchema,
} from "@/backend/validators/scenario.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<ScenarioBodySchema>(
  async (request) => {
    const body = request.validatedData!;
    const result = await scenarioService.run(request.user!.id, body);
    return ok(result, "Scenario applied");
  },
  [authMiddleware, originMiddleware, bodyValidatorMiddleware(scenarioBodySchema)],
);
