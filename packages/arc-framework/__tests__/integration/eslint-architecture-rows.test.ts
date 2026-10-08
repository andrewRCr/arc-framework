/** Native enforcement of the actual architecture table, using source filenames without changing source bytes. */

import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "../..");
const eslint = new ESLint({ cwd: packageRoot, overrideConfig: [tseslint.configs.disableTypeChecked] });
const additionalNodeLoaders = [
  'import * as nodeModule from "module"; const load = nodeModule.createRequire(import.meta.url); void load("@clack/prompts");',
  'import nodeModule from "module"; void nodeModule.createRequire(import.meta.url)("@clack/prompts");',
  'import { default as nodeModule } from "node:module"; const load = nodeModule.createRequire(import.meta.url); void load("@clack/prompts");',
  'import { default as nodeModule } from "module"; void nodeModule.createRequire(import.meta.url)("@clack/prompts");',
  'const nodeModule = await import("node:module"); const load = nodeModule.createRequire(import.meta.url); void load("@clack/prompts");',
  'const nodeModule = await import("module"); void nodeModule.createRequire(import.meta.url)("@clack/prompts");',
] as const;
const clackReferences = [
  'void import(`@clack/prompts`);',
  'import { createRequire as acquire } from "node:module"; const load = acquire(import.meta.url); void load("@clack/prompts");',
  'import { createRequire as acquire } from "node:module"; void acquire(import.meta.url)("@clack/prompts");',
  'import * as nodeModule from "node:module"; const load = nodeModule.createRequire(import.meta.url); void load("@clack/prompts");',
  'import nodeModule from "node:module"; void nodeModule.createRequire(import.meta.url)("@clack/prompts");',
  ...additionalNodeLoaders,
] as const;

const cases = [
  ["src/handlers/user.ts", 'void import("@clack/prompts");', "no-restricted-syntax"],
  ["src/lib/sync-output.ts", 'void import("@clack/prompts");', "no-restricted-syntax"],
  ["src/lib/terminal.ts", 'import "neverthrow";', "arc/architecture-imports"],
  ["src/lib/command-input/prompt-renderer.ts", 'import "neverthrow";', "arc/architecture-imports"],
  ["src/lib/kernel/canonical/canonical-json.ts", 'import "zod";', "no-restricted-imports"],
  ["src/lib/config/status-reader.ts", 'parseMetaProjectionRecord("record");', "no-restricted-syntax"],
  ["src/lib/config/status-reader.ts", 'parseIdentifierList("identifiers");', "no-restricted-syntax"],
  ["src/lib/active/meta-reader.ts", 'import type { Store } from "../store/create.js";', "no-restricted-syntax"],
  ["src/lib/errand/promote.ts", 'type Projection = MetaProjectionOverrides;', "no-restricted-syntax"],
  ["src/lib/config/status-reader.ts", 'const DEFAULTS = {}; void DEFAULTS;', "no-restricted-syntax"],
  ["src/lib/locus/role-derivation.ts", 'import "../user/index.js";', "no-restricted-imports"],
  ["src/lib/view-renderer.ts", 'import "node:fs";', "no-restricted-imports"],
  ["src/lib/view-renderer.ts", 'void import("node:fs");', "no-restricted-syntax"],
  ["src/lib/view-renderer.ts", 'type FS = import("node:fs").Stats;', "no-restricted-syntax"],
  ["src/lib/view-renderer.ts", 'const require = (value: string) => value; require("node:fs");', "no-restricted-syntax"],
  ["src/lib/view-renderer.ts", 'module.require("node:fs");', "no-restricted-syntax"],
  ["src/lib/view-renderer.ts", 'void process.env;', "no-restricted-syntax"],
  ["src/lib/view-renderer.ts", 'import "../commands/view/types.js";', "no-restricted-imports"],
  ["src/lib/work-unit/git-decompose-transition-base-advancement.ts", 'void import("./retirement-authority.js");', "no-restricted-syntax"],
  ["src/scripts/review-gate/core/ports.ts", 'import "../hosts/local/index.js";', "no-restricted-imports"],
  ["src/scripts/review-gate/core/ports.ts", 'canonicalizePlainJson({});', "no-restricted-syntax"],
  ["src/scripts/review-gate/core/ports.ts", 'canonicalizeReviewGateV1({});', "no-restricted-syntax"],
  ["src/scripts/review-gate/core/identity.ts", 'export { canonicalizePlainJson } from "./identity.js";', "no-restricted-syntax"],
  ["src/scripts/review-gate/policy/routing-schema.ts", 'import "../core/validation.js";', "no-restricted-imports"],
  ["src/scripts/review-gate/policy/routing-schema.ts", 'interface Handwritten {}', "no-restricted-syntax"],
  ["src/scripts/review-gate/policy/routing-schema.ts", 'function parseManual() { return {}; }', "no-restricted-syntax"],
  ["src/scripts/review-gate/policy/routing-schema.ts", 'const projectManual = () => ({});', "no-restricted-syntax"],
  ["src/cli.ts", 'import "./handlers/view.js";', "no-restricted-imports"],
  ["src/commands/active/status.ts", 'import "../../lib/config/status-reader.js";', "no-restricted-imports"],
  ["src/handlers/view.ts", 'import "../commands/active.js";', "no-restricted-imports"],
  ["src/handlers/view.ts", 'import "../lib/git/index.js";', "no-restricted-imports"],
  ["src/commands/active/status.ts", 'import "../../lib/git/index.js";', "no-restricted-imports"],
] as const;

describe("actual architecture table enforcement", () => {
  it.each(additionalNodeLoaders)("retains other composed restrictions for a genuine Node loader: %s", async (text) => {
    const [result] = await eslint.lintText(text.replaceAll("@clack/prompts", "neverthrow"), {
      filePath: resolve(packageRoot, "src/lib/terminal.ts"),
    });
    expect(result?.fatalErrorCount).toBe(0);
    expect(result?.messages.some(({ ruleId, message }) =>
      ruleId === "arc/architecture-imports" && message.includes("neverthrow"))).toBe(true);
  });
  it.each(clackReferences)("confines a supported raw prompt acquisition: %s", async (text) => {
    const [result] = await eslint.lintText(text, { filePath: resolve(packageRoot, "src/handlers/user.ts") });
    expect(result?.fatalErrorCount).toBe(0);
    expect(result?.messages.some(({ ruleId, message }) =>
      ruleId === "arc/architecture-imports" && message.includes("clack"))).toBe(true);
  });
  it.each(["src/lib/terminal.ts", "src/lib/command-input/prompt-renderer.ts"])(
    "allows supported Clack loaders only through their owning exception in %s", async (path) => {
      for (const text of clackReferences) {
        const [result] = await eslint.lintText(text, { filePath: resolve(packageRoot, path) });
        expect(result?.fatalErrorCount).toBe(0);
        expect(result?.messages.filter(({ ruleId }) =>
          ["arc/architecture-imports", "no-restricted-imports", "no-restricted-syntax"].includes(ruleId ?? ""))).toEqual([]);
      }
    });
  it("allows an unrelated returned loader containing the Clack package string", async () => {
    const [result] = await eslint.lintText('const acquire = () => (value: string) => value; const load = acquire(); void load("@clack/prompts");', {
      filePath: resolve(packageRoot, "src/handlers/user.ts"),
    });
    expect(result?.fatalErrorCount).toBe(0);
    expect(result?.messages.filter(({ ruleId }) => ruleId === "arc/architecture-imports")).toEqual([]);
  });
  it.each([
    'const helpers = { createRequire: () => (value: string) => value }; void helpers.createRequire()("@clack/prompts");',
    'import { createRequire } from "node:module"; const load = createRequire(import.meta.url); function format(load: (name: string) => string) { return load("@clack/prompts"); } void format;',
    'import { createRequire } from "node:module"; function format(createRequire: () => (name: string) => string) { return createRequire()("@clack/prompts"); } void format;',
    'import * as nodeModule from "node:module"; function format(nodeModule: { createRequire: () => (name: string) => string }) { return nodeModule.createRequire()("@clack/prompts"); } void format;',
    'import { createRequire } from "node:module"; const load = createRequire(import.meta.url); { const load = (name: string) => name; void load("@clack/prompts"); }',
    'import { createRequire } from "node:module"; const load = createRequire(import.meta.url); try { fail(); } catch (load) { if (typeof load === "function") load("@clack/prompts"); }',
    'import { createRequire } from "node:module"; const load = createRequire(import.meta.url); declare const callbacks: ((name: string) => string)[]; for (const load of callbacks) { load("@clack/prompts"); }',
    'import { createRequire } from "node:module"; const load = createRequire(import.meta.url); function format() { { var load = (name: string) => name; } return load("@clack/prompts"); } void format;',
  ])("allows a harmless method or shadowed loader binding: %s", async (text) => {
    const [result] = await eslint.lintText(text, { filePath: resolve(packageRoot, "src/handlers/user.ts") });
    expect(result?.fatalErrorCount).toBe(0);
    expect(result?.messages.filter(({ ruleId }) => ruleId === "arc/architecture-imports")).toEqual([]);
  });
  it.each(cases)("rejects the planted reference in %s: %s", async (path, text, rule) => {
    const [result] = await eslint.lintText(text, { filePath: resolve(packageRoot, path) });
    expect(result?.fatalErrorCount).toBe(0);
    expect(result?.messages.filter(({ ruleId }) => ruleId === rule).length).toBeGreaterThan(0);
  });
  it.each([
    ["src/lib/terminal.ts", 'import "@clack/prompts"; void import("@clack/prompts");'],
    ["src/lib/command-input/prompt-renderer.ts", 'import "@clack/prompts"; void import("@clack/prompts");'],
    ["src/handlers/user.ts", 'observe("@clack/prompts");'],
    ["src/lib/kernel/canonical/canonical-json.ts", 'import "node:path";'],
    ["src/lib/active/meta-reader.ts", 'parseMetaProjectionRecord("record"); parseIdentifierList("names");'],
    ["src/lib/store/in-repo/write-admission.ts", 'parseMetaProjectionRecord("record");'],
    ["src/scripts/validate-meta-spec.ts", 'parseIdentifierList("names");'],
    ["src/lib/active/meta-reader.ts", 'void import("../store/create.js");'],
    ["src/lib/errand/promote.ts", 'const example = "MetaProjectionOverrides renderMetaProjectionFile"; void example;'],
    ["src/lib/config/status-reader.ts", 'const DEFAULTS_REFERENCE = {}; void DEFAULTS_REFERENCE;'],
    ["src/lib/locus/role-derivation.ts", 'import "../git/worktree-roster.js";'],
    ["src/lib/view-renderer.ts", 'observe("node:fs"); const example = "process.env"; void example;'],
    ["src/lib/work-unit/git-decompose-transition-base-advancement.ts", 'observe("retirement-authority");'],
    ["src/scripts/review-gate/core/identity.ts", 'function canonicalizePlainJson(value: unknown) { return value; }'],
    ["src/scripts/review-gate/core/request-key.ts", 'canonicalizeReviewGateV1({});'],
    ["src/scripts/review-gate/core/contracts.ts", 'import "./validation.js";'],
    ["src/lib/config/status-reader.ts", 'interface UnownedType {}'],
    ["src/scripts/review-gate/policy/routing-schema.ts", 'type Shape = unknown; const registerShape = () => true;'],
    ["src/cli.ts", 'import type { Handler } from "./handlers/view.js"; void import("./handlers/view.js");'],
    ["src/cli.ts", 'import { type Handler } from "./handlers/view.js";'],
    ["src/commands/active/status.ts", 'import type { Config } from "../../lib/config/status-reader.js"; void import("../../lib/config/status-reader.js");'],
  ])("allows the boundary exception or harmless lookalike in %s: %s", async (path, text) => {
    const [result] = await eslint.lintText(text, { filePath: resolve(packageRoot, path) });
    expect(result?.fatalErrorCount).toBe(0);
    expect(result?.messages.filter(({ ruleId }) => ["arc/architecture-imports", "no-restricted-imports", "no-restricted-syntax"].includes(ruleId ?? ""))).toEqual([]);
  });

  it.each([
    ["src/scripts/review-gate/core/ports.ts", 'import { "canonicalizePlainJson" as encode } from "./identity.js";'],
    ["src/scripts/review-gate/core/ports.ts", 'legacy["canonicalizeReviewGateV1"]({});'],
    ["src/scripts/review-gate/core/identity.ts", 'export { "canonicalizePlainJson" as encode } from "./identity.js";'],
    ["src/lib/errand/promote.ts", 'import type { "MetaProjectionOverrides" as Contract } from "../active/meta-file.js";'],
  ])("rejects a literal-named forbidden symbol in %s: %s", async (path, text) => {
    const [result] = await eslint.lintText(text, { filePath: resolve(packageRoot, path) });
    expect(result?.fatalErrorCount).toBe(0);
    expect(result?.messages.filter(({ ruleId }) => ruleId === "no-restricted-syntax").length).toBeGreaterThan(0);
  });

  it("preserves the case-insensitive live retirement authority ban", async () => {
    const [result] = await eslint.lintText('void import("./Retirement-Authority.js");', {
      filePath: resolve(packageRoot, "src/lib/work-unit/git-decompose-transition-base-advancement.ts"),
    });
    expect(result?.fatalErrorCount).toBe(0);
    expect(result?.messages.some(({ ruleId }) => ruleId === "no-restricted-syntax")).toBe(true);
  });

});
