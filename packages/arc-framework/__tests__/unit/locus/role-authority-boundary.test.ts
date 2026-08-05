import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, expectTypeOf, it } from "vitest";
import ts from "typescript";

import type { RegisteredWorktree } from "../../../src/lib/git/worktree-roster.js";
import type { CheckoutCorroborationTopology } from "../../../src/lib/locus/role-corroboration.js";
import type { CheckoutAuthorityTopology } from "../../../src/lib/locus/role-derivation.js";
import {
  projectCheckoutAuthorityTopology,
  projectCheckoutCorroborationTopology,
} from "../../../src/lib/locus/role-topology.js";

const packageRoot = resolve(import.meta.dirname, "../../..");

function importsOf(relativePath: string): string[] {
  const path = join(packageRoot, relativePath);
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  return source.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) return [];
    return statement.moduleSpecifier !== undefined && ts.isStringLiteralLike(statement.moduleSpecifier)
      ? [statement.moduleSpecifier.text]
      : [];
  });
}

describe("checkout role authority boundary", () => {
  it("keeps registered observations out of the authority topology type", () => {
    expectTypeOf<keyof CheckoutAuthorityTopology>().toEqualTypeOf<"path" | "primary">();
    expectTypeOf<keyof CheckoutCorroborationTopology>()
      .toEqualTypeOf<"branch" | "head" | "detached">();
  });

  it("constructs fresh narrow projections instead of forwarding a RegisteredWorktree", () => {
    const checkout: RegisteredWorktree = {
      path: "/repo/widget",
      primary: false,
      branch: "feat/widget",
      head: "a".repeat(40),
      detached: false,
    };
    const authority = projectCheckoutAuthorityTopology(checkout);
    const corroboration = projectCheckoutCorroborationTopology(checkout);

    expect(authority).toEqual({ path: "/repo/widget", primary: false });
    expect(corroboration).toEqual({ branch: "feat/widget", head: "a".repeat(40), detached: false });
    expect(authority).not.toBe(checkout);
    expect(corroboration).not.toBe(checkout);
  });

  it("keeps derivation free of durable locus storage and liveness imports", () => {
    const imports = importsOf("src/lib/locus/role-derivation.ts");
    expect(imports.filter((specifier) => [
      "./record-store.js",
      "./schema/record.js",
      "./lock.js",
      "./process-inspector.js",
      "./platform-inspectors.js",
      "./process-exec.js",
      "./evidence.js",
    ].includes(specifier))).toEqual([]);
  });
});
