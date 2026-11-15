import {
  authMiddleware,
  bodyValidatorMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { investmentService } from "@/backend/services/investments";
import {
  investmentQuoteBodySchema,
  type InvestmentQuoteBodySchema,
} from "@/backend/validators/investment.validator";
import { ok } from "@/utils/response";

export const POST = withMiddleware<InvestmentQuoteBodySchema, null, null>(
  async (request) => {
    const body = request.validatedData!;
    const quote = await investmentService.quote(request.user!.id, {
      stockId: body.stock_id,
      side: body.side,
      inputRaw: body.input_raw ?? body.quantity_raw,
      budgetNgn: body.budget_ngn,
      slippageBps: body.slippage_bps,
      allowPartialFill: body.allow_partial_fill,
    });
    const res = ok(quote, "Investment quote");
    res.headers.set("Cache-Control", "private, no-store");
    return res;
  },
  [authMiddleware, originMiddleware, bodyValidatorMiddleware(investmentQuoteBodySchema)],
);
