import { cache } from "react";

import { reportError } from "@/backend/observability";
import { appCatalogService } from "@/backend/services/app/catalog";
import { PUBLIC_TICKERS, STOCK_PROFILES } from "@/backend/content/stock-profiles";
import type { PublicTickerDto, PublicTickerRow } from "@/types/landing";

// The landing page's ticker read, memoized per request. It never throws into the
// page: any failure is reported and answered with null, which the page renders as
// profile-only rows with no numbers.
export const getLandingTicker = cache(async (): Promise<PublicTickerDto | null> => {
  try {
    return await appCatalogService.publicTicker();
  } catch (error) {
    reportError(error, { area: "landing-ticker" });
    return null;
  }
});

export function profileOnlyTicker(): PublicTickerDto {
  const rows: PublicTickerRow[] = PUBLIC_TICKERS.map((ticker) => {
    const profile = STOCK_PROFILES[ticker]!;
    return {
      ticker,
      name: profile.name,
      sector: profile.sector,
      logo_path: profile.logoPath ?? "",
      price_kobo: null,
      price_status: "unavailable",
      price_is_estimate: profile.estimatedPrice,
      price_as_of: null,
      change_24h_bps: null,
      line_kobo: [],
    };
  });
  return { rows, as_of: null };
}
