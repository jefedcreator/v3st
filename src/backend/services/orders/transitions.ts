import type { OrderStatus } from "@/server/prisma";

export const DEPOSIT_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  created: ["awaiting_transfer", "failed"],
  awaiting_transfer: ["received", "expired", "refunded", "failed"],
  received: ["funded"],
  funded: ["settled"],
  expired: ["received", "refunded"],
  refunded: [],
  failed: [],
  settled: [],
  funds_collected: [],
  submitted: [],
  paid: [],
  reversed: [],
};

export const PAYOUT_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  created: ["funds_collected", "failed"],
  funds_collected: ["submitted", "reversed"],
  submitted: ["paid", "reversed"],
  awaiting_transfer: [],
  received: [],
  funded: [],
  expired: [],
  refunded: [],
  failed: [],
  settled: [],
  paid: [],
  reversed: [],
};
