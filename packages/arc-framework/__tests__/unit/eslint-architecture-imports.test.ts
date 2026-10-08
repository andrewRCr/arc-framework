/** Store import decisions below the native lint engine. */

import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { findArchitectureImportViolations, type ArchitecturePredicate } from "../../eslint/architecture-imports.js";

const sourceRoot = resolve("architecture-fixture/src");

describe("store import predicate exceptions", () => {
  it.each([
    ["outside-type.ts", 'import type { Shape } from "./lib/store/in-repo/private.js";', "store-production"],
    ["outside-named-type.ts", 'import { type Shape } from "./lib/store/in-repo/private.js";', "store-production"],
    ["outside-export-type.ts", 'export type { Shape } from "./lib/store/in-repo/private.js";', "store-production"],
    ["lib/store/helper.ts", 'import "./in-repo/private.js";', "store-production"],
    ["lib/store/create.ts", 'import "./in-repo/backend.js";', "store-production"],
    ["lib/store/create.ts", 'void import("./in-repo/backend.js");', "store-production"],
    ["../__tests__/public-store.ts", 'import "../src/lib/store/create.js";', "store-tests"],
    ["../__tests__/store-type.ts", 'import type { Shape } from "../src/lib/store/in-repo/private.js";', "store-tests"],
  ] satisfies [string, string, ArchitecturePredicate][])("allows the established store exception in %s: %s", (path, text, predicate) => {
    const filename = resolve(sourceRoot, path);
    const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
    expect(findArchitectureImportViolations(source, filename, sourceRoot, [predicate])).toEqual([]);
  });
});
