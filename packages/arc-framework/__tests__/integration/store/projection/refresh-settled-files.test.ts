/** A refresh that plans a settled file whose record still renders to the bytes it holds leaves that file in place. */
import { readFile, rm, stat, symlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createAdoptionFixture, createErrandAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { createEngineFixture } from "../../../helpers/store/projection/engine-fixture.js";
import { makeMetaFixture } from "../../../helpers/meta-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { seed, success, update } from "../../../helpers/store/suite-tools.js";
import { OwnerIdentitySchema, recordReferences, sameReference, type RecordReference } from "../../../../src/lib/store/identity.js";
import type { StoreRecord } from "../../../../src/lib/store/read.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { commitProjectionIndex, readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import type { ProjectionIndex } from "../../../../src/lib/store/projection/index-schema.js";
import type { ProjectionLocation } from "../../../../src/lib/store/projection/location.js";
import { withProjectionLock } from "../../../../src/lib/store/projection/lock.js";
import { writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { boundWorkUnitSubject } from "../../../helpers/store/bound-checkout.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

const SETTLED_TIMEOUT_MS = 120_000;

async function readIndex(location: ProjectionLocation): Promise<ProjectionIndex> {
  const read = await readProjectionIndex(location, true, { groups: "all" });
  if (read.kind !== "index") throw new Error("The fixture lost its projection index");
  return read.index;
}

function pathOf(index: ProjectionIndex, reference: RecordReference): string {
  const found = Object.entries(index.entries).find(([, entry]) => entry.kind === "record" && sameReference(entry.reference, reference));
  if (found === undefined) throw new Error(`No entry lays ${reference.kind}`);
  return found[0];
}

async function identities(root: string, paths: readonly string[]) {
  return Promise.all(paths.map(async path => {
    const { ino, mtimeNs } = await stat(join(root, path), { bigint: true });
    return { path, ino, mtimeNs };
  }));
}

async function cycle(command: { checkout: string; store: Parameters<typeof startProjection>[0]["store"] }) {
  expect(await startProjection(command)).toMatchObject({ kind: "ready" });
  await endProjection(command);
}

async function workUnitFixture() {
  const h = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  directories.push(h.f.root);
  const notes = await seed(h.f, recordReferences["work-item/notes"](h.primary.reference.owner), "Opening.\nStored note.\nClosing.\n");
  const kept = await seed(h.f, recordReferences["work-item/companion"](h.primary.reference.owner, "kept.txt"), "Kept bytes.\n");
  await rm(join(h.projected.location.stateDir, "index"));
  const command = { checkout: h.f.root, store: h.f.store };
  await cycle(command);
  return { ...h, notes, kept, command, disk: () => readIndex(h.projected.location) };
}

it("leaves unchanged settled files in place while a link holds the refresh anchor", async () => {
  const h = await workUnitFixture();
  const anchor = (await h.disk()).state;
  await seed(h.f, recordReferences["work-item/companion"](h.primary.reference.owner, "blocked.txt"), "Blocked arrival.\n");
  const link = join(h.f.root, ".arc/active/current/blocked.txt");
  await symlink(join(h.f.root, "elsewhere.txt"), link);
  const notes = success(await h.f.store.write(update(h.f, h.notes, "Opening.\nUpdated note.\nClosing.\n")));
  await cycle(h.command);
  const first = await h.disk();
  expect(first.state).toBe(anchor);
  const notesPath = pathOf(first, h.notes.reference);
  const paths = [notesPath, pathOf(first, h.kept.reference), pathOf(first, h.primary.reference)];
  expect(first.entries[notesPath]).toMatchObject({ pending: false, base: { version: notes.version } });
  const before = await identities(h.f.root, paths);
  for (let command = 0; command < 2; command += 1) {
    await cycle(h.command);
    const held = await h.disk();
    expect(held.state).toBe(anchor);
    expect(held.entries[notesPath]).toMatchObject({ pending: false, base: { version: notes.version } });
    expect(await identities(h.f.root, paths)).toEqual(before);
  }
  await rm(link);
  await cycle(h.command);
  const settled = await h.disk();
  expect(settled.state).toBe(success(await h.f.store.version()));
  expect(await identities(h.f.root, paths)).toEqual(before);
}, SETTLED_TIMEOUT_MS);

it("leaves unchanged files in place when a rebuild runs over a usable index", async () => {
  const h = await workUnitFixture();
  // A usable index with no state version, as a release publishes from its removal swap on, makes the next start rebuild.
  await withProjectionLock(h.projected.location, async session => {
    await commitProjectionIndex({ location: h.projected.location, checkout: h.f.root, checkpoint: session.step,
      index: { ...await h.disk(), state: null } });
  });
  const notes = success(await h.f.store.write(update(h.f, h.notes, "Opening.\nRebuilt note.\nClosing.\n")));
  const unset = await h.disk();
  expect(unset.state).toBeNull();
  const notesPath = pathOf(unset, h.notes.reference);
  const unchanged = [pathOf(unset, h.kept.reference), pathOf(unset, h.primary.reference)];
  const before = await identities(h.f.root, unchanged);
  await cycle(h.command);
  const rebuilt = await h.disk();
  expect(rebuilt.state).toBe(success(await h.f.store.version()));
  expect(rebuilt.entries[notesPath]).toMatchObject({ pending: false, base: { version: notes.version } });
  expect(await readFile(join(h.f.root, notesPath), "utf8")).toContain("Rebuilt note.");
  expect(await identities(h.f.root, unchanged)).toEqual(before);
}, SETTLED_TIMEOUT_MS);

it("leaves settled files in place across commands while a reprojection stays pending", async () => {
  const h = await workUnitFixture();
  const beta = await seed(h.f, recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "beta" })),
    makeMetaFixture("beta", { owner: "andrew", state: "Active", workClass: "Light", priority: "P1", currentWorkflow: "process-task-loop" }),
    { kind: "active" });
  await seed(h.f, recordReferences["work-item/companion"](beta.reference.owner, "only-beta.txt"), "Beta alone.\n");
  await cycle(h.command);
  await symlink(join(h.f.root, "elsewhere.txt"), join(h.f.root, ".arc/active/current/only-beta.txt"));
  await writeWorktreeMarker(h.f.root, { spawnedByArc: false, spawningIdentity: "andrew", createdAt: new Date(0).toISOString(),
    createdFor: boundWorkUnitSubject(beta) });
  await cycle(h.command);
  const pending = await h.disk();
  expect(pending).toMatchObject({ reprojectionPending: true });
  const settled = Object.entries(pending.entries).flatMap(([path, entry]) => entry.kind === "record" && !entry.pending ? [path] : []);
  expect(settled.length).toBeGreaterThan(1);
  const before = await identities(h.f.root, settled);
  await cycle(h.command);
  expect(await h.disk()).toMatchObject({ reprojectionPending: true });
  expect(await identities(h.f.root, settled)).toEqual(before);
}, SETTLED_TIMEOUT_MS);

it("leaves an Errand's unchanged files in place when another of its records changes", async () => {
  const h = await createErrandAdoptionFixture();
  directories.push(h.f.root);
  const inbound = await seed(h.f, recordReferences["work-item/inbound"](h.primary.reference.owner), "## Inbound\n\nA kept handoff.\n");
  await rm(join(h.projected.location.stateDir, "index"));
  const command = { checkout: h.f.root, store: h.f.store };
  await cycle(command);
  const laid = await readIndex(h.projected.location);
  const inboundPath = pathOf(laid, inbound.reference), descriptionPath = pathOf(laid, h.description.reference);
  const before = await identities(h.f.root, [inboundPath]);
  const description = success(await h.f.store.write(update(h.f, h.description, "## Description\n\nA changed intent.\n")));
  await cycle(command);
  const refreshed = await readIndex(h.projected.location);
  expect(refreshed.entries[descriptionPath]).toMatchObject({ pending: false, base: { version: description.version } });
  expect(await identities(h.f.root, [inboundPath])).toEqual(before);
}, SETTLED_TIMEOUT_MS);

it("still re-lays a settled file when a conflict lands on its unchanged record", async () => {
  const h = await createEngineFixture(directories);
  const command = { store: h.store, checkout: h.checkout, ports: h.ports };
  await startProjection(command);
  await endProjection(command);
  const put = (content: string, expected: StoreRecord["version"]) => h.store.write({ action: "put", reference: h.record.reference,
    expected, content, provenance: { verb: "edit", lifecycleAction: "edit" } });
  success(await put("opening\nstored side\nclosing\n", h.record.version));
  await startProjection(command);
  await endProjection(command);
  const [before] = await identities(h.checkout, [h.path]);
  const laid = await h.file();
  const incoming = success(await put("opening\nincoming side\nclosing\n", h.record.version));
  expect(incoming.conflicts).toHaveLength(1);
  await startProjection(command);
  await endProjection(command);
  const [after] = await identities(h.checkout, [h.path]);
  expect(after?.ino).not.toBe(before?.ino);
  expect(await h.file()).not.toBe(laid);
  expect(await h.file()).toContain("incoming side");
  expect((await h.disk()).entries[h.path]).toMatchObject({ pending: false, unshown: [] });
}, SETTLED_TIMEOUT_MS);
