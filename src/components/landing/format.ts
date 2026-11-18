// Browser-safe exact formatters. Money is BigInt minor units (kobo) as
// integer strings; no float ever touches a naira amount.

function parseKobo(kobo: string): bigint {
  if (!/^-?(0|[1-9]\d*)$/.test(kobo)) throw new Error(`invalid kobo amount: ${JSON.stringify(kobo)}`);
  return BigInt(kobo);
}

function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

const NAIRA = "₦";
const MINUS = "−";

// Whole naira when divisible by 100, otherwise 2 decimals; true minus sign
// for negatives.
export function formatNaira(kobo: string): string {
  const value = parseKobo(kobo);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const whole = abs / 100n;
  const frac = abs % 100n;
  const wholeText = groupDigits(whole.toString());
  const body = frac === 0n ? wholeText : `${wholeText}.${frac.toString().padStart(2, "0")}`;
  return `${negative ? MINUS : ""}${NAIRA}${body}`;
}

// Ticker prices round half-up to whole naira at ₦1,000 and above; below that
// they show 2 decimals.
export function formatTickerPrice(kobo: string): string {
  const value = parseKobo(kobo);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  if (abs >= 100_000n) {
    const rounded = (abs + 50n) / 100n;
    return `${negative ? MINUS : ""}${NAIRA}${groupDigits(rounded.toString())}`;
  }
  return formatNaira(kobo);
}

// Signed 24h change with a true minus: "+1.24%", "−0.86%", "0.00%".
export function formatChangeBps(bps: number): string {
  const sign = bps > 0 ? "+" : bps < 0 ? MINUS : "";
  const abs = Math.abs(bps);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}${whole}.${frac.toString().padStart(2, "0")}%`;
}

const lagosTimeFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const lagosDayFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Lagos",
  weekday: "short",
  day: "numeric",
  month: "short",
});
const lagosDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Africa/Lagos",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function sameDayInLagos(a: Date, b: Date): boolean {
  return lagosDateFormat.format(a) === lagosDateFormat.format(b);
}

// The ticker caption: dated only when the newest price is not from today in
// Lagos; a total fallback when no prices are available.
export function formatPriceCaption(asOf: string | null, now: Date): string {
  if (asOf === null) return "Beta prices appear here when they're available.";
  const at = new Date(asOf);
  const time = lagosTimeFormat.format(at);
  if (sameDayInLagos(at, now)) return `Beta prices in naira · updated ${time} Lagos time`;
  return `Beta prices in naira · updated ${lagosDayFormat.format(at)}, ${time} Lagos time`;
}

// Counter text: while counting, decimals widen below 100/10 like Katana's
// counters; when settled, exactly `decimals`.
export function counterText(
  value: number,
  decimals: number,
  prefix: string,
  suffix: string,
  settled: boolean,
): string {
  const d = settled
    ? decimals
    : value >= 100
      ? decimals
      : value >= 10
        ? Math.max(decimals, 1)
        : Math.max(decimals, 2);
  const fixed = value.toFixed(d);
  const dot = fixed.indexOf(".");
  const int = dot === -1 ? fixed : fixed.slice(0, dot);
  const frac = dot === -1 ? "" : fixed.slice(dot + 1);
  return `${prefix}${groupDigits(int)}${frac ? `.${frac}` : ""}${suffix}`;
}
