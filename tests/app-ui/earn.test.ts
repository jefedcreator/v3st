import { expect, it } from "vitest";

import { joinReady, positionView } from "@/components/app/earn/earn";
import type { AppEarnPositionDto } from "@/types/app";

function pos(status: AppEarnPositionDto["status"]): AppEarnPositionDto {
  return {
    id: "pos1",
    status,
    added_kobo: "500000",
    value_kobo: null,
    earned_kobo: "0",
    joined_at: "2026-11-19T10:00:00Z",
  };
}

it("offers only the actions a position allows", () => {
  expect(positionView(null, true)).toEqual({ canJoin: true, canLeave: false, statusText: null });
  expect(positionView(null, false)).toEqual({
    canJoin: false,
    canLeave: false,
    statusText: "Not available right now",
  });
  expect(positionView(pos("active"), true)).toEqual({
    canJoin: false,
    canLeave: true,
    statusText: "Active",
  });
  expect(positionView(pos("processing"), true).statusText).toBe(
    "Joining. This can take a few minutes.",
  );
  expect(positionView(pos("withdrawing"), true).statusText).toBe(
    "Withdrawing. This can take a few minutes.",
  );
  expect(positionView(pos("withdrawn"), true)).toEqual({
    canJoin: true,
    canLeave: false,
    statusText: "Withdrawn",
  });
  expect(positionView(pos("action_needed"), true)).toEqual({
    canJoin: false,
    canLeave: false,
    statusText: "Needs a check before it can continue.",
  });
});

it("needs the risks accepted and a PIN before joining", () => {
  expect(joinReady(false, "1357")).toBe(false);
  expect(joinReady(true, "135")).toBe(false);
  expect(joinReady(true, "1357")).toBe(true);
});
