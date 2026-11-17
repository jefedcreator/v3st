import type { NextRequest } from "next/server";
import { expect } from "vitest";

import { findCustomerLeaks } from "@/backend/services/app/vocabulary";

import { callRoute } from "./http";

type RouteHandler = (
  req: NextRequest,
  context: { params: Promise<Record<string, string>> },
) => Promise<Response>;

// Calls a customer route and asserts the whole response body is free of
// internal vocabulary before returning it.
export async function callAppRoute(
  handler: RouteHandler,
  opts: Parameters<typeof callRoute>[1] & { documents?: boolean },
): ReturnType<typeof callRoute> {
  const res = await callRoute(handler, opts);
  const leaks = findCustomerLeaks(res.json, { documents: opts.documents });
  expect(leaks).toEqual([]);
  return res;
}
