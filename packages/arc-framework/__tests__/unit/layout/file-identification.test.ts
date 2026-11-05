/** File inverse follows projection and keeps ambiguous directory roots out of the store classifier. */
import { expect, it } from "vitest";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { identifyArcFileAddress } from "../../../src/lib/layout/file-identification.js";
import { resolveArcPath } from "../../../src/lib/layout/projection.js";
import { ArcLayoutAddressSchema } from "../../../src/lib/layout/schema.js";
import { classifyStoreAddress } from "../../../src/lib/store/target-classification.js";
it.each([
  { kind: "work-unit-artifact", placement: { kind: "active", scope: { kind: "project" } }, slug: "demo", artifact: "meta" },
  { kind: "work-unit-artifact", placement: { kind: "completed", quarter: "2026-q4", sequence: "03" }, slug: "demo", artifact: "tasks" },
  { kind: "candidate-record", slug: "demo" }, { kind: "integration-boundary-record", slug: "demo" }, { kind: "transition-record", origin: "former" },
  { kind: "editor-document", schema: "tasks" }, { kind: "inbox", scope: { kind: "project" } }, { kind: "inbox", scope: { kind: "identity", identity: "alice" } },
  { kind: "user-document", identity: "alice", document: { kind: "working-memory" } }, { kind: "user-document", identity: "alice", document: { kind: "session-notes", workUnit: "demo" } },
  { kind: "project-document", document: "roadmap" }, { kind: "cohort-document", cohort: ["core"], placement: { kind: "planned" } },
  { kind: "cohort-document", cohort: ["core"], placement: { kind: "completed", quarter: "2026-q4", sequence: "03", closeout: "leaf" } },
])("round-trips the projected file address %#", (input) => {
  const address = ArcLayoutAddressSchema.parse(input), path = resolveArcPath(address);
  expect(identifyArcFileAddress(path)).toEqual(address);
});
it("classifies a work-unit meta and entry lists, and excludes directories and code", () => {
  const meta = identifyArcFileAddress(".arc/active/meta-demo.md");
  expect(meta).not.toBeNull(); if (meta === null) throw new Error("Expected meta");
  expect(classifyStoreAddress(meta)).toEqual({ kind: "work-item/meta", workItem: "demo", entryList: false });
  const inbox = identifyArcFileAddress(".arc/user/alice/USER-INBOX.md"); if (inbox === null) throw new Error("Expected inbox");
  expect(classifyStoreAddress(inbox)).toEqual({ kind: "personal/inbox", identity: "alice", entryList: true });
  expect(identifyArcFileAddress(".arc/active")).toBeNull(); expect(identifyArcFileAddress("src/app.ts")).toBeNull();
});

it.each(["nested", "flat"] as const)("inverts the claimed work item's %s location with its supplied context", layoutActive => {
  const context = { claim: SlugSchema.parse("hyphenated-example"), layoutActive };
  const address = ArcLayoutAddressSchema.parse({ kind: "work-unit-artifact", slug: context.claim, artifact: "meta",
    placement: { kind: "active", scope: { kind: "project", location: { kind: "own", ...context } } } });
  const identified = identifyArcFileAddress(resolveArcPath(address), context);
  expect(identified).toEqual(address);
  if (identified === null) throw new Error("The claimed artifact was not identified");
  expect(classifyStoreAddress(identified)).toEqual({ kind: "work-item/meta", workItem: context.claim, entryList: false });
});

it("inverts another work item's directory without borrowing a checkout claim", () => {
  const address = ArcLayoutAddressSchema.parse({ kind: "work-unit-artifact", slug: "other-item", artifact: "tasks",
    placement: { kind: "active", scope: { kind: "project", location: { kind: "another" } } } });
  expect(identifyArcFileAddress(resolveArcPath(address))).toEqual(address);
});

it("takes supplied nested or ownerless context as authority over legacy flat paths", () => {
  const path = ".arc/active/meta-hyphenated-example.md";
  expect(identifyArcFileAddress(path, { claim: SlugSchema.parse("hyphenated-example"), layoutActive: "nested" })).toBeNull();
  expect(identifyArcFileAddress(path, { claim: null, layoutActive: "flat" })).toBeNull();
});

it.each(["nested", "flat"] as const)("refuses another slug's file in the checkout's own %s folder", layoutActive => {
  const directory = layoutActive === "nested" ? ".arc/active/current" : ".arc/active";
  expect(identifyArcFileAddress(`${directory}/meta-different-item.md`, {
    claim: SlugSchema.parse("claimed-item"), layoutActive,
  })).toBeNull();
});

it.each(["nested", "flat"] as const)("maps a cohort copy in the claimed %s folder to its home record", layoutActive => {
  const context = { claim: SlugSchema.parse("hyphenated-example"), layoutActive };
  const address = ArcLayoutAddressSchema.parse({ kind: "cohort-copy", cohort: "storage-projection", location: { kind: "own", ...context } });
  const directory = layoutActive === "nested" ? ".arc/active/current" : ".arc/active";
  const path = resolveArcPath(address);
  expect(path).toBe(`${directory}/cohort-storage-projection.md`);
  const identified = identifyArcFileAddress(path, context);
  expect(identified).toEqual(address);
  if (identified === null) throw new Error("The cohort copy was not identified");
  const target = { kind: "cohort/document", cohort: "storage-projection", entryList: false };
  expect(classifyStoreAddress(identified)).toEqual(target);
  const home = ArcLayoutAddressSchema.parse({ kind: "cohort-document", cohort: ["state-storage", "storage-projection"], placement: { kind: "planned" } });
  expect(classifyStoreAddress(home)).toEqual(target);
});
