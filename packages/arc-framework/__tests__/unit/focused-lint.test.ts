/** Root lint target normalization preserves literal native tokens without loading ESLint. */
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { normalizeFocusedLintInput } from "../../src/lib/focused-lint-input.js";

const root = resolve("lint-fixture");
const packageRoot = resolve(root, "packages/arc-framework");
it.each(["src/targets/suppressed.ts", "src/targets", "src/targets/*.ts"])(
  "normalizes repository-relative %s in package cwd", (target) => {
    expect(normalizeFocusedLintInput(root, [`packages/arc-framework/${target}`]))
      .toEqual({ packageRoot, arguments: [target] });
  });
it.each([
  { args: [] }, { args: ["--", "--format", "json"] }, { args: ["--format"] },
  { args: [resolve(root, "absolute.ts")] },
])("refuses invalid root-target span $args before native loading", ({ args }) => {
  expect(() => normalizeFocusedLintInput(root, args)).toThrow("repository-relative lint target");
});
it("retains literal option values and additional native patterns after the delimiter", () => {
  expect(normalizeFocusedLintInput(root, ["packages/arc-framework/src/targets/failing.ts", "--",
    "--config", "native values/alternate config.mjs", "--format", "json", "src/extra/*.ts"]))
    .toEqual({ packageRoot, arguments: ["src/targets/failing.ts", "--config", "native values/alternate config.mjs",
      "--format", "json", "src/extra/*.ts"] });
});
it.each(["space name.ts", "über-工具.ts", "tab\tname.ts", "line\nname.ts"])(
  "retains literal target bytes for %j", (name) => {
    expect(normalizeFocusedLintInput(root, [`packages/arc-framework/src/targets/${name}`]).arguments)
      .toEqual([`src/targets/${name}`]);
  });
