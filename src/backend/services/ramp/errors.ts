export type ProviderErrorKind =
  | "transient"
  | "rejected"
  | "duplicate"
  | "rate_moved"
  | "not_found";

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly code: string;

  constructor(kind: ProviderErrorKind, code: string) {
    super(code);
    this.name = "ProviderError";
    this.kind = kind;
    this.code = code;
    Object.setPrototypeOf(this, ProviderError.prototype);
  }
}
