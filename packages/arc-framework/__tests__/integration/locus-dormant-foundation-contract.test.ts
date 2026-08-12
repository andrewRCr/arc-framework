/** Live import-boundary contract for the activated locus foundation. */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";
import ts from "typescript";

const packageRoot = resolve(import.meta.dirname, "../..");

const dormantModules = [
  "src/lib/locus/derived-lifecycle-evidence.ts",
  "src/lib/locus/derived-reader.ts",
  "src/lib/locus/derived-roster.ts",
  "src/lib/locus/occupancy-marker.ts",
  "src/lib/locus/role-corroboration.ts",
  "src/lib/locus/role-derivation.ts",
  "src/lib/locus/role-topology.ts",
] as const;

const expectedSourceIncoming: Readonly<Record<(typeof dormantModules)[number], readonly string[]>> = {
  "src/lib/locus/derived-lifecycle-evidence.ts": [
    "src/lib/locus/derived-evidence.ts",
    "src/lib/locus/derived-reader.ts",
    "src/lib/locus/derived-roster.ts",
    "src/lib/locus/subject-meta.ts",
  ],
  "src/lib/locus/derived-reader.ts": [
    "src/commands/locus.ts",
    "src/commands/status/run.ts",
    "src/commands/status/types.ts",
    "src/handlers/derived-locus-state-probe.ts",
    "src/lib/compaction-seed/emitter.ts",
    "src/lib/compaction-seed/schema.ts",
    "src/lib/errand/abandon-runtime.ts",
    "src/lib/errand/close-runtime.ts",
    "src/lib/errand/leave-runtime.ts",
    "src/lib/errand/open.ts",
    "src/lib/errand/partial-settle-runtime.ts",
    "src/lib/errand/promote-runtime.ts",
    "src/lib/errand/terminal-authority.ts",
    "src/lib/handoff/locus-plan.ts",
    "src/lib/locus/allocator.ts",
    "src/lib/locus/derived-evidence.ts",
    "src/lib/locus/session-guidance.ts",
    "src/lib/recover/audit.ts",
    "src/lib/recover/locus-context.ts",
  ],
  "src/lib/locus/derived-roster.ts": [
    "src/commands/locus.ts",
    "src/lib/errand/promote-runtime.ts",
    "src/lib/errand/terminal-authority.ts",
    "src/lib/git/in-flight-derivation.ts",
    "src/lib/handoff/locus-plan.ts",
    "src/lib/locus/derived-reader.ts",
    "src/lib/locus/session-guidance.ts",
    "src/lib/recover/locus-context.ts",
    "src/lib/session-init/locus-classification.ts",
    "src/lib/session-init/orphan-branch-sweep.ts",
    "src/lib/session-init/stale-worktree-sweep.ts",
  ],
  "src/lib/locus/occupancy-marker.ts": [
    "src/lib/locus/derived-evidence.ts",
    "src/lib/locus/derived-lifecycle-evidence.ts",
  ],
  "src/lib/locus/role-corroboration.ts": [
    "src/lib/locus/derived-roster.ts",
    "src/lib/locus/role-topology.ts",
  ],
  "src/lib/locus/role-derivation.ts": [
    "src/lib/handoff/locus-plan.ts",
    "src/lib/locus/derived-evidence.ts",
    "src/lib/locus/derived-lifecycle-evidence.ts",
    "src/lib/locus/derived-reader.ts",
    "src/lib/locus/derived-roster.ts",
    "src/lib/locus/role-corroboration.ts",
    "src/lib/locus/role-topology.ts",
    "src/lib/recover/locus-context.ts",
  ],
  "src/lib/locus/role-topology.ts": ["src/lib/locus/derived-roster.ts"],
};

const expectedTestIncoming: Readonly<Record<(typeof dormantModules)[number], readonly string[]>> = {
  "src/lib/locus/derived-lifecycle-evidence.ts": [
    "__tests__/unit/locus/derived-lifecycle-evidence.test.ts",
    "__tests__/unit/locus/derived-roster.test.ts",
  ],
  "src/lib/locus/derived-reader.ts": [
    "__tests__/integration/recovery-locus.test.ts",
    "__tests__/integration/status.test.ts",
    "__tests__/unit/compaction-seed/emitter.test.ts",
    "__tests__/unit/errand/partial-settle-runtime.test.ts",
    "__tests__/unit/errand/terminal-authority.test.ts",
    "__tests__/unit/handoff/locus-plan.test.ts",
    "__tests__/unit/locus/allocator.test.ts",
    "__tests__/unit/locus/derived-evidence.test.ts",
    "__tests__/unit/locus/derived-reader.test.ts",
    "__tests__/unit/locus/session-guidance.test.ts",
    "__tests__/unit/recover/audit.test.ts",
    "__tests__/unit/recover/locus-context.test.ts",
    "__tests__/unit/status/run.test.ts",
  ],
  "src/lib/locus/derived-roster.ts": [
    "__tests__/integration/recovery-locus.test.ts",
    "__tests__/unit/errand/partial-settle-runtime.test.ts",
    "__tests__/unit/errand/terminal-authority.test.ts",
    "__tests__/unit/errand/terminal-occupancy.test.ts",
    "__tests__/unit/handoff/locus-plan.test.ts",
    "__tests__/unit/locus/allocator.test.ts",
    "__tests__/unit/locus/derived-roster.test.ts",
    "__tests__/unit/recover/audit.test.ts",
    "__tests__/unit/recover/locus-context.test.ts",
    "__tests__/unit/session-init/locus-classification.test.ts",
    "__tests__/unit/session-init/stale-worktree-sweep.test.ts",
  ],
  "src/lib/locus/occupancy-marker.ts": [
    "__tests__/unit/locus/derived-lifecycle-evidence.test.ts",
    "__tests__/unit/locus/derived-roster.test.ts",
    "__tests__/unit/locus/occupancy-marker.test.ts",
  ],
  "src/lib/locus/role-corroboration.ts": [
    "__tests__/unit/locus/role-authority-boundary.test.ts",
    "__tests__/unit/locus/role-corroboration.test.ts",
  ],
  "src/lib/locus/role-derivation.ts": [
    "__tests__/unit/locus/role-authority-boundary.test.ts",
    "__tests__/unit/locus/role-corroboration.test.ts",
    "__tests__/unit/locus/role-derivation.test.ts",
  ],
  "src/lib/locus/role-topology.ts": ["__tests__/unit/locus/role-authority-boundary.test.ts"],
};

interface ModuleReference {
  readonly consumer: string;
  readonly target: string;
  readonly kind: "static" | "dynamic";
}

const referenceCache = new Map<"src" | "__tests__", readonly ModuleReference[]>();

describe("dormant locus foundation acceptance and activation", () => {
  it("limits production activation to the exact derived adapter and probe paths", () => {
    const sourceReferences = referencesUnder("src");
    const testReferences = referencesUnder("__tests__");

    for (const target of dormantModules) {
      expect(incoming(sourceReferences, target), target).toEqual(expectedSourceIncoming[target]);
      expect(incoming(testReferences, target), target).toEqual(expectedTestIncoming[target]);
    }
  });

  it("has no dynamic production reference to a dormant module", () => {
    const dynamic = referencesUnder("src")
      .filter((reference) => reference.kind === "dynamic" && isDormant(reference.target));
    expect(dynamic).toEqual([]);
  });

  it("keeps the activated reader boundary free of legacy record, lock, and process authority", () => {
    const activated = new Set([
      "src/handlers/derived-locus-state-probe.ts",
      "src/lib/locus/derived-evidence.ts",
      "src/lib/locus/derived-reader.ts",
    ]);
    const forbidden = new Set([
      "src/lib/locus/evidence.ts",
      "src/lib/locus/lock.ts",
      "src/lib/locus/process-inspector.ts",
      "src/lib/locus/reader.ts",
      "src/lib/locus/record-store.ts",
      "src/lib/locus/root.ts",
      "src/lib/locus/roster.ts",
      "src/lib/locus/state.ts",
    ]);
    expect(referencesUnder("src").filter((reference) =>
      activated.has(reference.consumer) && forbidden.has(reference.target))).toEqual([]);
  });
});

function referencesUnder(root: "src" | "__tests__"): ModuleReference[] {
  const cached = referenceCache.get(root);
  if (cached !== undefined) return [...cached];
  const moduleNames = dormantModules.map((path) => path.split("/").at(-1)?.replace(/\.ts$/u, "") ?? path);
  const references = typescriptFiles(join(packageRoot, root)).flatMap((path) => {
    const content = readFileSync(path, "utf8");
    return moduleNames.some((name) => content.includes(name)) ? referencesOf(path, content) : [];
  });
  referenceCache.set(root, references);
  return [...references];
}

function typescriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

function referencesOf(path: string, content: string): ModuleReference[] {
  const source = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true);
  const consumer = packageRelative(path);
  const references: ModuleReference[] = [];
  const add = (specifier: string, kind: ModuleReference["kind"]): void => {
    const target = resolveRelativeModule(path, specifier);
    if (target !== null) references.push({ consumer, target, kind });
  };
  const visit = (node: ts.Node): void => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier !== undefined
      && ts.isStringLiteralLike(node.moduleSpecifier)) {
      add(node.moduleSpecifier.text, "static");
    } else if (ts.isCallExpression(node)
      && (node.expression.kind === ts.SyntaxKind.ImportKeyword
        || (ts.isIdentifier(node.expression) && node.expression.text === "require"))) {
      const [argument] = node.arguments;
      if (argument !== undefined && ts.isStringLiteralLike(argument)) {
        add(argument.text, "dynamic");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return references;
}

function resolveRelativeModule(consumer: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const absolute = resolve(dirname(consumer), specifier.replace(/\.js$/u, ".ts"));
  return absolute.startsWith(packageRoot) ? packageRelative(absolute) : null;
}

function packageRelative(path: string): string {
  return relative(packageRoot, path).split(sep).join("/");
}

function incoming(references: readonly ModuleReference[], target: string): string[] {
  return references
    .filter((reference) => reference.target === target)
    .map((reference) => reference.consumer)
    .sort();
}

function isDormant(path: string): boolean {
  return dormantModules.includes(path as (typeof dormantModules)[number]);
}
