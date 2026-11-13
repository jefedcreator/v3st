import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyPaycrestSignature(
  headers: Headers,
  raw: Uint8Array,
  secret: string,
): boolean {
  const provided = headers.get("X-Paycrest-Signature");
  if (!provided) return false;
  const expected = createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
