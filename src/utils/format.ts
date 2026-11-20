// Browser-safe exact formatters shared by the landing and the customer app.
// Money is BigInt kobo as integer strings; no float ever touches an amount.

export function parseKobo(kobo: string): bigint {
  if (!/^-?(0|[1-9]\d*)$/.test(kobo)) throw new Error(`invalid kobo amount: ${JSON.stringify(kobo)}`);
  return BigInt(kobo);
}

export function groupDigits(digits: string): string {
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

// Signed naira: "+" for in, "−" for out, nothing for none.
export function formatSignedNaira(kobo: string, direction: "in" | "out" | "none"): string {
  const body = formatNaira(kobo);
  if (direction === "in") return `+${body}`;
  if (direction === "out") return `${MINUS}${body}`;
  return body;
}

// Signed 24h change with a true minus: "+1.24%", "−0.86%", "0.00%".
export function formatChangeBps(bps: number): string {
  const sign = bps > 0 ? "+" : bps < 0 ? MINUS : "";
  const abs = Math.abs(bps);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  return `${sign}${whole}.${frac.toString().padStart(2, "0")}%`;
}

// Shares are BigInt millionths ("1000000" is exactly one share). Trailing
// zeros trim to the significant fraction; thousands group; singular when 1.
export function formatShares(sharesMicro: string): string {
  const value = parseKobo(sharesMicro);
  const abs = value < 0n ? -value : value;
  if (abs === 1_000_000n) return "1 share";
  const whole = abs / 1_000_000n;
  const frac = abs % 1_000_000n;
  const fracDigits = frac.toString().padStart(6, "0").replace(/0+$/, "");
  if (fracDigits === "") return `${groupDigits(whole.toString())} shares`;
  return `${groupDigits(whole.toString())}.${fracDigits} shares`;
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

// A date-only value ("2026-11-20") is read as Lagos noon on that date.
function toDateInLagos(value: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T12:00:00+01:00`);
  return new Date(value);
}

export function formatLagosTime(iso: string): string {
  return lagosTimeFormat.format(toDateInLagos(iso));
}

export function formatLagosDay(value: string): string {
  return lagosDayFormat.format(toDateInLagos(value));
}

export function formatLagosDateTime(iso: string): string {
  const at = toDateInLagos(iso);
  return `${lagosDayFormat.format(at)}, ${lagosTimeFormat.format(at)}`;
}

// "Today", "Yesterday", then "Mon 16 Nov", all in Lagos days.
export function lagosDayLabel(iso: string, now: Date): string {
  const key = lagosDateFormat.format(toDateInLagos(iso));
  const todayKey = lagosDateFormat.format(now);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayKey = lagosDateFormat.format(yesterday);
  if (key === todayKey) return "Today";
  if (key === yesterdayKey) return "Yesterday";
  return lagosDayFormat.format(toDateInLagos(iso));
}

// Counts down to an expiry: mm:ss under an hour, h:mm:ss above, "00:00" done.
export function countdown(expiresAt: string, now: Date): { text: string; done: boolean } {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (ms <= 0) return { text: "00:00", done: true };
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = minutes.toString().padStart(2, "0");
  const ss = seconds.toString().padStart(2, "0");
  if (hours > 0) return { text: `${hours}:${mm}:${ss}`, done: false };
  return { text: `${mm}:${ss}`, done: false };
}

// Turns typed naira ("₦12,500.50") into exact kobo ("1250050"), or null.
export function parseNairaInput(text: string): string | null {
  const stripped = text.replace(/[₦\s,]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(stripped)) return null;
  const dot = stripped.indexOf(".");
  let whole: string;
  let fracText: string;
  if (dot === -1) {
    whole = stripped;
    fracText = "0";
  } else {
    whole = stripped.slice(0, dot);
    fracText = stripped.slice(dot + 1).padEnd(2, "0");
  }
  const wholeDigits = whole.replace(/^0+(?=\d)/, "");
  const kobo = BigInt(wholeDigits) * 100n + BigInt(fracText);
  return kobo.toString();
}
