export type StockProfile = {
  name: string;
  sector: string;
  summary: string;
  logoPath: string | null;
};

const profile = (
  name: string,
  sector: string,
  summary: string,
  logoPath: string | null,
): StockProfile => ({ name, sector, summary, logoPath });

// Customer-facing profiles keyed by display ticker. Real tickers get a logo under
// /stocks/; the test fixtures have none. Summaries are plain language, no internal
// vocabulary.
export const STOCK_PROFILES: Record<string, StockProfile> = {
  AAPL: profile(
    "Apple",
    "Technology",
    "Apple designs and sells the iPhone, Mac and a range of services. It is one of the largest companies in the world by value.",
    "/stocks/aapl.svg",
  ),
  NVDA: profile(
    "NVIDIA",
    "Technology",
    "NVIDIA makes the chips that power most of the world's AI systems. Demand for its data-centre chips has grown very fast.",
    "/stocks/nvda.svg",
  ),
  TSLA: profile(
    "Tesla",
    "Cars",
    "Tesla builds electric cars and works on batteries and self-driving software. Its share price moves a lot with news about deliveries and its CEO.",
    "/stocks/tsla.svg",
  ),
  MSFT: profile(
    "Microsoft",
    "Technology",
    "Microsoft makes Windows, Office and the Azure cloud platform used by many businesses. It also owns major AI and gaming assets.",
    "/stocks/msft.svg",
  ),
  AMZN: profile(
    "Amazon",
    "Retail",
    "Amazon runs a huge online store and the AWS cloud platform behind many websites. Online shopping and cloud computing drive most of its revenue.",
    "/stocks/amzn.svg",
  ),
  GOOGL: profile(
    "Alphabet (Google)",
    "Technology",
    "Alphabet owns Google Search, YouTube and Android. Advertising on search and video is its main source of income.",
    "/stocks/googl.svg",
  ),
  META: profile(
    "Meta",
    "Technology",
    "Meta owns Facebook, Instagram and WhatsApp. Advertising across its social apps is nearly all of its revenue.",
    "/stocks/meta.svg",
  ),
  SPCX: profile(
    "SpaceX",
    "Aerospace",
    "SpaceX builds rockets and a satellite internet service. It is not listed on a public exchange, so its test price is an estimate.",
    "/stocks/spcx.svg",
  ),
  TSTA: profile(
    "Test Stock A",
    "Test",
    "A test stock used in the beta. Its price is test data and has no real value.",
    null,
  ),
  TSTB: profile(
    "Test Stock B",
    "Test",
    "A second test stock used in the beta. Its price is test data and has no real value.",
    null,
  ),
};
