/** Native enforcement of the actual architecture table, using source filenames without changing source bytes. */

import { ESLint } from "eslint";
import tseslint from "typescript-eslint";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(import.meta.dirname, "../..");
const eslint = new ESLint({ cwd: packageRoot, overrideConfig: [tseslint.configs.disableTypeChecked] });

const cases = [
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
  it.each(cases)("rejects the planted reference in %s: %s", async (path, text, rule) => {
    const [result] = await eslint.lintText(text, { filePath: resolve(packageRoot, path) });
    expect(result?.fatalErrorCount).toBe(0);
    expect(result?.messages.filter(({ ruleId }) => ruleId === rule).length).toBeGreaterThan(0);
  });
  it.each([
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
