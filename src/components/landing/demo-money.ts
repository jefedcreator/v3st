import { landingDemoFixture } from "./demo-fixtures";
const unsigned = /^(0|[1-9]\d*)$/;
function minor(raw: string, signed = false): bigint {
  if (!(signed ? /^(0|-?[1-9]\d*)$/ : unsigned).test(raw))
    throw new Error("Expected a canonical integer string");
  return BigInt(raw);
}
export function formatNgn(kobo: string): string {
  const value = minor(kobo, true),
    absolute = value < 0n ? -value : value;
  const whole = (absolute / 100n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const cents = absolute % 100n;
  return `${value < 0n ? "−" : ""}₦${whole}${cents ? "." + cents.toString().padStart(2, "0") : ""}`;
}
export function formatUnits(raw: string, decimals: number): string {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18)
    throw new Error("Decimals must be an integer from 0 through 18");
  const value = minor(raw),
    scale = 10n ** BigInt(decimals);
  if (!decimals) return value.toString();
  const fraction = (value % scale)
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return (value / scale).toString() + (fraction ? "." + fraction : "");
}
export function payoutPreview(grossKobo: string): {
  status: "rollover" | "qualifies";
  grossKobo: string;
  feeKobo: string;
  receivedKobo: string;
  rolloverKobo: string;
} {
  const gross = minor(grossKobo),
    fixture = landingDemoFixture.proceeds;
  if (gross < BigInt(fixture.minimumGrossKobo))
    return {
      status: "rollover",
      grossKobo,
      feeKobo: "0",
      receivedKobo: "0",
      rolloverKobo: grossKobo,
    };
  const fee = BigInt(fixture.feeKobo);
  return {
    status: "qualifies",
    grossKobo,
    feeKobo: fixture.feeKobo,
    receivedKobo: (gross - fee).toString(),
    rolloverKobo: "0",
  };
}
