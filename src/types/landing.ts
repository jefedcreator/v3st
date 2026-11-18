import type { AppPriceStatus } from "@/types/app";

// Public landing-page DTOs. Wire format follows the app contract: naira as
// integer-string kobo, ISO times, snake_case keys that pass the customer
// vocabulary check.

export type PublicTickerRow = {
  ticker: string;
  name: string;
  sector: string;
  logo_path: string;
  price_kobo: string | null;
  price_status: AppPriceStatus;
  price_is_estimate: boolean;
  price_as_of: string | null;
  change_24h_bps: number | null;
  line_kobo: string[];
};

export type PublicTickerDto = { rows: PublicTickerRow[]; as_of: string | null };

export type WaitlistSource = "hero" | "join" | "waitlist_page";

export type WaitlistJoinDto = { joined: true };

export type WaitlistEntryDto = {
  email: string;
  source: WaitlistSource;
  privacy_version: string;
  created_at: string;
};
