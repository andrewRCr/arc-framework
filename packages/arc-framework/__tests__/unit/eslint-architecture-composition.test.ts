/** Architecture unions survive overlap and exact-file exceptions for future modules. */

import { ESLint } from "eslint";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { composeArchitectureBans, TYPESCRIPT_SCOPE, type ArchitectureBanRow } from "../../eslint/architecture-config.js";
import { createArchitectureImportsRule } from "../../eslint/architecture-imports.js";

const packageRoot = resolve(import.meta.dirname, "../..");
const outerSyntax = { selector: 'Identifier[name="outerOnly"]', message: "Outer boundary" };
const innerSyntax = { selector: 'Identifier[name="innerOnly"]', message: "Inner boundary" };
const rows: ArchitectureBanRow[] = [
  { files: [`src/${TYPESCRIPT_SCOPE}`], paths: ["outer-only"], patterns: ["blocked/**"], syntax: [outerSyntax], predicates: ["neverthrow"] },
  { files: [`src/private/${TYPESCRIPT_SCOPE}`], ignores: ["src/private/allowed.ts"], paths: ["inner-only"], syntax: [innerSyntax], predicates: ["kernel"] },
];
const eslint = new ESLint({ cwd: packageRoot, overrideConfigFile: true, overrideConfig: [
  { plugins: { arc: { rules: { "architecture-imports": createArchitectureImportsRule(resolve(packageRoot, "src")) } } } },
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
});
