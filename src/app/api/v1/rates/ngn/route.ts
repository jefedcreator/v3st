import { withMiddleware } from "@/backend/middleware";
import { ratesService } from "@/backend/services/rates";
import { rateToDto } from "@/utils/money";
import { HttpException, ServiceUnavailableException } from "@/utils/exceptions";
import { ok } from "@/utils/response";

export const GET = withMiddleware<null, null, null>(async () => {
  try {
    const r = await ratesService.display();
    return ok(
      {
        provider: r.provider,
        deposit_rate: rateToDto(r.depositRate),
        payout_rate: rateToDto(r.payoutRate),
        as_of: r.asOf.toISOString(),
        expires_at: r.expiresAt.toISOString(),
      },
      "Exchange rates",
    );
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new ServiceUnavailableException("Rates unavailable", "RATES_UNAVAILABLE");
  }
}, []);
