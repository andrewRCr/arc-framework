/** File inverse follows projection and keeps ambiguous directory roots out of the store classifier. */
import { expect, it } from "vitest";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { identifyArcFileAddress } from "../../../src/lib/layout/file-identification.js";
import { resolveArcPath } from "../../../src/lib/layout/projection.js";
import { ArcLayoutAddressSchema } from "../../../src/lib/layout/schema.js";
import { classifyStoreAddress } from "../../../src/lib/store/target-classification.js";
import { assertSchemaRefuses } from "../../helpers/schema-assertion.js";
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
  const identified = identifyArcFileAddress(resolveArcPath(address), { active: context });
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
  expect(identifyArcFileAddress(path, { active: { claim: SlugSchema.parse("hyphenated-example"), layoutActive: "nested" } })).toBeNull();
  expect(identifyArcFileAddress(path, { active: { claim: null, layoutActive: "flat" } })).toBeNull();
});

it.each(["nested", "flat"] as const)("refuses another slug's file in the checkout's own %s folder", layoutActive => {
  const directory = layoutActive === "nested" ? ".arc/active/current" : ".arc/active";
  expect(identifyArcFileAddress(`${directory}/meta-different-item.md`, {
    active: { claim: SlugSchema.parse("claimed-item"), layoutActive },
  })).toBeNull();
});

it.each(["nested", "flat"] as const)("maps a cohort copy in the claimed %s folder to its home record", layoutActive => {
  const context = { claim: SlugSchema.parse("hyphenated-example"), layoutActive };
  const address = ArcLayoutAddressSchema.parse({ kind: "cohort-copy", cohort: "storage-projection", location: { kind: "own", ...context } });
  const directory = layoutActive === "nested" ? ".arc/active/current" : ".arc/active";
  const path = resolveArcPath(address);
  expect(path).toBe(`${directory}/cohort-storage-projection.md`);
  const identified = identifyArcFileAddress(path, { active: context });
  expect(identified).toEqual(address);
  if (identified === null) throw new Error("The cohort copy was not identified");
  const target = { kind: "cohort/document", cohort: "storage-projection", entryList: false };
  expect(classifyStoreAddress(identified)).toEqual(target);
  const home = ArcLayoutAddressSchema.parse({ kind: "cohort-document", cohort: ["state-storage", "storage-projection"], placement: { kind: "planned" } });
  expect(classifyStoreAddress(home)).toEqual(target);
});

function establishedContainer(owner: string, cohort: readonly string[] = []) {
  const container = ArcLayoutAddressSchema.parse({ kind: "work-unit-container", slug: owner,
    placement: { kind: "backlog", commitment: "planned", cohort } });
  if (container.kind !== "work-unit-container") throw new Error("Expected a work-item container");
  return container;
}

it.each([
  { owner: "alpha", cohort: [], key: "beta/note.txt" },
  { owner: "beta", cohort: ["alpha"], key: "note.txt" },
])("classifies a nested backlog file within the established $owner container", ({ owner, cohort, key }) => {
  const path = ".arc/backlog/planned/alpha/beta/note.txt";
  const identified = identifyArcFileAddress(path, { workItem: establishedContainer(owner, cohort) });
  expect(identified).toMatchObject({ kind: "work-unit-companion", slug: owner, key });
  if (identified === null) throw new Error("The established container's file was not identified");
  expect(resolveArcPath(identified)).toBe(path);
  expect(classifyStoreAddress(identified)).toEqual({ kind: "work-item/companion", workItem: owner, key, entryList: false });
});

it("does not replace an unrelated established container with a guessed work-item owner", () => {
  expect(identifyArcFileAddress(".arc/active/in-flight/another/meta-another.md", {
    workItem: establishedContainer("alpha"),
  })).toBeNull();
});

it("leaves a path-keyed backlog companion unclassified without an established container", () => {
  expect(identifyArcFileAddress(".arc/backlog/planned/alpha/beta/note.txt")).toBeNull();
});

it.each((["nested", "flat"] as const).flatMap(layoutActive => ["research", "notes-x"].map(key => ({ layoutActive, key }))))(
  "round-trips the named companion $key by its hyphenated claim under $layoutActive", ({ layoutActive, key }) => {
    const active = { claim: SlugSchema.parse("owner-with-dashes"), layoutActive };
    const container = ArcLayoutAddressSchema.parse({ kind: "work-unit-container", slug: active.claim,
      placement: { kind: "active", scope: { kind: "project", location: { kind: "own", ...active } } } });
    if (container.kind !== "work-unit-container") throw new Error("Expected the claimed container");
    const address = ArcLayoutAddressSchema.parse({ kind: "work-unit-companion", slug: active.claim, placement: container.placement, key });
    const directory = layoutActive === "nested" ? ".arc/active/current" : ".arc/active";
    const path = `${directory}/${key}-${active.claim}.md`;
    expect(resolveArcPath(address)).toBe(path);
    const identified = identifyArcFileAddress(path, { active, workItem: container });
    expect(identified).toEqual(address);
    if (identified === null) throw new Error("The named companion was not identified");
    expect(classifyStoreAddress(identified)).toEqual({ kind: "work-item/companion", workItem: active.claim, key, entryList: false });
  },
);

it.each(["meta", "draft", "spec", "tasks", "notes"] as const)("recognizes %s before a companion inside the established container", artifact => {
  const container = establishedContainer("beta", ["alpha"]);
  const address = ArcLayoutAddressSchema.parse({ kind: "work-unit-artifact", slug: container.slug, placement: container.placement, artifact });
  expect(identifyArcFileAddress(resolveArcPath(address), { workItem: container })).toEqual(address);
});

it.each([
  { kind: "work-unit-spec-part", part: "prd", file: "spec-beta-prd.md", storeKind: "work-item/companion", key: "spec-prd", entryList: false },
  { kind: "work-unit-spec-part", part: "rfc", file: "spec-beta-rfc.md", storeKind: "work-item/companion", key: "spec-rfc", entryList: false },
  { kind: "work-unit-inbound", file: "inbound-beta.md", storeKind: "work-item/inbound", entryList: true },
])("round-trips the fixed name $file before a companion", ({ kind, part, file, storeKind, key, entryList }) => {
  const container = establishedContainer("beta", ["alpha"]);
  const address = ArcLayoutAddressSchema.parse({ kind, slug: container.slug, placement: container.placement,
    ...(part === undefined ? {} : { part }) });
  const path = `${resolveArcPath(container)}/${file}`;
  expect(resolveArcPath(address)).toBe(path);
  const identified = identifyArcFileAddress(path, { workItem: container });
  expect(identified).toEqual(address);
  if (identified === null) throw new Error("The fixed file was not identified");
  expect(classifyStoreAddress(identified)).toEqual({ kind: storeKind, workItem: container.slug, entryList,
    ...(key === undefined ? {} : { key }) });
});

it.each(["spec-prd", "spec-rfc"])("keeps the paired-spelling prefix %s in a literal companion path", prefix => {
  const container = establishedContainer("beta");
  const key = `${prefix}-beta.md`;
  const address = ArcLayoutAddressSchema.parse({ kind: "work-unit-companion", slug: container.slug, placement: container.placement, key });
  const path = `${resolveArcPath(container)}/${key}`;
  expect(resolveArcPath(address)).toBe(path);
  expect(identifyArcFileAddress(path, { workItem: container })).toEqual(address);
});


it.each(["nested", "flat", "another", "completed"] as const)("round-trips an Errand description in its %s placement", location => {
  const slug = SlugSchema.parse("fix-something");
  const active = { claim: slug, layoutActive: location === "flat" ? "flat" as const : "nested" as const };
  const placement = location === "completed" ? { kind: "completed", quarter: "2026-q4" }
    : { kind: "active", scope: { kind: "project", location: location === "another" ? { kind: "another" }
      : { kind: "own", ...active } } };
  const address = ArcLayoutAddressSchema.parse({ kind: "errand-description", slug, placement });
  const directory = location === "completed" ? ".arc/completed/2026-q4" : location === "another"
    ? `.arc/active/in-flight/${slug}` : location === "flat" ? ".arc/active" : ".arc/active/current";
  const path = `${directory}/errand-${slug}.md`;
  expect(resolveArcPath(address)).toBe(path);
  const identified = identifyArcFileAddress(path, { active });
  expect(identified).toEqual(address);
  if (identified === null) throw new Error("The Errand description was not identified");
  expect(classifyStoreAddress(identified)).toEqual({ kind: "work-item/description", workItem: slug, entryList: true });
});

it("keeps another work item's folder outside the flat checkout's companion tree", () => {
  const active = { claim: SlugSchema.parse("own-item"), layoutActive: "flat" as const };
  const address = ArcLayoutAddressSchema.parse({ kind: "work-unit-inbound", slug: "another",
    placement: { kind: "active", scope: { kind: "project", location: { kind: "another" } } } });
  expect(identifyArcFileAddress(resolveArcPath(address), { active })).toEqual(address);
});

it("recognizes a cohort copy inside an explicitly established own container", () => {
  const active = { claim: SlugSchema.parse("own-item"), layoutActive: "nested" as const };
  const container = ArcLayoutAddressSchema.parse({ kind: "work-unit-container", slug: active.claim,
    placement: { kind: "active", scope: { kind: "project", location: { kind: "own", ...active } } } });
  if (container.kind !== "work-unit-container") throw new Error("Expected an own container");
  const address = ArcLayoutAddressSchema.parse({ kind: "cohort-copy", cohort: "core", location: { kind: "own", ...active } });
  expect(identifyArcFileAddress(resolveArcPath(address), { workItem: container })).toEqual(address);
});

it("preserves session-context identity for a work unit named scratch", () => {
  const address = ArcLayoutAddressSchema.parse({ kind: "user-document", identity: "alice",
    document: { kind: "session-notes", workUnit: "scratch" } });
  const path = resolveArcPath(address);
  expect(path).toBe(".arc/user/alice/scratch/SESSION-NOTES.md");
  const identified = identifyArcFileAddress(path);
  expect(identified).toEqual(address);
  if (identified === null) throw new Error("The session context was not identified");
  expect(classifyStoreAddress(identified)).toEqual({ kind: "personal/session-context", identity: "alice", key: "scratch", entryList: false });
});

it("refuses a scratch-document address reserved for session context", () => {
  assertSchemaRefuses(ArcLayoutAddressSchema,
    { kind: "scratch-document", identity: "alice", key: "scratch/SESSION-NOTES.md" }, ["key"]);
});

it.each(["scratch/note.md", "scratch/sub/diagram.svg", "scratch/持ち物 'quoted'.txt"])("round-trips the personal document %s", key => {
  const address = ArcLayoutAddressSchema.parse({ kind: "scratch-document", identity: "alice", key });
  const path = `.arc/user/alice/${key}`;
  expect(resolveArcPath(address)).toBe(path);
  const identified = identifyArcFileAddress(path);
  expect(identified).toEqual(address);
  if (identified === null) throw new Error("The scratch document was not identified");
  expect(classifyStoreAddress(identified)).toEqual({ kind: "personal/document", identity: "alice", key, entryList: false });
});

it.each((["nested", "flat"] as const).flatMap(layoutActive => [
  { kind: "work-unit-companion", key: "research", file: "research-hyphenated-owner.md" },
  { kind: "work-unit-spec-part", part: "prd", file: "spec-hyphenated-owner-prd.md" },
  { kind: "work-unit-inbound", file: "inbound-hyphenated-owner.md" },
].map(form => ({ layoutActive, ...form }))))("recognizes $file from the supplied $layoutActive checkout context", ({ layoutActive, file, ...form }) => {
  const active = { claim: SlugSchema.parse("hyphenated-owner"), layoutActive };
  const address = ArcLayoutAddressSchema.parse({ ...form, slug: active.claim,
    placement: { kind: "active", scope: { kind: "project", location: { kind: "own", ...active } } } });
  const path = `${layoutActive === "nested" ? ".arc/active/current" : ".arc/active"}/${file}`;
  expect(resolveArcPath(address)).toBe(path);
  expect(identifyArcFileAddress(path, { active })).toEqual(address);
});

it.each(["diagram.svg", "sub/notes.md", "sub/meta-other.md", "sub/cohort-core/note.txt", "extra-alpha.md"])("retains the literal companion path %s below its established folder", key => {
  const container = establishedContainer("beta");
  const address = ArcLayoutAddressSchema.parse({ kind: "work-unit-companion", slug: container.slug, placement: container.placement, key });
  const path = `${resolveArcPath(container)}/${key}`;
  expect(resolveArcPath(address)).toBe(path);
  expect(identifyArcFileAddress(path, { workItem: container })).toEqual(address);
});

it("allows an in-flight-named companion subfolder inside the nested own location", () => {
  const active = { claim: SlugSchema.parse("beta"), layoutActive: "nested" as const };
  const address = ArcLayoutAddressSchema.parse({ kind: "work-unit-companion", slug: active.claim, key: "in-flight/other/note.txt",
    placement: { kind: "active", scope: { kind: "project", location: { kind: "own", ...active } } } });
  expect(identifyArcFileAddress(resolveArcPath(address), { active })).toEqual(address);
});

it("leaves the machine-only Errand queue without a projected file address", () => {
  expect(identifyArcFileAddress(".arc/user/alice/errand-queue-alice.md")).toBeNull();
});

it("reserves a cohort-prefixed companion key even when it contains a subfolder", () => {
  const container = establishedContainer("beta");
  const key = "cohort-core/note.txt";
  expect.soft(ArcLayoutAddressSchema.safeParse({ kind: "work-unit-companion", slug: container.slug, placement: container.placement, key }).success).toBe(false);
  expect.soft(identifyArcFileAddress(`${resolveArcPath(container)}/${key}`, { workItem: container })).toBeNull();
});
