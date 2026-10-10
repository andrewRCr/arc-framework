/** Architecture unions survive overlap and exact-file exceptions for future modules. */

import { ESLint } from "eslint";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { composeArchitectureBans, TYPESCRIPT_SCOPE, type ArchitectureBanRow } from "../../eslint/architecture-config.js";
import { ARCHITECTURE_RULES, createArchitectureImportsRule } from "../../eslint/architecture-imports.js";

const packageRoot = resolve(import.meta.dirname, "../..");
const outerSyntax = { selector: 'Identifier[name="outerOnly"]', message: "Outer boundary" };
const innerSyntax = { selector: 'Identifier[name="innerOnly"]', message: "Inner boundary" };
const rows: ArchitectureBanRow[] = [
  { files: [`src/${TYPESCRIPT_SCOPE}`], paths: ["outer-only"], patterns: ["blocked/**"], syntax: [outerSyntax], predicates: ["neverthrow"] },
  { files: [`src/private/${TYPESCRIPT_SCOPE}`], ignores: ["src/private/allowed.ts"], paths: ["inner-only"], syntax: [innerSyntax], predicates: ["kernel"] },
  { files: [`src/ratchet/${TYPESCRIPT_SCOPE}`], predicates: ["store-raw-state", "surface-names"] },
];
const plugin = { arc: { rules: Object.fromEntries(Object.entries(ARCHITECTURE_RULES).map(([rule, predicates]) =>
  [rule, createArchitectureImportsRule(resolve(packageRoot, "src"), predicates)])) } };
const eslint = new ESLint({ cwd: packageRoot, overrideConfigFile: true, overrideConfig: [
  { plugins: plugin },
  ...composeArchitectureBans(rows),
] });

async function rules(filename: string): Promise<unknown> {
  const configuration = await eslint.calculateConfigForFile(resolve(packageRoot, filename)) as
    { rules: Record<string, unknown> } | undefined;
  return configuration?.rules;
}

describe("architecture scope partitions", () => {
  it("unions every rule for a future nested TSX module", async () => {
    expect(await rules("src/private/future/nested.tsx")).toEqual({
      "no-restricted-imports": [2, { paths: ["outer-only", "inner-only"], patterns: ["blocked/**"] }],
      "no-restricted-syntax": [2, outerSyntax, innerSyntax],
      "arc/architecture-imports": [2, ["neverthrow", "kernel"]],
    });
  });
  it("retains the outer rules at an exact inner exception", async () => {
    expect(await rules("src/private/allowed.ts")).toEqual({
      "no-restricted-imports": [2, { paths: ["outer-only"], patterns: ["blocked/**"] }],
      "no-restricted-syntax": [2, outerSyntax],
      "arc/architecture-imports": [2, ["neverthrow"]],
    });
  });
  it("reports each ratchet predicate under its own rule beside the shared rule", async () => {
    expect(await rules("src/ratchet/module.ts")).toEqual({
      "no-restricted-imports": [2, { paths: ["outer-only"], patterns: ["blocked/**"] }],
      "no-restricted-syntax": [2, outerSyntax],
      "arc/architecture-imports": [2, ["neverthrow"]],
      "arc/store-raw-state": [2, ["store-raw-state"]],
      "arc/surface-names": [2, ["surface-names"]],
    });
  });
  it.each([
    ["architecture-imports", "store-raw-state"],
    ["store-raw-state", "neverthrow"],
    ["surface-names", "store-raw-state"],
  ])("refuses a predicate routed to another rule: arc/%s with %s", async (rule, predicate) => {
    const misrouted = new ESLint({ cwd: packageRoot, overrideConfigFile: true, overrideConfig: [
      { files: [`src/${TYPESCRIPT_SCOPE}`], plugins: plugin, rules: { [`arc/${rule}`]: ["error", [predicate]] } },
    ] });
    await expect(misrouted.calculateConfigForFile(resolve(packageRoot, "src/ratchet/module.ts"))).rejects.toThrow(predicate);
  });
});
