import { policy } from "@/backend/config/policy";

import type { TransferSpec } from "./index";

export class PolicyViolation extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.name = "PolicyViolation";
    this.code = code;
    Object.setPrototypeOf(this, PolicyViolation.prototype);
  }
}

export function assertTransferPolicy(
  spec: TransferSpec,
  resolved: { fromAddress: string; toAddress: string; boundAddress: string | null },
): void {
  if (spec.amount <= 0n) {
    throw new PolicyViolation("POLICY");
  }
  if (spec.from.kind === "user") {
    if (spec.amount > policy.treasury.userTransferCapMicroUsdc) {
      throw new PolicyViolation("POLICY");
    }
    if (resolved.boundAddress === null || resolved.toAddress !== resolved.boundAddress) {
      throw new PolicyViolation("POLICY");
    }
    return;
  }
  if (spec.amount > policy.treasury.treasuryTransferCapMicroUsdc) {
    throw new PolicyViolation("POLICY");
  }
  const toAllowed =
    spec.to.kind === "user" ||
    (spec.purpose === "float_topup" && spec.to.kind === "external");
  if (!toAllowed) {
    throw new PolicyViolation("POLICY");
  }
}
