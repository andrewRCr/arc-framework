/** Command entry adopts companions only through established physical containers. */
import { afterEach, expect, it } from "vitest";
import { mkdir, readFile, writeFile, unlink, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";
import { seedProjection } from "../helpers/store/projection/seeded-projection.js";
import { configureEngineCheckout } from "../helpers/store/projection/engine-fixture.js";
import { createKindRegistry, RecordReferenceSchema, OwnerIdentitySchema, recordReferences } from "../../src/lib/store/index.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { startProjection } from "../../src/lib/store/projection/engine.js";
import { beginProjectionCommand } from "../../src/lib/store/projection/process-state.js";
import { readProjectionIndex } from "../../src/lib/store/projection/index-file.js";

afterEach(() => { beginProjectionCommand(); });
it.each([
  { slug: "alpha", cohort: undefined, key: "beta/note.txt", folder: ".arc/backlog/planned/alpha" },
  { slug: "beta", cohort: "alpha", key: "note.txt", folder: ".arc/backlog/planned/alpha/beta" },
])("adopts the same nested path into the sole established $slug container through command entry", async ({ slug, cohort, key, folder }) => {
  const f = await createRefFixture(createKindRegistry(PRODUCTION_REGISTRATIONS));
  f.identity("andrew");
  if (cohort !== undefined) await seed(f, recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: cohort })),
    `# Cohort: ${cohort}\n\n**Parent:** [none]\n\n**Purpose:** Coordinate work.\n`);
  const primary = await seed(f, RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: slug } }),
    makeMetaFixture(slug, { state: "Planning", currentWorkflow: "draft-design", workClass: "Light", priority: "P1", owner: "andrew",
      ...(cohort === undefined ? {} : { cohort }) }), { kind: "backlog", commitment: "planned" });
  const projected = await seedProjection({ store: f.store, checkout: f.root,
    files: [{ reference: primary.reference, path: `${folder}/meta-${slug}.md` }] });
  await configureEngineCheckout(f.root);
  const path = ".arc/backlog/planned/alpha/beta/note.txt", content = "Authored nested companion\n";
  await mkdir(dirname(join(f.root, path)), { recursive: true });
  await writeFile(join(f.root, path), content);
  expect(await startProjection({ store: f.store, checkout: f.root })).toMatchObject({ kind: "ready" });
  const reference = recordReferences["work-item/companion"](primary.reference.owner, key);
  expect(await f.store.read({ reference })).toMatchObject({ status: "ok", result: { reference, content } });
  const disk = await readProjectionIndex(projected.location, true, { groups: "all" });
  expect(disk.kind).toBe("index");
  if (disk.kind !== "index") throw new Error("Missing projection index");
  expect(disk.index.entries[path]).toMatchObject({ kind: "record", reference, pending: false, refused: null });
  expect(await readFile(join(f.root, path), "utf8")).toBe(content);
  expect(success(await f.store.read({ reference: primary.reference })).placement).toEqual({ kind: "backlog", commitment: "planned" });
});

it("preserves a file with competing stored and prospective containers, then adopts after evidence repair", async () => {
  const f = await createRefFixture(createKindRegistry(PRODUCTION_REGISTRATIONS));
  f.identity("andrew");
  const primary = await seed(f, RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } }),
    makeMetaFixture("alpha", { state: "Planning", workClass: "Light", priority: "P1", owner: "andrew", currentWorkflow: "draft-design" }),
    { kind: "backlog", commitment: "planned" });
  const projected = await seedProjection({ store: f.store, checkout: f.root,
    files: [{ reference: primary.reference, path: ".arc/backlog/planned/alpha/meta-alpha.md" }] });
  await configureEngineCheckout(f.root);
  const path = ".arc/backlog/planned/alpha/beta/note.txt", metaPath = ".arc/backlog/planned/alpha/beta/meta-beta.md";
  const content = "Preserve these exact bytes\n", metadata = makeMetaFixture("beta", {
    state: "Planning", workClass: "Light", priority: "P1", owner: "andrew", currentWorkflow: "draft-design" });
  await mkdir(dirname(join(f.root, path)), { recursive: true });
  await writeFile(join(f.root, path), content);
  await writeFile(join(f.root, metaPath), metadata);
  const before = success(await f.store.version());
  await startProjection({ store: f.store, checkout: f.root });
  const refused = await readProjectionIndex(projected.location, true, { groups: "all" });
  expect(refused.kind).toBe("index");
  if (refused.kind !== "index") throw new Error("Missing projection index");
  expect(refused.index.entries[path]).toMatchObject({ kind: "ownerless", refused: {
    reason: expect.stringContaining(".arc/backlog/planned/alpha/beta"), remedy: { text: expect.stringMatching(/repair|unambiguous/iu) },
  } });
  expect(refused.index.entries[path]?.refused?.reason).toContain(".arc/backlog/planned/alpha");
  expect(await readFile(join(f.root, path), "utf8")).toBe(content);
  expect(await readFile(join(f.root, metaPath), "utf8")).toBe(metadata);
  expect(success(await f.store.version())).toBe(before);
  await unlink(join(f.root, metaPath));
  await startProjection({ store: f.store, checkout: f.root });
  const reference = recordReferences["work-item/companion"](primary.reference.owner, "beta/note.txt");
  expect(success(await f.store.read({ reference })).content).toBe(content);
  const repaired = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (repaired.kind !== "index") throw new Error("Missing repaired index");
  expect(repaired.index.entries[path]).toMatchObject({ kind: "record", reference, pending: false, refused: null });
  expect(repaired.index.entries[metaPath]).toBeUndefined();
});

it("keeps a file ownerless until a stored cohort member establishes its container", async () => {
  const f = await createRefFixture(createKindRegistry(PRODUCTION_REGISTRATIONS));
  f.identity("andrew");
  const projected = await seedProjection({ store: f.store, checkout: f.root, files: [] });
  await configureEngineCheckout(f.root);
  const path = ".arc/backlog/planned/alpha/beta/note.txt", content = "Unchanged across ownership repair\n";
  await mkdir(dirname(join(f.root, path)), { recursive: true });
  await writeFile(join(f.root, path), content);
  const before = success(await f.store.version());
  await startProjection({ store: f.store, checkout: f.root });
  const refused = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (refused.kind !== "index") throw new Error("Missing ownerless index");
  expect(refused.index.entries[path]).toMatchObject({ kind: "ownerless", refused: { remedy: {
    text: expect.stringContaining("--cohort alpha"),
  } } });
  expect(refused.index.entries[path]?.refused?.remedy.text).toContain("--commitment planned");
  expect(await readFile(join(f.root, path), "utf8")).toBe(content);
  expect(success(await f.store.version())).toBe(before);
  await seed(f, recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "alpha" })),
    "# Cohort: alpha\n\n**Parent:** [none]\n\n**Purpose:** Coordinate work.\n");
  const primary = await seed(f, RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "beta" } }),
    makeMetaFixture("beta", { state: "Planning", owner: "andrew", workClass: "Light", priority: "P1", cohort: "alpha", currentWorkflow: "draft-design" }),
    { kind: "backlog", commitment: "planned" });
  await startProjection({ store: f.store, checkout: f.root });
  const reference = recordReferences["work-item/companion"](primary.reference.owner, "note.txt");
  expect(success(await f.store.read({ reference })).content).toBe(content);
  const repaired = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (repaired.kind !== "index") throw new Error("Missing repaired index");
  expect(repaired.index.entries[path]).toMatchObject({ kind: "record", reference, pending: false, refused: null });
});

it("keeps an indexed file's exact reference despite competing surrounding containers", async () => {
  const f = await createRefFixture(createKindRegistry(PRODUCTION_REGISTRATIONS));
  f.identity("andrew");
  const primary = await seed(f, RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } }),
    makeMetaFixture("alpha", { state: "Planning", owner: "andrew", workClass: "Light", priority: "P1", currentWorkflow: "draft-design" }),
    { kind: "backlog", commitment: "planned" });
  const companion = await seed(f, recordReferences["work-item/companion"](primary.reference.owner, "beta/note.txt"), "Original indexed prose\n");
  const path = ".arc/backlog/planned/alpha/beta/note.txt";
  const projected = await seedProjection({ store: f.store, checkout: f.root, files: [
    { reference: primary.reference, path: ".arc/backlog/planned/alpha/meta-alpha.md" },
    { reference: companion.reference, path },
  ] });
  await configureEngineCheckout(f.root);
  await writeFile(join(f.root, ".arc/backlog/planned/alpha/beta/meta-beta.md"), makeMetaFixture("beta", {
    state: "Planning", owner: "andrew", workClass: "Light", priority: "P1", currentWorkflow: "draft-design" }));
  const content = "Edit retained under the indexed owner\n";
  await writeFile(join(f.root, path), content);
  await startProjection({ store: f.store, checkout: f.root });
  expect(success(await f.store.read({ reference: companion.reference })).content).toBe(content);
  const disk = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("Missing indexed continuation");
  expect(disk.index.entries[path]).toMatchObject({ kind: "record", reference: companion.reference, pending: false, refused: null });
  expect(await f.store.lookup({ kind: "slug", slug: primary.reference.owner.name })).toMatchObject({
    status: "ok", result: { reference: primary.reference },
  });
});

it("keeps physical folder spelling separate from renamed record authority and reports a true alias refusal", async () => {
  const f = await createRefFixture(createKindRegistry(PRODUCTION_REGISTRATIONS));
  f.identity("andrew");
  const fields = { state: "Planning", owner: "andrew", workClass: "Light", priority: "P1", currentWorkflow: "draft-design" } as const;
  const primary = await seed(f, RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } }),
    makeMetaFixture("alpha", fields), { kind: "backlog", commitment: "planned" });
  const projected = await seedProjection({ store: f.store, checkout: f.root,
    files: [{ reference: primary.reference, path: ".arc/backlog/planned/alpha/meta-alpha.md" }] });
  await configureEngineCheckout(f.root);
  const renamed = RecordReferenceSchema.parse({ ...primary.reference, owner: { ...primary.reference.owner, name: "beta" } });
  const beta = success(await f.store.write({ ...update(f, primary, makeMetaFixture("beta", fields)), reference: renamed }));
  const literal = ".arc/backlog/planned/beta/extra-alpha.md", alias = ".arc/backlog/planned/alpha/extra-beta.md";
  const literalContent = "A literal former basename\n", aliasContent = "Preserve refused alias bytes\n";
  await mkdir(dirname(join(f.root, literal)), { recursive: true });
  await writeFile(join(f.root, literal), literalContent);
  await writeFile(join(f.root, alias), aliasContent);
  await startProjection({ store: f.store, checkout: f.root });
  expect(success(await f.store.read({ reference: recordReferences["work-item/companion"](beta.reference.owner, "extra-alpha.md") })).content).toBe(literalContent);
  const refused = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (refused.kind !== "index") throw new Error("Missing alias refusal");
  expect(refused.index.entries[alias]).toMatchObject({ kind: "ownerless", refused: {
    reason: expect.stringContaining("decodes as work-item/companion"),
    remedy: { text: expect.stringContaining("outside the named record or reserved path") },
  } });
  expect(await readFile(join(f.root, alias), "utf8")).toBe(aliasContent);
  expect(await f.store.read({ reference: recordReferences["work-item/companion"](beta.reference.owner, "extra") }))
    .toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  const repairedPath = ".arc/backlog/planned/alpha/scratch/extra-beta.md";
  await mkdir(dirname(join(f.root, repairedPath)), { recursive: true });
  await rename(join(f.root, alias), join(f.root, repairedPath));
  await startProjection({ store: f.store, checkout: f.root });
  const reference = recordReferences["work-item/companion"](beta.reference.owner, "scratch/extra-beta.md");
  expect(success(await f.store.read({ reference })).content).toBe(aliasContent);
  const repaired = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (repaired.kind !== "index") throw new Error("Missing renamed-owner continuation");
  expect(repaired.index.entries[alias]).toBeUndefined();
  expect(repaired.index.entries[repairedPath]).toMatchObject({ kind: "record", reference, pending: false, refused: null });
});

it("preserves a namespace lookup refusal and adopts the same file after forward metadata repair", async () => {
  const registry = createKindRegistry(PRODUCTION_REGISTRATIONS), f = await createRefFixture(registry);
  f.identity("andrew");
  const primary = await seed(f, RecordReferenceSchema.parse({ kind: "work-item/meta", owner: { type: "work-item", name: "alpha" } }),
    makeMetaFixture("alpha", { state: "Planning", owner: "andrew", workClass: "Light", priority: "P1", currentWorkflow: "draft-design" }),
    { kind: "backlog", commitment: "planned" });
  const projected = await seedProjection({ store: f.store, checkout: f.root, files: [] });
  await configureEngineCheckout(f.root);
  const path = ".arc/backlog/planned/alpha/note.txt", content = "Retain the file until namespace repair\n";
  await mkdir(dirname(join(f.root, path)), { recursive: true });
  await writeFile(join(f.root, path), content);
  const home = expandStoredPath(primary.reference, { registry }), entries = await capturedEntries(f, home.ref);
  const parent = new TextDecoder().decode((await f.ports.rawExec([...f.gitDir ? [`--git-dir=${f.gitDir}`] : [], "rev-parse", home.ref],
    { objectAccess: "local-only" })).stdout).trim();
  const damaged = await plantRef(f.root, home.ref, entries.map(entry => entry.path === home.metadataPath
    ? { path: entry.path, content: "broken metadata" } : entry), { parents: [parent], gitDir: f.gitDir });
  const denied = await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("alpha") });
  expect(denied).toMatchObject({ status: "refused", refusal: { code: "namespace-corrupt" } });
  if (denied.status !== "refused") throw new Error("Expected real lookup damage");
  const before = success(await f.store.version());
  await startProjection({ store: f.store, checkout: f.root });
  const refused = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (refused.kind !== "index") throw new Error("Missing refused index");
  expect(refused.index.entries[path]).toMatchObject({ kind: "ownerless", refused: {
    reason: denied.refusal.condition, remedy: denied.refusal.remedy,
  } });
  expect(await readFile(join(f.root, path), "utf8")).toBe(content);
  expect(success(await f.store.version())).toBe(before);
  await plantRef(f.root, home.ref, entries, { parents: [damaged.tip], gitDir: f.gitDir });
  await startProjection({ store: f.store, checkout: f.root });
  const reference = recordReferences["work-item/companion"](primary.reference.owner, "note.txt");
  expect(success(await f.store.read({ reference })).content).toBe(content);
  const repaired = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (repaired.kind !== "index") throw new Error("Missing repaired index");
  expect(repaired.index.entries[path]).toMatchObject({ kind: "record", reference, pending: false, refused: null });
});
