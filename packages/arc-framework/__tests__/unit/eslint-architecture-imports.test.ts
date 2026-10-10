/** Store, raw state helper, and surface name decisions below the native lint engine. */

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
    expect(violations(path, text, predicate)).toEqual([]);
  });
});

function violations(path: string, text: string, predicate: ArchitecturePredicate): string[] {
  const filename = resolve(sourceRoot, path);
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  return findArchitectureImportViolations(source, filename, sourceRoot, [predicate]).map(({ reason }) => reason);
}

describe("raw state helper ratchet", () => {
  it.each([
    ["handlers/outside.ts", 'import { parseMetaFile } from "../lib/active/meta-reader.js";', "lib/active/meta-reader.ts"],
    ["handlers/outside.ts", 'import { type Tip, readRefTip } from "../lib/git/ref-tree.js";', "lib/git/ref-tree.ts"],
    ["lib/status/view.ts", 'export { readTreeEntries } from "../errand/ref-tree.js";', "lib/errand/ref-tree.ts"],
    ["handlers/outside.ts", 'void import("../lib/errand/identity-transaction.js");', "lib/errand/identity-transaction.ts"],
    ["handlers/outside.ts", 'void require("../lib/active/meta-reader.js");', "lib/active/meta-reader.ts"],
    ["handlers/outside.ts", 'void module.require("../lib/active/meta-reader.js");', "lib/active/meta-reader.ts"],
    ["handlers/outside.ts", 'import meta = require("../lib/active/meta-reader.js");', "lib/active/meta-reader.ts"],
    ["handlers/outside.ts", 'import { createRequire } from "node:module"; const load = createRequire(import.meta.url); void load("../lib/active/meta-reader.js");', "lib/active/meta-reader.ts"],
  ])("refuses a value reference outside the store in %s: %s", (path, text, helper) => {
    expect(violations(path, text, "store-raw-state")).toEqual([`raw state helper ${helper} outside the store`]);
  });

  it.each([
    ["handlers/outside.ts", 'import type { MetaRecord } from "../lib/active/meta-reader.js";'],
    ["handlers/outside.ts", 'import { type MetaRecord } from "../lib/active/meta-reader.js";'],
    ["handlers/outside.ts", 'export { type MetaRecord } from "../lib/active/meta-reader.js";'],
    ["handlers/outside.ts", 'type Reader = import("../lib/active/meta-reader.js").MetaRecord;'],
    ["handlers/outside.ts", 'import "../lib/active/meta-schema.js";'],
    ["lib/store/current-work-unit.ts", 'import { parseMetaFile } from "../active/meta-reader.js";'],
    ["lib/store/in-repo/meta.ts", 'import { buildComposedLifecycleIndex } from "../../work-unit/composed-lifecycle-index.js";'],
    ["lib/work-unit/composed-lifecycle-index.ts", 'import { buildLifecycleIndex } from "./lifecycle-index.js";'],
  ])("allows a type reference, an unlisted module, the store, or another helper in %s: %s", (path, text) => {
    expect(violations(path, text, "store-raw-state")).toEqual([]);
  });
});

describe("surface name ratchet", () => {
  it.each([
    ['const inbox = "USER-INBOX.md";', "USER-INBOX"],
    ['const kind = "ATOMIC-INBOX";', "ATOMIC-INBOX"],
    ['throw new Error("ROADMAP drifted");', "ROADMAP"],
    ['type Surface = "STATUS.USER";', "STATUS.USER"],
    ["const path = `${root}/.arc/active/${name}`;", ".arc/active/"],
    ["const meta = `meta-${slug}.md`;", "meta-"],
    ["const matcher = /^meta-(.+)\\.md$/u;", "^meta-"],
    ['const path = "backlog/meta-x.md";', "/meta-"],
  ])("refuses the literal %s", (text, name) => {
    expect(violations("handlers/outside.ts", text, "surface-names")).toEqual([`surface name ${name} outside the layout resolver`]);
  });

  it.each([
    'const code = "meta-read-failed";',
    'const flag = "--meta-path";',
    'import { parseMetaFile } from "./meta-reader.js";',
    'export { parseMetaFile } from "./meta-reader.js";',
    'void import("./meta-reader.js");',
    'type Reader = import("./meta-reader.js").Reader;',
    "// The USER-INBOX and ROADMAP stay in comments.\nconst roadmap = true;",
  ])("allows a code, module specifier, or comment: %s", (text) => {
    expect(violations("handlers/outside.ts", text, "surface-names")).toEqual([]);
  });
});
