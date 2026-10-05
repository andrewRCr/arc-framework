import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import ts from "typescript";

import { auditKernelBoundary } from "./import-boundary.js";

const temporaryRoots: string[] = [];
const REPOSITORY_SCAN_TIMEOUT = 15_000;

function fixture(files: Readonly<Record<string, string>>): { kernelRoot: string; sourceRoot: string } {
  const sourceRoot = mkdtempSync(join(tmpdir(), "arc-kernel-boundary-"));
  temporaryRoots.push(sourceRoot);
  for (const [relativePath, source] of Object.entries(files)) {
    const path = join(sourceRoot, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
  }
  return { sourceRoot, kernelRoot: join(sourceRoot, "lib/kernel") };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("kernel import boundary", () => {
  it("exposes exactly the designed value and type surface from an explicit barrel", () => {
    const packageRoot = resolve(import.meta.dirname, "../../..");
    const indexPath = join(packageRoot, "src/lib/kernel/index.ts");
    const sourceFile = ts.createSourceFile(
      indexPath,
      readFileSync(indexPath, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const values: string[] = [];
    const types: string[] = [];

    for (const statement of sourceFile.statements) {
      expect(ts.isExportDeclaration(statement)).toBe(true);
      if (!ts.isExportDeclaration(statement)) continue;
      expect(statement.exportClause !== undefined && ts.isNamedExports(statement.exportClause)).toBe(true);
      if (statement.exportClause === undefined || !ts.isNamedExports(statement.exportClause)) continue;
      for (const element of statement.exportClause.elements) {
        (statement.isTypeOnly || element.isTypeOnly ? types : values).push(element.name.text);
      }
    }

    expect(values.sort()).toEqual([
      "ArcError", "ArchiveQuarterSchema", "ArchiveSequenceSchema", "CanonicalDigestSchema", "LocusTokenSchema",
      "PrioritySchema", "RemoteEvidenceSchema", "RemoteFailureReasonSchema", "ResultAsync",
      "SLUG_PATTERN", "SchemaError", "SlugSchema",
      "WORK_UNIT_STATE_ORDER", "WorkClassSchema", "WorkUnitStateSchema", "assertCanonicalDigest", "assertNever",
      "canonicalDigest", "canonicalize", "createKernelRegistry", "createRegistry", "digestBytes", "err",
      "errAsync", "fromAsyncThrowable", "fromThrowable", "isCanonicalDigest", "isManagedPath", "isSlugSafe", "ok",
      "okAsync",
      "sortByCanonicalBytes", "toArcError", "validateClass", "validateManagedPath", "validatePriority",
      "validateState", "withRemoteEvidence",
    ].sort());
    expect(types.sort()).toEqual([
      "ArcErrorCode", "ArchiveQuarter", "ArchiveSequence", "CanonicalDigest", "KernelJSONSchema", "KernelJSONSchemaBundle", "KernelRegistry",
      "KernelSchemaMeta", "ManagedPath", "MigrationPosture", "Priority", "RemoteEvidence",
      "RemoteFailureReason", "Result", "SchemaErrorCode", "Slug", "WorkClass", "WorkUnitState",
    ].sort());
  });

  it("keeps the canonical digest core free of Zod imports", () => {
    const path = resolve(import.meta.dirname, "../../../src/lib/kernel/canonical/canonical-json.ts");
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    const imports = source.statements
      .filter(ts.isImportDeclaration)
      .map(({ moduleSpecifier }) => ts.isStringLiteral(moduleSpecifier) ? moduleSpecifier.text : "");

    expect(imports.some((specifier) => specifier === "zod" || specifier.startsWith("zod/"))).toBe(false);
  });

  it("allows kernel-local modules, node builtins, and approved packages", () => {
    const roots = fixture({
      "lib/kernel/index.ts": [
        'export { value } from "./nested/value.js";',
        'export type { Shape } from "./nested/types.js";',
      ].join("\n"),
      "lib/kernel/nested/value.ts": [
        'import { readFile } from "node:fs/promises";',
        'import { z } from "zod";',
        'import("../nested/types.js");',
        "export const value = z.string().parse(readFile.name);",
      ].join("\n"),
      "lib/kernel/nested/types.ts": "export interface Shape { readonly value: string }\n",
      "lib/kernel/result.ts": 'export { ok } from "neverthrow";\n',
    });

    expect(auditKernelBoundary(roots)).toEqual([]);
  });

  it("rejects imports, re-exports, import types, and dynamic imports that escape the kernel", () => {
    const roots = fixture({
      "lib/kernel/index.ts": [
        'import { sibling } from "../sibling.js";',
        'export { other } from "../../commands/other.js";',
        'type Escaped = import("../sibling.js").Shape;',
        'void import("../../prompts/prompt.js");',
        "void sibling;",
      ].join("\n"),
      "lib/sibling.ts": "export const sibling = true; export interface Shape {}\n",
      "commands/other.ts": "export const other = true;\n",
      "prompts/prompt.ts": "export const prompt = true;\n",
    });

    const findings = auditKernelBoundary(roots);
    expect(findings).toHaveLength(4);
    expect(findings.every(({ reason }) => reason === "source import escapes kernel")).toBe(true);
    expect(findings.map(({ specifier }) => specifier)).toEqual([
      "../sibling.js",
      "../../commands/other.js",
      "../sibling.js",
      "../../prompts/prompt.js",
    ]);
  });

  it("parses TSX sources before auditing embedded module references", () => {
    const roots = fixture({
      "lib/kernel/component.tsx": 'const node = <Widget>{import("commander")}</Widget>; void node;\n',
    });

    expect(auditKernelBoundary(roots)).toEqual([{
      file: "lib/kernel/component.tsx",
      specifier: "commander",
      reason: "unapproved external package",
    }]);
  });

  it("rejects unchecked loader forms inside the kernel", () => {
    const roots = fixture({
      "lib/kernel/escape.ts": [
        "declare const target: string;",
        "void import(target);",
        'import legacy = require("node:fs");',
        'void require("zod");',
        'void module.require("zod");',
        'import { createRequire as acquire } from "node:module";',
        "void acquire(import.meta.url);",
        "void legacy;",
      ].join("\n"),
    });

    expect(auditKernelBoundary(roots).map(({ reason }) => reason)).toEqual([
      "non-literal dynamic import",
      "external import-equals declaration",
      "CommonJS require loader",
      "CommonJS require loader",
      "createRequire loader acquisition",
    ]);
  });

  it("rejects unapproved packages and neverthrow imports outside the Result seam", () => {
    const roots = fixture({
      "lib/kernel/other.ts": ['import "commander";', 'import "neverthrow";'].join("\n"),
      "outside.ts": 'import { ok } from "neverthrow"; void ok;\n',
    });

    expect(auditKernelBoundary(roots).map(({ reason }) => reason)).toEqual([
      "unapproved external package",
      "neverthrow import outside kernel Result seam",
      "neverthrow import outside kernel Result seam",
    ]);
  });

  it("finds neverthrow through every supported TypeScript and loader reference form", () => {
    const roots = fixture({
      "lib/kernel/result.ts": 'export { ok } from "neverthrow";\n',
      "outside.ts": [
        'import "neverthrow";',
        'export { err } from "neverthrow";',
        'type Result = import("neverthrow").Result<unknown, unknown>;',
        'void import("neverthrow");',
        'import legacy = require("neverthrow");',
        'void require("neverthrow");',
        'void module.require("neverthrow");',
        'import { createRequire as makeRequire } from "node:module";',
        'const load = makeRequire(import.meta.url);',
        'void load("neverthrow");',
        'void makeRequire(import.meta.url)("neverthrow");',
        'void legacy;',
      ].join("\n"),
    });

    const findings = auditKernelBoundary(roots);
    expect(findings).toHaveLength(9);
    expect(findings.every(({ reason }) => reason === "neverthrow import outside kernel Result seam")).toBe(true);
  });

  it("keeps the live source graph within the kernel boundary", () => {
    const packageRoot = resolve(import.meta.dirname, "../../..");
    const sourceRoot = join(packageRoot, "src");
    const kernelRoot = join(sourceRoot, "lib/kernel");

    expect(auditKernelBoundary({ kernelRoot, sourceRoot })).toEqual([]);
  }, REPOSITORY_SCAN_TIMEOUT);
});
