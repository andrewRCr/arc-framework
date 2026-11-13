/** Late-change classification depends on held observations, including recorded branch disappearance. */
import { expect, it } from "vitest";
import { windowComparisonRange } from "../../../src/scripts/cutover-window/comparison-marks.js";

it.each([
  ["compared", "old", "new", "moved"],
  ["gone", "old", "old", "gone"],
  ["compared", null, "new", "unrecorded"],
] as const)("classifies %s observations with recorded %s and mark %s", (kind, recorded, tip, range) => {
  const result = windowComparisonRange({ branch: "feat/name/slash", side: "origin", kind, recorded, tip, base: "base" });
  expect(result).toEqual(range === null ? null : { branch: "feat/name/slash", side: "origin", kind: range, from: "base", tip });
});
