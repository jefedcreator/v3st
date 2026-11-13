import { createHash } from "node:crypto";

const REDACT_KEY =
  /(token|secret|password|account_?number|bvn|id_?number|phone|signature|authorization|cookie)/i;

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      if (REDACT_KEY.test(key)) {
        out[key] = "[redacted]";
      } else {
        out[key] = redact(val);
      }
    }
    return out;
  }
  return value;
}

export function sha256Hex(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item));
  }
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortValue((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value), (_key, val: unknown) =>
    typeof val === "bigint" ? val.toString() : val,
  );
}
