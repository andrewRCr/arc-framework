/** New backlog metadata is minted through the ordinary stub path before its authored content is adopted. */
import { expect, it, vi } from "vitest";
import { mkdir, readFile, writeFile, rename, symlink, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { RecordReference } from "../../src/lib/store/identity.js";
import { OwnerIdentitySchema } from "../../src/lib/store/identity.js";
import { seed } from "../helpers/store/suite-tools.js";
import { sameReference } from "../../src/lib/store/identity.js";
import { overrideEngineStore } from "../helpers/store/projection/engine-fixture.js";
import type { ProjectionEnginePorts } from "../../src/lib/store/projection/engine-ports.js";
import { acquireAdvisoryLock, releaseAdvisoryLockConfirmed, type AdvisoryLockHandle } from "../../src/lib/advisory-lock.js";
import { ADVISORY_LEASE_DURATION_MS } from "../../src/lib/renewable-lease.js";
import { PROJECTION_LOCK_FILE } from "../../src/lib/store/projection/lock.js";
import { writeMetaState, writeMetaCurrentWorkflow } from "../../src/lib/store/kinds/meta/writers.js";
import { afterEach } from "vitest";
import type { Store } from "../../src/lib/store/contract.js";
import { dispatchRegisteredCli } from "../helpers/registered-cli.js";
import { createReferenceFixture } from "../helpers/store/reference-fixture.js";
import { ENTRY_CONFIGS } from "../../src/lib/store/kinds/entry-configs.js";
import { createAdoptionFixture } from "../helpers/store/projection/adoption-fixture.js";
import { makeMetaFixture } from "../helpers/meta-fixture.js";
import { success } from "../helpers/store/suite-tools.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { writeMetaClass } from "../../src/lib/store/kinds/meta/writers.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { readProjectionIndex } from "../../src/lib/store/projection/index-file.js";
import { parseMetaRecord } from "../../src/lib/active/meta-reader.js";

const binding = vi.hoisted(() => ({ store: null as Store | null,
  ports: null as ((ports: ProjectionEnginePorts) => ProjectionEnginePorts) | null }));
vi.mock("../../src/lib/store/create.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/lib/store/create.js")>();
  return { ...original, createStore: (...args: Parameters<typeof original.createStore>) => {
    const selected = binding.store;
    binding.store = null;
    return selected ?? original.createStore(...args);
  } };
});

vi.mock("../../src/lib/store/projection/engine-ports.js", async importOriginal => {
  const original = await importOriginal<typeof import("../../src/lib/store/projection/engine-ports.js")>();
  return { ...original, createProjectionEnginePorts: (...args: Parameters<typeof original.createProjectionEnginePorts>) => {
    const ports = original.createProjectionEnginePorts(...args);
    return binding.ports?.(ports) ?? ports;
  } };
});
afterEach(() => { binding.ports = null; });

async function selection(store: Store, checkout: string) {
  const cwd = process.cwd(), exit = process.exitCode;
  let output = "";
  const out = vi.spyOn(process.stdout, "write").mockImplementation(chunk => { output += String(chunk); return true; });
  try {
    binding.store = store; process.chdir(checkout); process.exitCode = undefined;
    await dispatchRegisteredCli(["selection", "--changed", "--json"]);
    return { output, exitCode: process.exitCode ?? 0 };
  } finally { binding.store = null; out.mockRestore(); process.chdir(cwd); process.exitCode = exit; }
}

it("mints an unowned planned meta and keeps its prose and soft fields after lifecycle normalization", async () => {
  const { f } = await createAdoptionFixture();
  const folder = ".arc/backlog/planned/beta", path = `${folder}/meta-beta.md`;
  const authored = makeMetaFixture("beta", { state: "Active", owner: "andrew", workClass: "Light", priority: "P1",
    currentWorkflow: "process-task-loop", nextTask: "Keep the authored plan.", origin: "internal", design: ["draft-beta.md"] })
    .replace("`andrew`", "[none]") + "\n## Research\n\nRetain this authored rationale.\n";
  await mkdir(join(f.root, folder), { recursive: true });
  await writeFile(join(f.root, path), authored);
  const selected = await selection(f.store, f.root);
  expect(selected.exitCode, selected.output).toBe(0);
  const found = await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("beta") });
  expect(found.status).toBe("ok");
  const record = success(await f.store.read({ reference: success(found).reference }));
  expect(record.reference.owner).toMatchObject({ type: "work-item", name: "beta", uid: expect.any(String) });
  expect(record.placement).toMatchObject({ kind: "backlog", commitment: "planned" });
  const fields = parseMetaRecord(record.content);
  expect(fields).toMatchObject({ state: "Planning", owner: "andrew", workClass: "Light", nextTask: "Keep the authored plan.",
    origin: "internal", design: ["draft-beta.md"] });
  expect(record.content).toContain("Retain this authored rationale.");
  const history = success(await f.store.history({ reference: record.reference }));
  const minted = history.find(entry => "verb" in entry.provenance && entry.provenance.verb === "stub");
  if (minted?.content === null || minted?.content === undefined) throw new Error("No exact stub creation history");
  expect(fields.currentWorkflow).toBe(parseMetaRecord(minted.content).currentWorkflow);
  expect(history.some(entry => "lifecycleAction" in entry.provenance && entry.provenance.lifecycleAction === "edit")).toBe(true);
  expect(JSON.parse(selected.output)).toEqual({ paths: [path] });
  expect(await readFile(join(f.root, path), "utf8")).toContain("Retain this authored rationale.");
});

it("binds a companion discovered before its metadata to one minted generation and still normalizes the meta", async () => {
  const { f } = await createAdoptionFixture();
  const folder = ".arc/backlog/planned/beta", metaPath = `${folder}/meta-beta.md`, companion = `${folder}/a/note.txt`;
  await mkdir(join(f.root, folder, "a"), { recursive: true });
  const authored = makeMetaFixture("beta", { state: "Active", owner: "andrew", workClass: "Light", priority: "P2",
    currentWorkflow: "process-task-loop" }) + "\nKeep the companion-first metadata prose.\n";
  await writeFile(join(f.root, metaPath), authored);
  await writeFile(join(f.root, companion), "A nested companion seen before the meta.\n");
  const selected = await selection(f.store, f.root);
  expect(selected.exitCode, selected.output).toBe(0);
  const primary = success(await f.store.read({ reference: success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("beta") })).reference }));
  expect(primary.content).toContain("Keep the companion-first metadata prose.");
  expect(parseMetaRecord(primary.content).state).toBe("Planning");
  const note = success(await f.store.read({ reference: recordReferences["work-item/companion"](primary.reference.owner, "a/note.txt") }));
  expect(note.reference.owner).toEqual(primary.reference.owner);
  expect(note.content).toBe("A nested companion seen before the meta.\n");
  const history = success(await f.store.history({ reference: primary.reference }));
  expect(history.filter(entry => "verb" in entry.provenance && entry.provenance.verb === "stub")).toHaveLength(1);
  expect(JSON.parse(selected.output)).toEqual({ paths: [metaPath] });
});

it("retains the exact mint through a refused basis read and normalizes the same edit after read repair", async () => {
  const { f } = await createAdoptionFixture();
  const path = ".arc/backlog/planned/beta/meta-beta.md";
  const authored = makeMetaFixture("beta", { state: "Active", owner: "andrew", workClass: "Light", priority: "P1",
    currentWorkflow: "process-task-loop" }) + "\nA correction waiting for the minted basis.\n";
  await mkdir(join(f.root, ".arc/backlog/planned/beta"), { recursive: true });
  await writeFile(join(f.root, path), authored);
  const accepted: { reference: RecordReference | null } = { reference: null };
  let readable = false;
  const store = overrideEngineStore(f.store, {
    batch: async input => {
      const result = await f.store.batch(input);
      if (result.status === "ok" && input.provenance.verb === "stub") accepted.reference = result.result.writes[0]?.reference ?? null;
      return result;
    },
    read: async input => !readable && accepted.reference !== null && sameReference(input.reference, accepted.reference)
      ? { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference: input.reference,
        rule: "test.minted-basis", condition: "The minted record read is temporarily unavailable.",
        remedy: { text: "Restore the minted record read, then retry." } } }
      : f.store.read(input),
  });
  expect((await selection(store, f.root)).exitCode).toBe(0);
  expect(accepted.reference).not.toBeNull();
  if (accepted.reference === null) throw new Error("No accepted stub receipt");
  const before = success(await f.store.read({ reference: accepted.reference }));
  expect(before.content).not.toContain("A correction waiting for the minted basis.");
  expect(await readFile(join(f.root, path), "utf8")).toBe(authored);
  readable = true;
  const repaired = await selection(store, f.root);
  expect(repaired.exitCode, repaired.output).toBe(0);
  const after = success(await f.store.read({ reference: accepted.reference }));
  expect(after.reference.owner).toEqual(before.reference.owner);
  expect(after.content).toContain("A correction waiting for the minted basis.");
  expect(parseMetaRecord(after.content).state).toBe("Planning");
  expect(success(await f.store.history({ reference: after.reference })).filter(entry => "verb" in entry.provenance && entry.provenance.verb === "stub")).toHaveLength(1);
  expect(JSON.parse(repaired.output)).toEqual({ paths: [path] });
});

it("keeps initial normalization through a hand-edit refusal and retries the same minted generation", async () => {
  const { f } = await createAdoptionFixture();
  const path = ".arc/backlog/planned/beta/meta-beta.md";
  await mkdir(join(f.root, ".arc/backlog/planned/beta"), { recursive: true });
  const authored = makeMetaFixture("beta", { state: "Active", owner: "andrew", workClass: "Light", priority: "P1",
    currentWorkflow: "process-task-loop" }) + "\nA correction awaiting write repair.\n";
  await writeFile(join(f.root, path), authored);
  let writable = false;
  const store = overrideEngineStore(f.store, { batch: async input => !writable && input.writes[0]?.reference.owner.name === "beta"
    && input.provenance.lifecycleAction === "edit" ? { status: "refused", refusal: { code: "record-malformed", class: "recoverable",
      reference: input.writes[0]?.reference, rule: "test.initial-edit", condition: "The initial hand edit is temporarily refused.",
      remedy: { text: "Repair the hand-edit destination, then retry." } } } : f.store.batch(input) });
  expect((await selection(store, f.root)).exitCode).toBe(0);
  const primary = success(await f.store.read({ reference: success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("beta") })).reference }));
  expect(primary.content).not.toContain("A correction awaiting write repair.");
  expect(await readFile(join(f.root, path), "utf8")).toBe(authored);
  writable = true;
  const repaired = await selection(store, f.root);
  const after = success(await f.store.read({ reference: primary.reference }));
  expect(after.reference.owner).toEqual(primary.reference.owner);
  expect(after.content).toContain("A correction awaiting write repair.");
  expect(parseMetaRecord(after.content).state).toBe("Planning");
  expect(success(await f.store.history({ reference: after.reference })).filter(entry => "verb" in entry.provenance && entry.provenance.verb === "stub")).toHaveLength(1);
  expect(JSON.parse(repaired.output)).toEqual({ paths: [path] });
});

it.each(["reference", "default", "separate"] as const)("preserves later lifecycle changes across initial-mint admission in %s", async backend => {
  const source = await createAdoptionFixture({ layout: backend === "reference" ? "default" : backend });
  const memory = backend === "reference" ? createReferenceFixture(ENTRY_CONFIGS, source.registry) : null;
  if (memory !== null) {
    memory.identity("andrew");
    await seed(memory, source.primary.reference, source.primary.content, { kind: "backlog", commitment: "planned" });
  }
  const f = memory === null ? source.f : { ...source.f, store: memory.store };
  const path = ".arc/backlog/planned/beta/meta-beta.md";
  await mkdir(join(f.root, ".arc/backlog/planned/beta"), { recursive: true });
  await writeFile(join(f.root, path), makeMetaFixture("beta", { state: "Active", owner: "andrew", workClass: "Light", priority: "P1",
    currentWorkflow: "process-task-loop" }) + "\nAn edit across concurrent Class changes.\n");
  const accepted: { reference: RecordReference | null } = { reference: null };
  let advancedAgain = false;
  async function setClass(reference: RecordReference, workClass: "Heavy" | "Novel") {
    const current = success(await f.store.read({ reference }));
    if (current.placement?.kind !== "backlog") throw new Error("No backlog placement for the concurrent Class write");
    success(await f.store.write({ action: "put", reference: current.reference, expected: current.version, placement: current.placement,
      content: writeMetaClass(current.content, workClass), provenance: { verb: "set-class", lifecycleAction: "set-class" } }));
  }
  const store = overrideEngineStore(f.store, {
    batch: async input => {
      const mutation = input.writes[0];
      if (!advancedAgain && accepted.reference !== null && mutation && sameReference(mutation.reference, accepted.reference)
        && input.provenance.lifecycleAction === "edit") {
        advancedAgain = true;
        await setClass(accepted.reference, "Novel");
      }
      const result = await f.store.batch(input);
      if (result.status === "ok" && input.provenance.verb === "stub") {
        accepted.reference = result.result.writes[0]?.reference ?? null;
        if (accepted.reference !== null) await setClass(accepted.reference, "Heavy");
      }
      return result;
    },
  });
  const selected = await selection(store, f.root);
  expect(selected.exitCode, selected.output).toBe(0);
  if (accepted.reference === null) throw new Error("No accepted stub receipt");
  expect(advancedAgain).toBe(true);
  expect(success(await f.store.read({ reference: accepted.reference })).content).not.toContain("An edit across concurrent Class changes.");
  const repaired = await selection(store, f.root);
  const after = success(await f.store.read({ reference: accepted.reference }));
  expect(parseMetaRecord(after.content).workClass).toBe("Novel");
  expect(after.content).toContain("An edit across concurrent Class changes.");
  expect(after.conflicts).toEqual([]);
  expect(JSON.parse(repaired.output)).toEqual({ paths: [path] });
});

it("keeps an accepted mint pending across a linked folder and lands the authored edit after regular-folder repair", async () => {
  const { f } = await createAdoptionFixture();
  const folder = join(f.root, ".arc/backlog/planned/beta"), path = ".arc/backlog/planned/beta/meta-beta.md";
  const authored = makeMetaFixture("beta", { state: "Active", owner: "andrew", workClass: "Light", priority: "P1",
    currentWorkflow: "process-task-loop" }) + "\nA pending edit retained across link repair.\n";
  await mkdir(folder, { recursive: true }); await writeFile(join(f.root, path), authored);
  const accepted: { reference: RecordReference | null } = { reference: null };
  let readable = false;
  const store = overrideEngineStore(f.store, {
    batch: async input => {
      const result = await f.store.batch(input);
      if (result.status === "ok" && input.provenance.verb === "stub") accepted.reference = result.result.writes[0]?.reference ?? null;
      return result;
    },
    read: async input => !readable && accepted.reference !== null && sameReference(input.reference, accepted.reference)
      ? { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference: input.reference,
        rule: "test.minted-basis", condition: "The minted record read is temporarily unavailable.",
        remedy: { text: "Restore the minted record read, then retry." } } } : f.store.read(input),
  });
  expect((await selection(store, f.root)).exitCode).toBe(0);
  if (accepted.reference === null) throw new Error("No accepted stub receipt");
  readable = true;
  const backup = join(f.root, "kept-beta");
  await rename(folder, backup);
  await symlink(backup, folder, process.platform === "win32" ? "junction" : "dir");
  try {
    expect((await selection(store, f.root)).exitCode).toBe(0);
    expect(await readFile(join(backup, "meta-beta.md"), "utf8")).toBe(authored);
    expect(success(await f.store.read({ reference: accepted.reference })).content).not.toContain("A pending edit retained across link repair.");
  } finally { await unlink(folder); await rename(backup, folder); }
  const repaired = await selection(store, f.root);
  expect(success(await f.store.read({ reference: accepted.reference })).content).toContain("A pending edit retained across link repair.");
  expect(success(await f.store.history({ reference: accepted.reference })).filter(entry => "verb" in entry.provenance && entry.provenance.verb === "stub")).toHaveLength(1);
  expect(JSON.parse(repaired.output)).toEqual({ paths: [path] });
});

it("mints a provisional folder with the rendered unresolved Class as an omitted class parameter", async () => {
  const { f } = await createAdoptionFixture();
  const path = ".arc/backlog/provisional/beta/meta-beta.md";
  await mkdir(join(f.root, ".arc/backlog/provisional/beta"), { recursive: true });
  await writeFile(join(f.root, path), makeMetaFixture("beta", { state: "Active", owner: "andrew", workClass: "TBD", priority: "P2",
    currentWorkflow: "process-task-loop" }) + "\nA provisional rationale.\n");
  const selected = await selection(f.store, f.root);
  const record = success(await f.store.read({ reference: success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("beta") })).reference }));
  expect(record.placement).toMatchObject({ kind: "backlog", commitment: "provisional" });
  expect(parseMetaRecord(record.content)).toMatchObject({ state: "Planning", workClass: "TBD", owner: "andrew" });
  expect(record.content).toContain("A provisional rationale.");
  expect(JSON.parse(selected.output)).toEqual({ paths: [path] });
});

it.each([
  { name: "invalid Class", from: "`Light`", to: "`Bogus`", reason: "Class" },
  { name: "unresolved planned Class", from: "`Light`", to: "[TBD]", reason: "Class" },
  { name: "invalid priority", from: "`P1`", to: "`P0`", reason: "priority" },
])("leaves $name unminted and adopts the same metadata after parameter repair", async fault => {
  const { f, projected } = await createAdoptionFixture();
  const path = ".arc/backlog/planned/beta/meta-beta.md";
  const valid = makeMetaFixture("beta", { state: "Active", owner: "andrew", workClass: "Light", priority: "P1",
    currentWorkflow: "process-task-loop" }) + "\nA corrected creation proposal.\n";
  await mkdir(join(f.root, ".arc/backlog/planned/beta"), { recursive: true });
  await writeFile(join(f.root, path), valid.replace(fault.from, fault.to));
  const before = success(await f.store.version());
  expect((await selection(f.store, f.root)).exitCode).toBe(0);
  expect((await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("beta") })).status).toBe("refused");
  expect(success(await f.store.version())).toBe(before);
  const held = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (held.kind !== "index") throw new Error("No ownerless-file index");
  expect(held.index.entries[path]).toMatchObject({ kind: "ownerless", refused: { reason: expect.stringContaining(fault.reason) } });
  await writeFile(join(f.root, path), valid);
  const repaired = await selection(f.store, f.root);
  const record = success(await f.store.read({ reference: success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("beta") })).reference }));
  expect(record.content).toContain("A corrected creation proposal.");
  expect(parseMetaRecord(record.content)).toMatchObject({ state: "Planning", workClass: "Light", priority: "P1" });
  expect(JSON.parse(repaired.output)).toEqual({ paths: [path] });
});

it("keeps another owner's proposed metadata unminted and adopts after the handover remedy's ownership repair", async () => {
  const { f, projected } = await createAdoptionFixture();
  const path = ".arc/backlog/planned/beta/meta-beta.md";
  const foreign = makeMetaFixture("beta", { state: "Active", owner: "bob", workClass: "Light", priority: "P1",
    currentWorkflow: "process-task-loop" }) + "\nA proposal repaired by its adopter.\n";
  await mkdir(join(f.root, ".arc/backlog/planned/beta"), { recursive: true });
  await writeFile(join(f.root, path), foreign);
  const before = success(await f.store.version());
  expect((await selection(f.store, f.root)).exitCode).toBe(0);
  expect(success(await f.store.version())).toBe(before);
  expect((await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("beta") })).status).toBe("refused");
  const held = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (held.kind !== "index") throw new Error("No ownerless-file index");
  expect(held.index.entries[path]).toMatchObject({ kind: "ownerless", refused: { reason: expect.stringContaining("Owner bob"),
    remedy: { text: expect.stringContaining("arc handover beta --to bob") } } });
  expect(await readFile(join(f.root, path), "utf8")).toBe(foreign);
  await writeFile(join(f.root, path), foreign.replace("`bob`", "`andrew`"));
  const repaired = await selection(f.store, f.root);
  const record = success(await f.store.read({ reference: success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("beta") })).reference }));
  expect(parseMetaRecord(record.content).owner).toBe("andrew");
  expect(record.content).toContain("A proposal repaired by its adopter.");
  expect(JSON.parse(repaired.output)).toEqual({ paths: [path] });
});

it("names the cohort in a missing-meta remedy and adopts the files once a valid member stub is present", async () => {
  const { f, projected } = await createAdoptionFixture();
  await seed(f, recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "team" })),
    "# Cohort: team\n\n**Parent:** [none]\n\n**Purpose:** Coordinate work.\n");
  const folder = ".arc/backlog/planned/team/beta", notePath = `${folder}/note.txt`, metaPath = `${folder}/meta-beta.md`;
  await mkdir(join(f.root, folder), { recursive: true });
  await writeFile(join(f.root, notePath), "Waiting for a real stub.\n");
  const before = success(await f.store.version());
  expect((await selection(f.store, f.root)).exitCode).toBe(0);
  expect(success(await f.store.version())).toBe(before);
  const held = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (held.kind !== "index") throw new Error("No ownerless companion index");
  expect(held.index.entries[notePath]).toMatchObject({ kind: "ownerless", refused: {
    remedy: { text: expect.stringMatching(/arc stub beta .*--cohort team/u) },
  } });
  expect(await readFile(join(f.root, notePath), "utf8")).toBe("Waiting for a real stub.\n");
  await writeFile(join(f.root, metaPath), "This file has no metadata heading or core table.\n");
  expect((await selection(f.store, f.root)).exitCode).toBe(0);
  expect(success(await f.store.version())).toBe(before);
  const malformed = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (malformed.kind !== "index") throw new Error("No malformed-metadata index");
  expect(malformed.index.entries[metaPath]).toMatchObject({ kind: "ownerless", refused: {
    remedy: { text: expect.stringMatching(/arc stub beta .*--cohort team/u) },
  } });
  await writeFile(join(f.root, metaPath), makeMetaFixture("beta", { state: "Active", owner: "andrew", workClass: "Light", priority: "P2",
    currentWorkflow: "process-task-loop", cohort: "team" }) + "\nThe member's authored prose.\n");
  const repaired = await selection(f.store, f.root);
  const primary = success(await f.store.read({ reference: success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("beta") })).reference }));
  expect(parseMetaRecord(primary.content)).toMatchObject({ state: "Planning", cohort: "team" });
  expect(primary.content).toContain("The member's authored prose.");
  expect(success(await f.store.read({ reference: recordReferences["work-item/companion"](primary.reference.owner, "note.txt") })).content)
    .toBe("Waiting for a real stub.\n");
  expect(JSON.parse(repaired.output)).toEqual({ paths: [metaPath] });
});

it("does not mint a nested prospective owner in an established outer folder and adopts after an unambiguous move", async () => {
  const { f, folder, primary, projected } = await createAdoptionFixture();
  const nested = `${folder}/beta`, notePath = `${nested}/note.txt`, metaPath = `${nested}/meta-beta.md`;
  await mkdir(join(f.root, nested), { recursive: true });
  await writeFile(join(f.root, metaPath), makeMetaFixture("beta", { state: "Active", owner: "andrew", workClass: "Light", priority: "P1",
    currentWorkflow: "process-task-loop" }) + "\nA prospective inner owner's prose.\n");
  await writeFile(join(f.root, notePath), "An ambiguously placed note.\n");
  const before = success(await f.store.version());
  expect((await selection(f.store, f.root)).exitCode).toBe(0);
  expect(success(await f.store.version())).toBe(before);
  expect((await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("beta") })).status).toBe("refused");
  expect((await f.store.read({ reference: recordReferences["work-item/companion"](primary.reference.owner, "beta/note.txt") })).status).toBe("refused");
  const held = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (held.kind !== "index") throw new Error("No ambiguous-file index");
  expect(held.index.entries[notePath]).toMatchObject({ kind: "ownerless", refused: { reason: expect.stringContaining("Conflicting work-item containers") } });
  await rename(join(f.root, nested), join(f.root, ".arc/backlog/planned/beta"));
  const repaired = await selection(f.store, f.root);
  const created = success(await f.store.read({ reference: success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("beta") })).reference }));
  expect(created.content).toContain("A prospective inner owner's prose.");
  const note = success(await f.store.read({ reference: recordReferences["work-item/companion"](created.reference.owner, "note.txt") }));
  expect(note.content).toBe("An ambiguously placed note.\n");
  expect(note.reference.owner).toEqual(created.reference.owner);
  expect(JSON.parse(repaired.output)).toEqual({ paths: [".arc/backlog/planned/beta/meta-beta.md"] });
});

it("requires ordinary field repair if the mint commits before its receipt can be published", async () => {
  const { f, projected } = await createAdoptionFixture();
  const path = ".arc/backlog/planned/beta/meta-beta.md";
  const authored = makeMetaFixture("beta", { state: "Active", owner: "andrew", workClass: "Light", priority: "P1",
    currentWorkflow: "process-task-loop" }) + "\nProse retained across pre-publication interruption.\n";
  await mkdir(join(f.root, ".arc/backlog/planned/beta"), { recursive: true });
  await writeFile(join(f.root, path), authored);
  let now = Date.now(), lost = false, replacement: AdvisoryLockHandle | undefined;
  const accepted: { reference: RecordReference | null } = { reference: null };
  const store = overrideEngineStore(f.store, { batch: async input => {
    const result = await f.store.batch(input);
    if (!lost && result.status === "ok" && input.provenance.verb === "stub") {
      lost = true;
      accepted.reference = result.result.writes[0]?.reference ?? null;
      now = Date.now() + ADVISORY_LEASE_DURATION_MS + 1000;
      replacement = await acquireAdvisoryLock(join(projected.location.stateDir, PROJECTION_LOCK_FILE), {
        pid: process.pid, processInstance: "replacement", processScope: "replacement-scope", now: () => now,
        leaseDurationMs: ADVISORY_LEASE_DURATION_MS, maxWaitMs: 200,
      });
    }
    return result;
  } });
  binding.ports = ports => ({ ...ports, lock: { now: () => now, resolveProcessScope: async () => "original-scope",
    scheduleEvery: () => () => {} } });
  try {
    const interrupted = await selection(store, f.root);
    expect(interrupted.exitCode).toBe(1);
    expect(JSON.parse(interrupted.output)).toMatchObject({ status: "refused", refusal: { condition: expect.stringContaining("lease lost") } });
  } finally { if (replacement !== undefined) await releaseAdvisoryLockConfirmed(replacement); binding.ports = null; }
  if (accepted.reference === null) throw new Error("No accepted stub receipt before the interrupted publication");
  const minted = success(await f.store.read({ reference: accepted.reference }));
  expect(minted.content).not.toContain("Prose retained across pre-publication interruption.");
  expect(await readFile(join(f.root, path), "utf8")).toBe(authored);
  expect((await selection(store, f.root)).exitCode).toBe(0);
  expect(success(await f.store.read({ reference: accepted.reference })).content).not.toContain("Prose retained across pre-publication interruption.");
  expect(await readFile(join(f.root, path), "utf8")).toBe(authored);
  const held = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (held.kind !== "index") throw new Error("No conservative existing-record adoption");
  expect(held.index.entries[path]).toMatchObject({ kind: "record", reference: accepted.reference,
    refused: { reason: expect.stringContaining("meta.verb-owned-field") } });
  const fields = parseMetaRecord(minted.content);
  await writeFile(join(f.root, path), writeMetaCurrentWorkflow(writeMetaState(authored, "Planning"), fields.currentWorkflow));
  const repaired = await selection(store, f.root);
  const record = success(await f.store.read({ reference: accepted.reference }));
  expect(record.content).toContain("Prose retained across pre-publication interruption.");
  expect(success(await f.store.history({ reference: accepted.reference })).filter(entry => "verb" in entry.provenance && entry.provenance.verb === "stub")).toHaveLength(1);
  expect(JSON.parse(repaired.output)).toEqual({ paths: [path] });
});

it("preserves the executor's refusal remedy and mints after its destination is repaired", async () => {
  const { f, projected } = await createAdoptionFixture();
  const path = ".arc/backlog/planned/beta/meta-beta.md";
  const authored = makeMetaFixture("beta", { state: "Active", owner: "andrew", workClass: "Light", priority: "P1",
    currentWorkflow: "process-task-loop" }) + "\nAn edit following executor repair.\n";
  await mkdir(join(f.root, ".arc/backlog/planned/beta"), { recursive: true }); await writeFile(join(f.root, path), authored);
  const remedy = { text: "Restore the stub destination, then retry this creation.", argv: ["arc", "stub", "beta", "--commitment", "planned", "--priority", "P1", "--class", "Light"] };
  let available = false;
  const store = overrideEngineStore(f.store, { batch: async input => {
    if (available || input.provenance.verb !== "stub") return f.store.batch(input);
    const first = input.writes[0];
    if (first === undefined) throw new Error("The actual stub batch has no primary write");
    return { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference: first.reference,
      rule: "test.stub-destination", condition: "The stub's destination is temporarily unavailable.", remedy } };
  } });
  const before = success(await f.store.version());
  expect((await selection(store, f.root)).exitCode).toBe(0);
  expect(success(await f.store.version())).toBe(before);
  expect(await readFile(join(f.root, path), "utf8")).toBe(authored);
  const held = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (held.kind !== "index") throw new Error("No executor-refused metadata index");
  expect(held.index.entries[path]).toMatchObject({ kind: "ownerless", refused: { remedy } });
  available = true;
  const repaired = await selection(store, f.root);
  const record = success(await f.store.read({ reference: success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("beta") })).reference }));
  expect(record.content).toContain("An edit following executor repair.");
  expect(JSON.parse(repaired.output)).toEqual({ paths: [path] });
});

it("retains a published mint through temporary metadata absence and resumes when the same file returns", async () => {
  const { f } = await createAdoptionFixture();
  const path = ".arc/backlog/planned/beta/meta-beta.md";
  const authored = makeMetaFixture("beta", { state: "Active", owner: "andrew", workClass: "Light", priority: "P1",
    currentWorkflow: "process-task-loop" }) + "\nAn edit retained while the metadata path is absent.\n";
  await mkdir(join(f.root, ".arc/backlog/planned/beta"), { recursive: true }); await writeFile(join(f.root, path), authored);
  const accepted: { reference: RecordReference | null } = { reference: null };
  let readable = false;
  const store = overrideEngineStore(f.store, {
    batch: async input => {
      const result = await f.store.batch(input);
      if (result.status === "ok" && input.provenance.verb === "stub") accepted.reference = result.result.writes[0]?.reference ?? null;
      return result;
    },
    read: async input => !readable && accepted.reference !== null && sameReference(input.reference, accepted.reference)
      ? { status: "refused", refusal: { code: "record-malformed", class: "recoverable", reference: input.reference,
        rule: "test.minted-basis", condition: "The minted record read is temporarily unavailable.",
        remedy: { text: "Restore the minted record read, then retry." } } } : f.store.read(input),
  });
  expect((await selection(store, f.root)).exitCode).toBe(0);
  if (accepted.reference === null) throw new Error("No accepted stub receipt");
  await unlink(join(f.root, path));
  expect((await selection(store, f.root)).exitCode).toBe(0);
  readable = true;
  await writeFile(join(f.root, path), authored);
  const repaired = await selection(store, f.root);
  const record = success(await f.store.read({ reference: accepted.reference }));
  expect(record.content).toContain("An edit retained while the metadata path is absent.");
  expect(success(await f.store.history({ reference: accepted.reference })).filter(entry => "verb" in entry.provenance && entry.provenance.verb === "stub")).toHaveLength(1);
  expect(JSON.parse(repaired.output)).toEqual({ paths: [path] });
});

it("keeps the minted metadata binding when an earlier triggering filename refuses classification", async () => {
  const { f, projected } = await createAdoptionFixture();
  const folder = ".arc/backlog/planned/zeta", metaPath = `${folder}/meta-zeta.md`, invalidPath = `${folder}/meta-aaa.md`;
  await mkdir(join(f.root, folder), { recursive: true });
  await writeFile(join(f.root, metaPath), makeMetaFixture("zeta", { state: "Active", owner: "andrew", workClass: "Light", priority: "P1",
    currentWorkflow: "process-task-loop" }) + "\nKeep the canonical metadata's authored rationale.\n");
  const invalid = "An invalidly named attachment whose bytes must remain.\n";
  await writeFile(join(f.root, invalidPath), invalid);
  const selected = await selection(f.store, f.root);
  expect(selected.exitCode, selected.output).toBe(0);
  const primary = success(await f.store.read({ reference: success(await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("zeta") })).reference }));
  expect(primary.content).toContain("Keep the canonical metadata's authored rationale.");
  const disk = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (disk.kind !== "index") throw new Error("No index retaining the minted canonical meta");
  expect(disk.index.entries[metaPath]).toMatchObject({ kind: "record", reference: primary.reference, pending: false });
  expect(disk.index.entries[invalidPath]).toMatchObject({ kind: "ownerless", refused: { reason: expect.stringContaining("no adoptable record address") } });
  expect(await readFile(join(f.root, invalidPath), "utf8")).toBe(invalid);
  expect(success(await f.store.history({ reference: primary.reference })).filter(entry => "verb" in entry.provenance && entry.provenance.verb === "stub")).toHaveLength(1);
  expect(JSON.parse(selected.output)).toEqual({ paths: [metaPath] });
});
