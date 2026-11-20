import { policy } from "@/backend/config/policy";
import type { MoneyLimits } from "@/types/app-ui";

// The money limits the app shows, passed to the browser as strings.
export function moneyLimits(): MoneyLimits {
  return {
    depositMinKobo: policy.deposits.minKobo.toString(),
    depositMaxKobo: policy.deposits.maxKobo.toString(),
    buyMinKobo: policy.app.orders.minBuyKobo.toString(),
    earnMinKobo: policy.app.earn.minKobo.toString(),
    minPayoutKobo: policy.earnings.minPayoutKobo.toString(),
  };
}
