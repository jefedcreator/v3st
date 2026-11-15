import { ratesService } from "@/backend/services/rates";
import { ngnToUsd } from "@/utils/money";
import {
  authMiddleware,
  bodyValidatorMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { strategyService, type StrategyQuoteInput } from "@/backend/services/strategies";
import {
  strategyQuoteBodySchema,
  type StrategyQuoteBodySchema,
} from "@/backend/validators/strategy.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<StrategyQuoteBodySchema, null, null>(
  async (request) => {
    const body = request.validatedData!;
    let input: StrategyQuoteInput;
    if (body.action === "enter") {
      const budgetRaw = body.budget_ngn === undefined ? body.budget_raw : ngnToUsd(body.budget_ngn, (await ratesService.display()).depositRate, "floor");
      input =
        budgetRaw !== undefined
          ? { strategyId: body.strategy_id!, action: "enter", budgetInputRaw: budgetRaw }
          : {
              strategyId: body.strategy_id!,
              action: "enter",
              inputs: body.inputs!.map((a) => ({ asset: a.asset, raw: a.raw })),
            };
    } else if (body.action === "exit") {
      input = { positionId: body.position_id!, action: "exit" };
    } else if (body.position_id) {
      input = { positionId: body.position_id, action: "claim" };
    } else {
      input = { strategyId: body.strategy_id!, action: "claim" };
    }
    const quote = await strategyService.quote(request.user!.id, input);
    const res = ok(quote, "Strategy quote");
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  },
  [authMiddleware, originMiddleware, bodyValidatorMiddleware(strategyQuoteBodySchema)],
);
