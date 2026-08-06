/** Exact repository contract for the Phase 1 dormant locus foundation. */

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";
import ts from "typescript";

const packageRoot = resolve(import.meta.dirname, "../..");
const repositoryRoot = resolve(packageRoot, "../..");
const phaseOneBase = "5c9e806dcda9eb04166695a0cf45e25b08435c7f";
const phaseOneBaseTree = "77ef6977dd4f6c4b189ad2a100c2435086148812";

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
    "src/lib/locus/derived-reader.ts",
    "src/lib/locus/derived-roster.ts",
  ],
  "src/lib/locus/derived-reader.ts": [],
  "src/lib/locus/derived-roster.ts": ["src/lib/locus/derived-reader.ts"],
  "src/lib/locus/occupancy-marker.ts": ["src/lib/locus/derived-lifecycle-evidence.ts"],
  "src/lib/locus/role-corroboration.ts": [
    "src/lib/locus/derived-roster.ts",
    "src/lib/locus/role-topology.ts",
  ],
  "src/lib/locus/role-derivation.ts": [
    "src/lib/locus/derived-lifecycle-evidence.ts",
    "src/lib/locus/derived-reader.ts",
    "src/lib/locus/derived-roster.ts",
    "src/lib/locus/role-corroboration.ts",
    "src/lib/locus/role-topology.ts",
  ],
  "src/lib/locus/role-topology.ts": ["src/lib/locus/derived-roster.ts"],
};

const expectedTestIncoming: Readonly<Record<(typeof dormantModules)[number], readonly string[]>> = {
  "src/lib/locus/derived-lifecycle-evidence.ts": [
    "__tests__/unit/locus/derived-lifecycle-evidence.test.ts",
    "__tests__/unit/locus/derived-roster.test.ts",
  ],
  "src/lib/locus/derived-reader.ts": ["__tests__/unit/locus/derived-reader.test.ts"],
  "src/lib/locus/derived-roster.ts": ["__tests__/unit/locus/derived-roster.test.ts"],
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

describe("Phase 1 dormant locus foundation", () => {
  it("has a closed exact incoming graph with tests as its only outside consumers", () => {
    const sourceReferences = referencesUnder("src");
    const testReferences = referencesUnder("__tests__");

    for (const target of dormantModules) {
      expect(incoming(sourceReferences, target), target).toEqual(expectedSourceIncoming[target]);
      expect(incoming(testReferences, target), target).toEqual(expectedTestIncoming[target]);
      expect(expectedSourceIncoming[target].every((consumer) =>
        dormantModules.includes(consumer as (typeof dormantModules)[number])), target).toBe(true);
    }
  });

  it("has no dynamic production reference to a dormant module", () => {
    const dynamic = referencesUnder("src")
      .filter((reference) => reference.kind === "dynamic" && isDormant(reference.target));
    expect(dynamic).toEqual([]);
  });

  it("limits the production delta to seven additive modules and one exact helper edit", () => {
    expect(git("rev-parse", `${phaseOneBase}^{tree}`)).toBe(phaseOneBaseTree);
    expect(changedPaths("packages/arc-framework/src")).toEqual([
      "packages/arc-framework/src/lib/locus/derived-lifecycle-evidence.ts",
      "packages/arc-framework/src/lib/locus/derived-reader.ts",
      "packages/arc-framework/src/lib/locus/derived-roster.ts",
      "packages/arc-framework/src/lib/locus/occupancy-marker.ts",
      "packages/arc-framework/src/lib/locus/role-corroboration.ts",
      "packages/arc-framework/src/lib/locus/role-derivation.ts",
      "packages/arc-framework/src/lib/locus/role-topology.ts",
      "packages/arc-framework/src/lib/locus/subject-meta.ts",
    ]);

    const subjectMetaPath = "packages/arc-framework/src/lib/locus/subject-meta.ts";
    const baseSubjectMeta = git("show", `${phaseOneBase}:${subjectMetaPath}`, { trim: false });
    const expectedSubjectMeta = replaceExactly(
      replaceExactly(
        baseSubjectMeta,
        "  candidates: readonly MetaEvidence[];\n  io: SubjectMetaIO;",
        "  candidates: readonly MetaEvidence[];\n  activeExtensions?: readonly string[];\n  io: SubjectMetaIO;",
      ),
      "      activeExtensions: [],",
      "      activeExtensions: options.activeExtensions ?? [],",
    );
    expect(readFileSync(join(repositoryRoot, subjectMetaPath), "utf8")).toBe(expectedSubjectMeta);
  });

  it("keeps selected production, public, workflow, doctrine, marker, and golden surfaces byte-unchanged", () => {
    expect(changedPaths(
      "packages/arc-framework/src/cli.ts",
      "packages/arc-framework/src/command-input-registrations.ts",
      "packages/arc-framework/src/handlers",
      "packages/arc-framework/src/commands",
      "packages/arc-framework/src/lib/locus/schema",
      "packages/arc-framework/src/lib/locus/reader.ts",
      "packages/arc-framework/src/lib/locus/roster.ts",
      "packages/arc-framework/src/lib/locus/evidence.ts",
      "packages/arc-framework/src/lib/locus/state.ts",
      "packages/arc-framework/src/lib/locus/command-runtime.ts",
      "packages/arc-framework/src/lib/locus/provisioning-marker.ts",
      "packages/arc-framework/src/lib/locus/provisioning-runtime.ts",
      "packages/arc-framework/src/lib/locus/provisioning-types.ts",
      "packages/arc-framework/src/lib/git/worktree-marker.ts",
      "packages/arc-framework/src/lib/git/index.ts",
      "packages/arc-framework/src/lib/status",
      "packages/arc-framework/src/lib/session-envelope",
      "packages/arc-framework/src/lib/recover/locus-context.ts",
      "packages/arc-framework/arc",
      "packages/arc-framework/__tests__/fixtures/session-envelope",
      ".arc/system",
      ".arc/reference",
    )).toEqual([]);
  });
});

function referencesUnder(root: "src" | "__tests__"): ModuleReference[] {
  return typescriptFiles(join(packageRoot, root)).flatMap((path) => referencesOf(path));
}

function typescriptFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return typescriptFiles(path);
    return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
  });
}

function referencesOf(path: string): ModuleReference[] {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
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

function changedPaths(...pathspecs: string[]): string[] {
  const output = git("diff", "--name-only", "--no-renames", phaseOneBase, "--", ...pathspecs);
  return output === "" ? [] : output.split("\n").sort();
}

function git(...args: string[]): string;
function git(...args: [...string[], { trim: boolean }]): string;
function git(...args: Array<string | { trim: boolean }>): string {
  const options = typeof args.at(-1) === "object" ? args.pop() as { trim: boolean } : { trim: true };
  const output = execFileSync("git", args as string[], { cwd: repositoryRoot, encoding: "utf8" });
  return options.trim ? output.trim() : output;
}

function replaceExactly(source: string, before: string, after: string): string {
  expect(source.split(before)).toHaveLength(2);
  return source.replace(before, after);
}
