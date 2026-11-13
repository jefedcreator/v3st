import * as Sentry from "@sentry/nextjs";

export function logRequest(
  method: string,
  url: string,
  statusCode: number,
  duration: number,
  payload?: unknown,
): void {
  const message = `${method} ${url} ${statusCode} - ${duration}ms`;
  if (statusCode >= 500) {
    console.error(message);
  } else {
    console.log(message);
  }
  if (
    payload !== null &&
    payload !== undefined &&
    typeof payload === "object" &&
    Object.keys(payload).length > 0
  ) {
    console.debug(`Payload: ${JSON.stringify(payload)}`);
  }
}

export function reportError(error: unknown, context: Record<string, unknown>): void {
  Sentry.captureException(error, { extra: context });
}
