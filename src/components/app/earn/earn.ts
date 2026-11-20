import type { AppEarnPositionDto } from "@/types/app";

// Which actions a position allows, and what to say while it moves.
export function positionView(
  position: AppEarnPositionDto | null,
  available: boolean,
): { canJoin: boolean; canLeave: boolean; statusText: string | null } {
  if (position === null) {
    if (available) return { canJoin: true, canLeave: false, statusText: null };
    return { canJoin: false, canLeave: false, statusText: "Not available right now" };
  }
  switch (position.status) {
    case "active":
      return { canJoin: false, canLeave: true, statusText: "Active" };
    case "processing":
      return {
        canJoin: false,
        canLeave: false,
        statusText: "Joining. This can take a few minutes.",
      };
    case "withdrawing":
      return {
        canJoin: false,
        canLeave: false,
        statusText: "Withdrawing. This can take a few minutes.",
      };
    case "withdrawn":
      return { canJoin: true, canLeave: false, statusText: "Withdrawn" };
    case "action_needed":
      return {
        canJoin: false,
        canLeave: false,
        statusText: "Needs a check before it can continue.",
      };
  }
}

export function joinReady(acceptedRisk: boolean, pin: string): boolean {
  return acceptedRisk && /^[0-9]{4}$/.test(pin);
}
