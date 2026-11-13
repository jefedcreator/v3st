export type JobKind =
  | "wallets.provision"
  | "chain.progress"
  | "webhook.process"
  | "deposit.progress"
  | "payout.progress"
  | "trade.progress"
  | "treasury.progress"
  | "treasury.rebalance"
  | "earnings.harvest"
  | "earnings.float_precheck"
  | "earnings.payout_batch"
  | "reconcile.run"
  | "poll.open_work";

export type JobInput = {
  kind: JobKind;
  subjectId: string;
  runAt?: Date;
  payload?: Record<string, string>;
};

export class RetryableError extends Error {
  readonly code: string;
  readonly delayMs?: number;

  constructor(code: string, delayMs?: number) {
    super(code);
    this.name = "RetryableError";
    this.code = code;
    if (delayMs !== undefined) this.delayMs = delayMs;
    Object.setPrototypeOf(this, RetryableError.prototype);
  }
}

export class PermanentJobError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "PermanentJobError";
    this.code = code;
    Object.setPrototypeOf(this, PermanentJobError.prototype);
  }
}

export function backoffMs(attempts: number): number {
  return Math.min(5_000 * 2 ** (attempts - 1), 3_600_000);
}
