/** Native lint enforcement for loader bindings and resolved module boundaries. */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createArchitectureImportsRule } from "../../eslint/architecture-imports.js";

let root: string;
let sourceRoot: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "arc-architecture-lint-"));
  sourceRoot = join(root, "src");
  await mkdir(sourceRoot);
  await writeFile(join(root, "package.json"), JSON.stringify({ type: "module" }));
  await mkdir(join(sourceRoot, "lib/kernel/nested"), { recursive: true });
  await writeFile(join(sourceRoot, "lib/kernel/local.ts"), "export const local = true;");
  await writeFile(join(sourceRoot, "lib/kernel/nested/local.ts"), "export const local = true;");
  await writeFile(join(sourceRoot, "lib/outside.ts"), "export const outside = true;");
  await mkdir(join(root, "__tests__/helpers/store"), { recursive: true });
  await writeFile(join(root, "__tests__/helpers/store/backend.ts"), "export const backend = true;");
  await mkdir(join(sourceRoot, "lib/store/in-repo"), { recursive: true });
  await writeFile(join(sourceRoot, "lib/store/in-repo/private.ts"), "export interface Shape {} export const value = true;");
  await writeFile(join(sourceRoot, "lib/store/in-repo/backend.ts"), "export const backend = true;");
});
afterAll(async () => { await rm(root, { recursive: true, force: true }); });

function engine(predicates: string[]): ESLint {
  return new ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [{
      files: ["**/*.{ts,tsx,mts,cts}"],
      languageOptions: { parser: tseslint.parser },
      plugins: { arc: { rules: { "architecture-imports": createArchitectureImportsRule(sourceRoot) } } },
      rules: { "arc/architecture-imports": ["error", predicates] },
    }],
  });
}

async function lint(source: string, relativePath: string, predicates: string[]): Promise<ESLint.LintResult> {
  const filePath = join(sourceRoot, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, source);
  const [result] = await engine(predicates).lintText(source, { filePath });
  expect(result).toBeDefined();
  expect(result!.fatalErrorCount).toBe(0);
  return result!;
}

describe("native architecture import predicates", () => {
  it("refuses unknown predicate IDs during native configuration resolution", async () => {
    await expect(engine(["not-supported"]).calculateConfigForFile(join(sourceRoot, "unknown.ts")))
      .rejects.toThrow("not-supported");
  });

  it("rejects every package reference including aliased and inline returned loaders", async () => {
    const source = [
      'import "neverthrow";',
      'export { err } from "neverthrow";',
      'type Result = import("neverthrow").Result<unknown, unknown>;',
      'void import("neverthrow");',
      'void require("neverthrow");',
      'void module.require("neverthrow");',
      'import { createRequire as makeRequire } from "node:module";',
      'const load = makeRequire(import.meta.url);',
      'void load("neverthrow");',
      'void makeRequire(import.meta.url)("neverthrow");',
    ].join("\n");
    const result = await lint(source, "outside.ts", ["neverthrow"]);
    expect(result.messages.map(({ ruleId, line }) => ({ ruleId, line }))).toEqual(
      [1, 2, 3, 4, 5, 6, 9, 10].map((line) => ({ ruleId: "arc/architecture-imports", line })),
    );
  });

  it("allows unrelated calls containing the restricted package string", async () => {
    const result = await lint('const unrelatedLoad = (value: string) => value; unrelatedLoad("neverthrow");',
      "ordinary.ts", ["neverthrow"]);
    expect(result.messages).toEqual([]);
  });

  it("allows the explicit Result module to expose its package seam", async () => {
    const result = await lint('export { ok } from "neverthrow";', "lib/kernel/result.ts", ["kernel", "neverthrow"]);
    expect(result.messages).toEqual([]);
  });

  it.each([
    ["lib/kernel/consumer.ts", "../outside.js"],
    ["lib/kernel/nested/consumer.ts", "../../outside.js"],
  ])("refuses resolved kernel escapes from %s", async (path, target) => {
    const result = await lint(`import '${target}';`, path, ["kernel"]);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.message).toContain("source import escapes kernel");
  });

  it("refuses an unresolved relative kernel import", async () => {
    const result = await lint("import './missing.js';", "lib/kernel/missing-consumer.ts", ["kernel"]);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.message).toContain("unresolved source import");
  });

  it("retains the kernel's external-package, computed-import, and loader refusals", async () => {
    const source = [
      'import "commander";',
      'declare const target: string; void import(target);',
      'void require("zod");',
      'void module.require("zod");',
      'import { createRequire as acquire } from "node:module";',
      'void acquire(import.meta.url);',
    ].join("\n");
    const result = await lint(source, "lib/kernel/refusals.ts", ["kernel"]);
    expect(result.messages.map(({ message }) => message)).toEqual([
      "kernel: unapproved external package",
      "kernel: non-literal dynamic import",
      "kernel: CommonJS require loader",
      "kernel: CommonJS require loader",
      "kernel: createRequire loader acquisition",
    ]);
  });

  it("audits imports embedded in native TSX syntax", async () => {
    const result = await lint('const node = <Widget>{import("commander")}</Widget>; void node;',
      "lib/kernel/component.tsx", ["kernel"]);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.message).toContain("unapproved external package");
  });

  it("allows nested kernel references, builtins, and the approved schema package", async () => {
    const result = await lint('import "../local.js"; import "node:fs"; import "zod";',
      "lib/kernel/nested/valid.ts", ["kernel"]);
    expect(result.messages).toEqual([]);
  });

  it.each([
    ["outside-store.ts", 'import "./lib/store/in-repo/private.js";', "store-production"],
    ["lib/store/not-the-factory.ts", 'import "./in-repo/backend.js";', "store-production"],
    ["mixed-store-types.ts", 'import { type Shape, value } from "./lib/store/in-repo/private.js";', "store-production"],
    ["../__tests__/private-store.ts", 'import "../src/lib/store/in-repo/private.js";', "store-tests"],
  ])("refuses private store implementation references from %s", async (path, source, predicate) => {
    const result = await lint(source, path, [predicate]);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.message).toContain("store implementation");
  });

  it("permits the native public factory and lazy internal imports", async () => {
    const result = await lint('export { backend } from "./in-repo/backend.js"; void import("./in-repo/private.js");',
      "lib/store/create.ts", ["store-production"]);
    expect(result.messages).toEqual([]);
  });

  it("permits native type-only store references", async () => {
    const result = await lint([
      'import { type Shape } from "./lib/store/in-repo/private.js";',
      'export type { Shape as OtherShape } from "./lib/store/in-repo/private.js";',
    ].join("\n"), "allowed-store-types.ts", ["store-production"]);
    expect(result.messages).toEqual([]);
  });
  it.each([
    ["lib/layout/outside.ts", 'import "commander";', "layout-dependencies"],
    ["lib/layout/above.ts", 'import "../outside.js";', "layout-dependencies"],
    ["consumer.ts", 'void import("./lib/layout/private.js");', "layout-private"],
    ["commands/consumer.ts", 'export * from "./layout/index.js";', "layout-downward"],
    ["lib/store/concurrency/nested/escape.ts", 'import "../../../../commands/active.js";', "store-concurrency"],
    ["lib/store/concurrency/computed.ts", 'declare const path: string; void import(path);', "store-concurrency"],
    ["lib/source.ts", 'import { createRequire as acquire } from "node:module"; const require = acquire(import.meta.url); require("../../__tests__/helpers/store/backend.js");', "store-reference"],
    ["lib/nested/source.ts", 'import { createRequire as acquire } from "node:module"; const load = acquire(import.meta.url); load("../../../__tests__/helpers/store/backend.js");', "store-reference"],
    ["identity-read.ts", 'gitConfigGet(".", "arc.identity");', "configured-identity"],
    ["identity-argv.ts", 'void ["--local", "config", "--get", "arc.identity"];', "configured-identity"],
  ])("enforces the migrated predicate %s", async (path, source, predicate) => {
    const result = await lint(source, path, [predicate]);
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.message).toContain(predicate);
  });

  it.each([
    ["lib/layout/valid.ts", 'import "./../outside.js"; import "node:path"; import "zod"; import "../kernel/index.js";', "layout-dependencies"],
    ["valid-layout.ts", 'import "./lib/layout/index.js"; observe("./lib/layout/private.js");', "layout-private"],
    ["commands/valid-layout.ts", 'import "../lib/layout/index.js";', "layout-downward"],
    ["lib/store/concurrency/nested/valid.ts", 'import "../local.js"; import "../../../kernel/index.js"; import "../../registry.js"; import "node-diff3";', "store-concurrency"],
    ["lib/valid-reference.ts", 'import "./outside.js"; observe("../../__tests__/helpers/store/backend.js");', "store-reference"],
    ["valid-identity.ts", 'gitConfigGet(".", "other.key"); observe("arc.identity"); void ["config", "arc.identity", "--get"];', "configured-identity"],
  ])("preserves the migrated allowance %s", async (path, source, predicate) => {
    expect((await lint(source, path, [predicate])).messages).toEqual([]);
  });

  it("retains the immediate store-core directory allowance", async () => {
    expect((await lint('import ".";', "lib/store/concurrency/directory.ts", ["store-concurrency"])).messages).toEqual([]);
  });

  it("rejects a bare kernel directory outside the concurrency allowlist", async () => {
    expect((await lint('import "../../kernel";', "lib/store/concurrency/kernel-directory.ts", ["store-concurrency"])).messages).toHaveLength(1);
  });

  it("refuses a reference-store file whose basename starts with two dots", async () => {
    const result = await lint('import { createRequire } from "node:module"; const require = createRequire(import.meta.url); require("../../__tests__/helpers/store/..backend.js");', "lib/dotted-reference.ts", ["store-reference"]);
    expect(result.messages).toHaveLength(1);
  });

  it("refuses a nested configured identity argument sequence", async () => {
    const result = await lint('execGit(["config", ["--get", "arc.identity"]].flat());', "nested-identity.ts", ["configured-identity"]);
    expect(result.messages).toHaveLength(1);
  });

  it("allows a similarly named reference directory outside the root", async () => {
    const result = await lint('import { createRequire } from "node:module"; const require = createRequire(import.meta.url); require("../../__tests__/helpers/store-other/backend.js");', "lib/sibling-reference.ts", ["store-reference"]);
    expect(result.messages).toEqual([]);
  });

});
