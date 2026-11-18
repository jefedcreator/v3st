import {
  CUSTOMER_ERROR_COPY,
  customerFieldMessage,
  type CustomerErrorCode,
} from "@/backend/services/app/copy";

const BY_CUSTOMER_CODE = new Map<CustomerErrorCode, string>(
  Object.values(CUSTOMER_ERROR_COPY).map((copy) => [copy.code, copy.message]),
);

export const WAITLIST_SUCCESS_COPY =
  "You're on the list. We'll email you when a beta place opens.";

// Maps the /waitlist?status= value to its result copy. The status is looked up
// in the customer error copy by its uppercase code; anything unrecognised
// (including markup) renders nothing.
export function waitlistStatusCopy(
  status: string | undefined,
): { tone: "success" | "error"; message: string } | null {
  if (status === undefined) return null;
  if (status === "joined") return { tone: "success", message: WAITLIST_SUCCESS_COPY };
  if (!/^[a-z][a-z0-9_]*$/.test(status)) return null;
  const upper = status.toUpperCase();
  if (upper === "CHECK_DETAILS") {
    // Email is the form's only field.
    return { tone: "error", message: customerFieldMessage("email") };
  }
  const message = BY_CUSTOMER_CODE.get(upper as CustomerErrorCode);
  if (!message) return null;
  return { tone: "error", message };
}
