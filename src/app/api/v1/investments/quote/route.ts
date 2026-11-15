import {
  authMiddleware,
  bodyValidatorMiddleware,
  originMiddleware,
  withMiddleware,
} from "@/backend/middleware";
import { investmentService } from "@/backend/services/investments";
import { ratesService } from "@/backend/services/rates";
import {
  investmentQuoteBodySchema,
  type InvestmentQuoteBodySchema,
} from "@/backend/validators/investment.validator";
import { ngnToUsd } from "@/utils/money";
import { ServiceUnavailableException } from "@/utils/exceptions";
import { ok } from "@/utils/response";

export const POST = withMiddleware<InvestmentQuoteBodySchema, null, null>(
  async (request) => {
    const body = request.validatedData!;
    let inputRaw = body.input_raw;
    if (inputRaw === undefined) {
      // Buy sized in naira: convert at the current deposit rate (kobo -> micro USD).
      const display = await ratesService.display().catch(() => {
        throw new ServiceUnavailableException("Rates unavailable", "RATES_UNAVAILABLE");
      });
      inputRaw = ngnToUsd(body.budget_ngn!, display.depositRate, "floor");
    }
    const quote = await investmentService.quote(request.user!.id, {
      stockId: body.stock_id,
      side: body.side,
      inputRaw,
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
