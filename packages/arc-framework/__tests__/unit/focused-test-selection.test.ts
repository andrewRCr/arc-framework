/** Exact operand contribution is decided over configured specifications without workers. */
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { selectExactSpecifications } from "../../src/lib/focused-test-selection.js";
import type { FocusedTestTarget } from "../../src/lib/focused-test-input.js";
import { makeVitestControllerFake } from "../helpers/vitest-controller-fake.js";

const root = resolve("selection-fixture");
function target(operand: string, kind: FocusedTestTarget["kind"] = "file"): FocusedTestTarget {
  return { operand, path: resolve(root, operand), kind };
}
function specifications() {
  return makeVitestControllerFake([
    { path: resolve(root, "integration/runtime.test.ts"), project: "integration" },
    { path: resolve(root, "unit/named.test.ts"), project: "unit" },
    { path: resolve(root, "unit/named.test.ts-adjacent.test.ts"), project: "unit" },
    { path: resolve(root, "unit/dir/included.test.ts"), project: "unit" },
    { path: resolve(root, "unit/dir-adjacent/sibling.test.ts"), project: "unit" },
  ]).specifications;
}
it.each([
  { operand: "unit/named.test.ts", kind: "file", expected: ["unit/named.test.ts"] },
  { operand: "unit/dir", kind: "directory", expected: ["unit/dir/included.test.ts"] },
] as const)("selects exactly $operand without adjacent configured files", ({ operand, kind, expected }) => {
  expect(selectExactSpecifications([target(operand, kind)], specifications()).map(({ moduleId }) => moduleId))
    .toEqual(expected.map((file) => resolve(root, file)));
});
it.each(["unit/excluded.test.ts", "unit/helper.ts", "unit/empty"])(
  "refuses noncontributing %s beside a valid operand", (operand) => {
    expect(() => selectExactSpecifications([target("unit/named.test.ts"), target(operand,
      operand === "unit/empty" ? "directory" : "file")], specifications())).toThrow(operand);
  });
it("requires contribution after native project filtering", () => {
  const filtered = specifications().filter(({ project }) => project.name === "integration");
  expect(() => selectExactSpecifications([target("unit/named.test.ts"), target("integration/runtime.test.ts")], filtered))
    .toThrow("unit/named.test.ts");
});
it("retains configured order and identity once across overlapping operands", () => {
  const candidates = specifications();
  const selected = selectExactSpecifications([target("unit/named.test.ts"), target("unit", "directory"),
    target("integration/runtime.test.ts")], candidates);
  expect(selected).toEqual(candidates);
  expect(selected[0]).toBe(candidates[0]);
  expect(selected.filter(({ moduleId }) => moduleId === resolve(root, "unit/named.test.ts"))).toHaveLength(1);
});
