/** Native lint diagnostics for explicit checkout-removal policy bindings. */
import { resolve } from "node:path";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { expect, it } from "vitest";
import { projectionRemovalBindingRule } from "../../eslint/projection-removal-binding.js";

const packageRoot = resolve(import.meta.dirname, "../..");
const ruleId = "arc/projection-removal-binding";
const files = ["src/commands/start.ts", "src/commands/rename.ts", "src/commands/rename-store.ts", "src/handlers/lifecycle.ts"];
const engine = new ESLint({
  cwd: packageRoot,
  overrideConfigFile: true,
  overrideConfig: [{
    files: ["**/*.ts"],
    languageOptions: { parser: tseslint.parser },
    plugins: { arc: { rules: { "projection-removal-binding": projectionRemovalBindingRule } } },
    rules: { [ruleId]: "error" },
  }],
});

async function lint(source: string, filePath: string) {
  const [result] = await engine.lintText(source, { filePath: resolve(packageRoot, filePath) });
  if (result === undefined) throw new Error("Expected the fixture to be linted");
  expect(result.fatalErrorCount).toBe(0);
  return result.messages;
}

it.each([
  { file: files[0], callee: "reconcileWorkUnitWorktree", missing: "{ exec, store }", bound: "{ exec, store, projectionRemovalSlots }" },
  { file: files[1], callee: "reconcileWorkUnitWorktree", missing: "{ ...context }", bound: "{ ...context, projectionRemovalSlots }" },
  { file: files[2], callee: "checkoutMove", missing: "{ exec, store }", bound: "{ exec, store, projectionRemovalSlots }" },
  { file: files[2], callee: "reconcileWorkUnitWorktree", missing: "{ ...context }", bound: "{ ...context, projectionRemovalSlots: context.projectionRemovalSlots }" },
  { file: files[3], callee: "runPark", missing: "{ executor, removal: { exec } }", bound: "{ executor, removal: { exec, check: slots.check } }" },
  { file: files[3], callee: "runAbandon", missing: "{ executor }", bound: "{ executor, removal: { exec, check: slots.check } }" },
])("requires explicit policy for $callee in $file", async ({ file, callee, missing, bound }) => {
  if (file === undefined) throw new Error("Expected an enumerated composition file");
  expect(await lint(`${callee}(${missing}, operation);`, file)).toEqual([
    expect.objectContaining({ ruleId, messageId: "missing", line: 1, column: 1, severity: 2 }),
  ]);
  expect(await lint(`${callee}(${bound}, operation);`, file)).toEqual([]);
});

it("requires policy on both rename directions", async () => {
  const source = "reconcileWorkUnitWorktree({ exec, store }, forward);\nreconcileWorkUnitWorktree({ exec, store }, inverse);";
  expect(await lint(source, "src/commands/rename.ts")).toEqual([
    expect.objectContaining({ ruleId, messageId: "missing", line: 1 }),
    expect.objectContaining({ ruleId, messageId: "missing", line: 2 }),
  ]);
  expect(await lint(source.replaceAll("{ exec, store }", "{ exec, store, projectionRemovalSlots }"), "src/commands/rename.ts")).toEqual([]);
});

it.each(["", "context", "{ removal: context }"])("rejects an opaque or absent context (%s)", async argument => {
  expect(await lint(`runPark(${argument});`, "src/handlers/lifecycle.ts")).toEqual([
    expect.objectContaining({ ruleId, messageId: "missing" }),
  ]);
  expect(await lint('runPark({ "removal": { "check": slots.check } });', "src/handlers/lifecycle.ts")).toEqual([]);
});

it.each(files)("enables the production guard for %s", async file => {
  const config = await new ESLint({ cwd: packageRoot }).calculateConfigForFile(resolve(packageRoot, file)) as { rules?: Record<string, unknown> };
  expect(config.rules?.[ruleId]).toEqual([2]);
});
