import { expect, it } from "vitest";
import { keysForAreas } from "@/hooks/app/query-keys";

it("maps stream areas to query keys", () => {
  expect(keysForAreas(["cash"])).toEqual([["cash"], ["home"], ["deposit"]]);
  expect(keysForAreas(["notifications", "unknown"])).toEqual([["notifications"], ["session"]]);
  expect(keysForAreas(["home", "cash"])).toEqual([["home"], ["cash"], ["deposit"]]);
});
