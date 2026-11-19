import { policy } from "@/backend/config/policy";
import { EARN_AUTOMATION_COPY } from "@/backend/content/earn-products";
import { PUBLIC_TICKERS, STOCK_PROFILES } from "@/backend/content/stock-profiles";

import { counterText, formatNaira } from "./format";

// Server-only copy and figures. Every figure is derived from policy, the stock
// profiles or the Earn copy — never typed by hand.

export type FigureSpec = {
  value: number;
  decimals: number;
  prefix: string;
  suffix: string;
  finalText: string;
  label: string;
  line?: string;
};

function nairaFigure(kobo: bigint, label: string, line?: string): FigureSpec {
  const value = Number(kobo) / 100;
  return {
    value,
    decimals: 0,
    prefix: "₦",
    suffix: "",
    finalText: counterText(value, 0, "₦", "", true),
    label,
    line,
  };
}

function percentFigure(bps: number, label: string, line?: string): FigureSpec {
  const value = bps / 100;
  return {
    value,
    decimals: 0,
    prefix: "",
    suffix: "%",
    finalText: counterText(value, 0, "", "%", true),
    label,
    line,
  };
}

function countFigure(value: number, suffix: string, label: string, line?: string): FigureSpec {
  return {
    value,
    decimals: 0,
    prefix: "",
    suffix,
    finalText: counterText(value, 0, "", suffix, true),
    label,
    line,
  };
}

const minBuy = policy.app.orders.minBuyKobo;
const minPayout = policy.earnings.minPayoutKobo;
const minEarn = policy.app.earn.minKobo;
const maxSlippageBps = policy.trading.maxSlippageBps;
const maxConversionFeeBps = policy.app.earnings.maxConversionFeeBps;
const maxFxBps = policy.app.earnings.maxFxBps;
const maxPermissionDays = Math.min(
  policy.app.earn.automation.expiryDays,
  policy.onchain.authorizationMaxDays,
);
const payoutWindow = policy.schedule.payouts;

// 24-hour policy hours as 12-hour Lagos clock copy: 8 -> "8am", 23 -> "11pm".
function hour12(hour: number): string {
  const suffix = hour < 12 ? "am" : "pm";
  const clock = hour % 12 === 0 ? 12 : hour % 12;
  return `${clock}${suffix}`;
}

const payoutWindowText = `between ${hour12(payoutWindow.startHour)} and ${hour12(payoutWindow.endHour)} Lagos time`;
const minBuyText = formatNaira(minBuy.toString());
const minEarnText = formatNaira(minEarn.toString());
const minPayoutText = formatNaira(minPayout.toString());

export const HERO_SUBLINE = `Start with ${minBuyText} in Apple, NVIDIA and other US companies. Put your money to work in Earn if you choose, and collect any earnings in your bank on Fridays.`;

export const STOCKS_BODY = `Prices track the real companies and show in naira. Buy any amount from ${minBuyText} and sell in the app at the price shown at the time.`;

export const HERO_COUNTERS: readonly FigureSpec[] = [
  nairaFigure(minBuy, "MINIMUM TO START"),
  countFigure(PUBLIC_TICKERS.length, "", "US COMPANIES IN THE BETA"),
  nairaFigure(minPayout, "SMALLEST FRIDAY PAYOUT"),
];

export const SAFEGUARD_STATS: readonly FigureSpec[] = [
  nairaFigure(0n, "NETWORK FEES YOU PAY", "We cover the cost of every transaction."),
  percentFigure(maxSlippageBps, "MOST A TRADE CAN SLIP", "If the price moves further while your order fills, the trade stops and your cash stays put."),
  countFigure(maxPermissionDays, " days", "LONGEST AUTOMATIC PERMISSION", `Anything done for you in the background needs your permission, and it ends after ${maxPermissionDays} days unless you renew it.`),
];

export const EARN_CARDS: readonly {
  figure: string;
  label: string;
  title: string;
  body: string;
}[] = [
  {
    figure: formatNaira(minEarn.toString()),
    label: "MINIMUM TO JOIN",
    title: "Pick a pool",
    body: "Each pool is tied to one stock.",
  },
  {
    figure: "Weekly",
    label: "FEES COLLECTED",
    title: "Earn from trading",
    body: "Every trade in the pool pays a small fee. Your share is collected every Thursday night.",
  },
  {
    figure: `${maxConversionFeeBps / 100}%`,
    label: "MOST IT COSTS TO CONVERT",
    title: "Turn fees into naira",
    body: `Converting earnings to naira costs at most ${maxConversionFeeBps / 100}%, plus an exchange-rate spread of at most ${maxFxBps / 100}%.`,
  },
  {
    figure: "Any time",
    label: "TO WITHDRAW",
    title: "Leave when you like",
    body: "You get back shares and cash in whatever mix the pool holds then.",
  },
];

export const JOURNEY_STAGES: readonly {
  title: string;
  caption: string;
  icon: "Bank" | "ChartLineUp" | "Plant" | "CalendarCheck" | "ArrowUDownLeft";
}[] = [
  {
    title: "Add naira",
    caption: "Send a bank transfer from your own account to the account number we show you.",
    icon: "Bank",
  },
  {
    title: "Buy shares",
    caption: `Pick a stock and an amount from ${minBuyText}. You see the price and every fee before you confirm.`,
    icon: "ChartLineUp",
  },
  {
    title: "Earn, if you choose",
    caption: "Put money into an Earn pool to collect a share of trading fees. It's optional, separate, and it can earn nothing.",
    icon: "Plant",
  },
  {
    title: "Friday payouts",
    caption: `Earnings of ${minPayoutText} or more are sent on Fridays ${payoutWindowText}. Smaller amounts roll over to the next Friday, or you can reinvest.`,
    icon: "CalendarCheck",
  },
  {
    title: "Back to your bank",
    caption: "Withdraw cash or sell shares from the app. Money only goes to the bank account in your own verified name.",
    icon: "ArrowUDownLeft",
  },
];

export const FAQ_ITEMS: readonly {
  question: string;
  answer: string;
  link?: { text: string; href: string };
}[] = [
  {
    question: "Is this real money?",
    answer: "Not yet. V3ST is in beta and everything uses test money: no real naira moves and the shares have no cash value. We'll tell you before anything changes.",
  },
  {
    question: "Do I own the shares?",
    answer: "You get shares that track the price of the real company. They aren't direct ownership: you have no voting rights and no right to dividends.",
  },
  {
    question: "How much do I need to start?",
    answer: `${minBuyText} to buy a stock, ${minEarnText} to join an Earn pool.`,
  },
  {
    question: "Where do earnings come from?",
    answer: "Only from Earn, which you choose separately. Holding shares or cash doesn't pay anything on its own. Earn pays a share of trading fees, which aren't guaranteed and can be zero.",
  },
  {
    question: "Can I lose money?",
    answer: "Yes. Share prices go down as well as up, and an Earn pool can return less than you put in if the price moves a lot. Only invest what you'd be comfortable losing.",
  },
  {
    question: "When do I get paid?",
    answer: `Earnings of ${minPayoutText} or more are sent on Fridays ${payoutWindowText}. Smaller amounts roll over to the next Friday, and you can choose to reinvest instead. When the money reaches you depends on your bank.`,
  },
  {
    question: "What does it cost?",
    answer: `Every fee is shown as one naira figure before you confirm. Converting earnings to naira costs at most ${maxConversionFeeBps / 100}%, plus an exchange-rate spread of at most ${maxFxBps / 100}%. We cover network costs.`,
  },
  {
    question: "Do I need to know about crypto?",
    answer: "No. There's nothing extra to set up, nothing to sign and no network fees to pay. You see naira, shares and earnings.",
  },
  {
    question: "Who can join the beta?",
    answer: "We're inviting people from the waitlist in small groups. During the beta you sign in with the email you joined with.",
  },
  {
    question: "What do you do with my email?",
    answer:
      "We use it only to invite you to the beta and, once you join, to sign you in. We don't sell it.",
    link: { text: "privacy notice", href: "/legal/privacy" },
  },
];

// The Earn automation copy the "collected every Thursday night" card leans on.
// content.test.ts keeps the card's wording in step with it.
export const EARN_COLLECTION_NOTE = EARN_AUTOMATION_COPY;

// The four stocks whose badges overlap in the first Earn card's header,
// echoing Katana's token pairs. Names and logos come from the profiles.
export const EARN_BADGE_STOCKS: readonly { ticker: string; name: string; logoPath: string }[] = [
  "AAPL",
  "NVDA",
  "TSLA",
  "AMZN",
].map((ticker) => {
  const profile = STOCK_PROFILES[ticker]!;
  return { ticker, name: profile.name, logoPath: profile.logoPath ?? "" };
});
