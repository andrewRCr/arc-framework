/** Resolved native configuration retains complete architecture policy scopes. */

import { ESLint } from "eslint";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ESLINT_CONFIG_LOAD_TIMEOUT = 10_000;
const packageRoot = resolve(import.meta.dirname, "../..");
const eslint = new ESLint({ cwd: packageRoot });

async function architectureOptions(filename: string): Promise<unknown> {
  const configuration = await eslint.calculateConfigForFile(resolve(packageRoot, filename)) as
    { rules: Record<string, unknown> } | undefined;
  return configuration?.rules["arc/architecture-imports"];
}

describe("composed architecture configuration", () => {
  it("resolves the global package restriction for a source module", async () => {
    expect(await architectureOptions("src/lib/config/status-reader.ts")).toEqual([2, ["neverthrow", "store-production", "store-reference", "layout-private", "configured-identity"]]);
  }, ESLINT_CONFIG_LOAD_TIMEOUT);
  it("unions predicates across global and kernel scopes", async () => {
    expect(await architectureOptions("src/lib/kernel/result.ts")).toEqual([2, ["neverthrow", "kernel", "store-production", "store-reference", "layout-private", "configured-identity"]]);
  });

  it.each([
    ["src/lib/layout/index.ts", "layout-dependencies"],
    ["src/lib/config/status-reader.ts", "layout-private"],
    ["src/commands/init.ts", "layout-downward"],
    ["src/lib/store/concurrency/line-merge.ts", "store-concurrency"],
    ["src/lib/config/status-reader.ts", "store-reference"],
    ["src/lib/config/status-reader.ts", "store-production"],
    ["__tests__/unit/lib/config/index.test.ts", "store-tests"],
    ["src/lib/config/status-reader.ts", "configured-identity"],
  ])("resolves the migrated predicate for %s: %s", async (path, predicate) => {
    expect(await architectureOptions(path)).toEqual([2, expect.arrayContaining([predicate])]);
  });

  it.each([
    ["src/lib/kernel/canonical/canonical-json.ts", "^zod(?:/.*)?$"],
    ["src/lib/locus/role-derivation.ts", "^(?!\\.\\./git/worktree-roster\\.js$).*"],
    ["src/lib/view-renderer.ts", "/commands/"],
    ["src/lib/work-unit/git-decompose-transition-base-advancement.ts", "retirement-authority"],
    ["src/scripts/review-gate/core/ports.ts", "\\.\\./(?:hosts|providers|runtime)/"],
    ["src/scripts/review-gate/policy/routing-schema.ts", "(?:^|/)validation\\.js$"],
    ["src/lib/change-facts.schema.ts", "(?:^|/)validation\\.js$"],
    ["src/cli.ts", "^\\./(?:handlers|commands|scripts)/"],
  ])("resolves the import pattern in %s", async (path, regex) => {
    const configuration = await eslint.calculateConfigForFile(resolve(packageRoot, path)) as { rules: Record<string, unknown> };
    expect(configuration.rules["no-restricted-imports"]).toEqual([
      2, expect.objectContaining({ patterns: expect.arrayContaining([expect.objectContaining({ regex, caseSensitive: regex !== "retirement-authority" })]) }),
    ]);
  });

  it.each([
    ["src/handlers/user.ts", "@clack/prompts"],
    ["src/lib/sync-output.ts", "@clack/prompts"],
    ["src/handlers/view.ts", "../commands/active.js"],
    ["src/handlers/view.ts", "../lib/git/index.js"],
    ["src/commands/active/status.ts", "../../lib/git/index.js"],
    ["src/commands/active/status.ts", { name: "../../lib/config/status-reader.js", allowTypeImports: true }],
    ["src/lib/view-renderer.ts", "node:fs"],
  ])("resolves the import path in %s: %s", async (path, banned) => {
    const configuration = await eslint.calculateConfigForFile(resolve(packageRoot, path)) as { rules: Record<string, unknown> };
    expect(configuration.rules["no-restricted-imports"]).toEqual([
      2, expect.objectContaining({ paths: expect.arrayContaining([banned]) }),
    ]);
  });

  it.each(["src/lib/terminal.ts", "src/lib/command-input/prompt-renderer.ts"])(
    "allows clack only at its boundary in %s while retaining global architecture policy", async (path) => {
      const configuration = await eslint.calculateConfigForFile(resolve(packageRoot, path)) as
        { rules: Record<string, unknown> };
      expect(configuration.rules["no-restricted-imports"]).not.toEqual([
        2, expect.objectContaining({ paths: expect.arrayContaining(["@clack/prompts"]) }),
      ]);
      expect(await architectureOptions(path)).toEqual([2, expect.arrayContaining([
        "neverthrow", "store-production", "store-reference", "layout-private", "configured-identity",
      ])]);
    },
  );

  it.each([
    ["src/lib/config/status-reader.ts", 'CallExpression[callee.name="parseMetaProjectionRecord"]'],
    ["src/lib/config/status-reader.ts", 'CallExpression[callee.name="parseIdentifierList"]'],
    ["src/lib/active/meta-reader.ts", 'ImportDeclaration[source.value=/\\/store\\//]'],
    ["src/lib/errand/promote.ts", 'Identifier[name=/^(MetaProjectionOverrides|renderMetaProjectionFile)$/]'],
    ["src/lib/config/status-reader.ts", 'VariableDeclaration[kind="const"] > VariableDeclarator[id.name="DEFAULTS"]'],
    ["src/lib/view-renderer.ts", 'MemberExpression[object.name="process"][computed=false]'],
    ["src/scripts/review-gate/core/ports.ts", 'Identifier[name="canonicalizePlainJson"]'],
    ["src/scripts/review-gate/core/ports.ts", 'Identifier[name="canonicalizeReviewGateV1"]'],
    ["src/scripts/review-gate/core/identity.ts", 'ExportNamedDeclaration > ExportSpecifier[local.name=/^(canonicalizePlainJson|canonicalizeReviewGateV1)$/]'],
    ["src/scripts/review-gate/policy/routing-schema.ts", 'TSInterfaceDeclaration'],
    ["src/scripts/review-gate/policy/routing-schema.ts", 'FunctionDeclaration[id.name=/^(parse|project|validate)/]'],
    ["src/scripts/review-gate/policy/routing-schema.ts", 'VariableDeclarator[id.type="Identifier"][id.name=/^(parse|project|validate)/]'],
  ])("resolves the syntax ban in %s", async (path, selector) => {
    const configuration = await eslint.calculateConfigForFile(resolve(packageRoot, path)) as { rules: Record<string, unknown> };
    expect(configuration.rules["no-restricted-syntax"]).toEqual(expect.arrayContaining([
      2, expect.objectContaining({ selector }),
    ]));
  });

});
