/** Store, raw state helper, surface name, and work-unit path decisions below the native lint engine. */

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
    ["lib/delivery/plan-resolution.ts", 'import { enumerateGitTransitionRecords } from "../work-unit/git-transition-record-enumeration.js";', "lib/work-unit/git-transition-record-enumeration.ts"],
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
    ["lib/work-unit/git-transition-record-enumeration.ts", 'import { TRANSITION_RECORD_NAMESPACE } from "./transition-record-store.js";'],
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

describe("work-unit path ratchet", () => {
  const named = 'import { resolveArcPath } from "../lib/layout/index.js"; ';
  const namespace = 'import * as layout from "../lib/layout/index.js"; ';
  const unread = "layout address without a literal kind outside the store";
  const loaded = "layout module loaded by require or dynamic import outside the store";
  const handedOn = "layout namespace passed on outside the store";

  it.each([
    [`${named}resolveArcPath({ kind: "work-unit-artifact", placement, slug, artifact: "meta" });`, "work-unit path work-unit-artifact outside the store"],
    ['import { resolveArcPath as project } from "../lib/layout/projection.js"; project({ kind: "placement-root", tier: "active" });', "work-unit path placement-root outside the store"],
    [`${namespace}layout.resolveArcPath({ kind: "cohort-document", cohort: [slug], placement });`, "work-unit path cohort-document outside the store"],
    [`${namespace}layout["resolveArcPath"]({ kind: "transition-record", origin: slug });`, "work-unit path transition-record outside the store"],
    [`${named}resolveArcPath({ placement, slug, kind: "work-unit-container" as const });`, "work-unit path work-unit-container outside the store"],
    [`${named}resolveArcPath(address);`, unread],
    [`${named}resolveArcPath({ kind: "arc-root", ...address });`, unread],
    [`${named}resolveArcPath({ [field]: "arc-root" });`, unread],
    [`${named}const project = resolveArcPath;`, "layout resolver passed on outside the store"],
    [`${named}export { resolveArcPath };`, "layout resolver passed on outside the store"],
    ['export { resolveArcPath as project } from "../lib/layout/index.js";', "layout resolver re-exported outside the store"],
    ['export * from "../lib/layout/index.js";', "layout resolver re-exported outside the store"],
    ['const { resolveArcPath } = await import("../lib/layout/index.js");', loaded],
    ['const { resolveArcPath } = require("../lib/layout/index.js");', loaded],
    ['import layout = require("../lib/layout/index.js"); void layout;', loaded],
    ['import { createRequire } from "node:module"; const { resolveArcPath } = createRequire(import.meta.url)("../lib/layout/index.js");', loaded],
    [`${namespace}const { resolveArcPath } = layout; resolveArcPath({ kind: "work-unit-artifact" });`, handedOn],
    [`${namespace}const alias = layout; alias.resolveArcPath({ kind: "work-unit-artifact" });`, handedOn],
    [`${namespace}layout[member]({ kind: "work-unit-artifact" });`, handedOn],
    [`${namespace}use((layout));`, handedOn],
    [`${namespace}export { layout };`, handedOn],
  ])("refuses %s", (text, reason) => {
    expect(violations("handlers/outside.ts", text, "work-unit-paths")).toEqual([reason]);
  });

  it("counts the raw state helpers, which sit outside the store", () => {
    const text = `${named}resolveArcPath({ kind: "work-unit-artifact", placement, slug, artifact: "meta" });`;
    expect(violations("lib/active/meta-reader.ts", text.replace("../lib/", "../"), "work-unit-paths"))
      .toEqual(["work-unit path work-unit-artifact outside the store"]);
  });

  it.each([
    [`${named}resolveArcPath({ kind: "arc-root" });`],
    [`${named}resolveArcPath({ kind: "procedure-root", family: "workflows" });`],
    [`${named}resolveArcPath({ kind: "project-document", document: "roadmap" });`],
    [`${named}resolveArcPath({ kind: "inbox", scope: { kind: "project" } });`],
    [`${named}resolveArcPath({ kind: "user-document", identity, document: { kind: "working-memory" } });`],
    [`${named}resolveArcPath({ ...address, kind: "editor-document-root" });`],
    [`${named}type Path = ReturnType<typeof resolveArcPath>;`],
    ['import type * as layout from "../lib/layout/index.js"; type Path = ReturnType<typeof layout.resolveArcPath>;'],
    [`${namespace}class Path implements layout.resolveArcPath {}`],
    [`${namespace}void layout.LayoutError; void layout["ArcLayoutAddressSchema"]; void (layout).resolveArcPath({ kind: "arc-root" });`],
    ['type Address = import("../lib/layout/index.js").ArcLayoutAddress;'],
    ['import { resolveArcPath } from "./elsewhere.js"; resolveArcPath({ kind: "work-unit-artifact" });'],
    ['function resolveArcPath(address: unknown): unknown { return address; } resolveArcPath({ kind: "work-unit-artifact" });'],
    ['export { LayoutError, type ArcLayoutAddress } from "../lib/layout/index.js";'],
    ['export type * from "../lib/layout/index.js";'],
  ])("allows a system, configuration, project, or personal address, a type, or another resolver: %s", (text) => {
    expect(violations("handlers/outside.ts", text, "work-unit-paths")).toEqual([]);
  });

  it("leaves the store to project work-unit paths", () => {
    const text = 'import { resolveArcPath } from "../../layout/index.js"; resolveArcPath({ kind: "placement-root", tier: "planned" });';
    expect(violations("lib/store/in-repo/paths.ts", text, "work-unit-paths")).toEqual([]);
  });
});
