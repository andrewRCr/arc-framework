/** Refresh resumes held files and owner removals after the condition that blocked them is repaired. */
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createAdoptionFixture } from "../../../helpers/store/projection/adoption-fixture.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { seed, success, update, fixtureRenameProvenance } from "../../../helpers/store/suite-tools.js";
import { RecordReferenceSchema, recordReferences } from "../../../../src/lib/store/identity.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { readProjectionStatus } from "../../../../src/lib/store/projection/status.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";
import { writeWorktreeMarker } from "../../../../src/lib/git/worktree-marker.js";
import { boundWorkUnitSubject } from "../../../helpers/store/bound-checkout.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

async function fixture() {
  const h = await createAdoptionFixture({ placement: { kind: "active" }, ownLayout: "nested" });
  directories.push(h.f.root);
  const notes = await seed(h.f, recordReferences["work-item/notes"](h.primary.reference.owner), "Opening.\nBase.\nClosing.\n");
  const path = ".arc/active/current/notes-alpha.md";
  const command = { checkout: h.f.root, store: h.f.store };
  await rm(join(h.projected.location.stateDir, "index"));
  await startProjection(command);
  await endProjection(command);
  return { ...h, notes, path, command };
}

it("rebuilds a deleted bound withheld file at the next command and clears its status", async () => {
  const h = await fixture();
  await writeFile(join(h.f.root, h.path), "An unstamped hand edit with no trustworthy basis.\n");
  await rm(join(h.projected.location.stateDir, "index"));
  await startProjection(h.command);
  await endProjection(h.command);
  expect(await readProjectionStatus(h.command)).toMatchObject({ kind: "ready", files: expect.arrayContaining([
    expect.objectContaining({ path: h.path, withheld: true }),
  ]) });
  await rm(join(h.f.root, h.path));
  await startProjection(h.command);
  await endProjection(h.command);
  expect(parseStampedFile(await readFile(join(h.f.root, h.path), "utf8")).content).toBe(h.notes.content);
  const status = await readProjectionStatus(h.command);
  expect(status.kind === "ready" && status.files.some(file => file.path === h.path)).toBe(false);
});

it("keeps a refused edit at its departing path through refreshes, then takes it in and removes the old path", async () => {
  const h = await fixture();
  const renamed = RecordReferenceSchema.parse({ ...h.primary.reference, owner: { ...h.primary.reference.owner, name: "beta" } });
  success(await h.f.store.write({ ...update(h.f, h.primary, h.primary.content.replaceAll("alpha", "beta")), reference: renamed,
    provenance: fixtureRenameProvenance }));
  const current = success(await h.f.store.read({ reference: renamed }));
  await writeWorktreeMarker(h.f.root, { spawnedByArc: false, createdFor: boundWorkUnitSubject(current), spawningIdentity: "andrew",
    createdAt: new Date(0).toISOString() });
  const content = "Opening.\nAn authored departing edit.\nClosing.\n";
  const bytes = renderStampedFile({ content, stamp: gitBlobId(h.notes.content, "sha1") });
  await writeFile(join(h.f.root, h.path), bytes);
  const source = createRefusingStore(h.f.store);
  source.refuse("batch", StoreRefusalSchema.parse({ code: "namespace-corrupt", class: "terminal", namespace: "refs/arc/project/work-items",
    condition: "The departing edit's namespace needs repair.", remedy: { text: "Repair the namespace and retry." } }));
  const command = { ...h.command, store: source.store };
  for (let round = 0; round < 2; round += 1) {
    await startProjection(command);
    await endProjection(command);
    expect(await readFile(join(h.f.root, h.path), "utf8")).toBe(bytes);
    expect(await readProjectionIndex(h.projected.location, true)).toMatchObject({ kind: "index", index: { entries: {
      [h.path]: { pending: true, refused: { reason: "The departing edit's namespace needs repair." } },
    } } });
  }
  source.refuse("batch", null);
  await startProjection(command);
  await endProjection(command);
  await expect(readFile(join(h.f.root, h.path), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  expect(success(await h.f.store.read({ reference: h.notes.reference })).content).toBe(content);
  await startProjection(command);
  await endProjection(command);
  expect(parseStampedFile(await readFile(join(h.f.root, ".arc/active/current/notes-beta.md"), "utf8")).content).toBe(content);
});

it("removes an obsolete file again after an interrupted removal's sweep links it back", async () => {
  const h = await fixture();
  const renamed = RecordReferenceSchema.parse({ ...h.primary.reference, owner: { ...h.primary.reference.owner, name: "beta" } });
  success(await h.f.store.write({ ...update(h.f, h.primary, h.primary.content.replaceAll("alpha", "beta")), reference: renamed,
    provenance: fixtureRenameProvenance }));
  const current = success(await h.f.store.read({ reference: renamed }));
  await writeWorktreeMarker(h.f.root, { spawnedByArc: false, createdFor: boundWorkUnitSubject(current), spawningIdentity: "andrew",
    createdAt: new Date(0).toISOString() });
  const native = createProjectionEnginePorts(h.f.root);
  await expect(startProjection({ ...h.command, ports: () => ({ ...native,
    writer: async () => ({ ...await native.writer(), processInstance: "interrupted-obsolete-removal" }),
    hooks: { afterMove: async path => { if (path === h.path) throw new Error("Interrupted obsolete removal"); } },
  }) })).rejects.toThrow("Interrupted obsolete removal");
  await expect(readFile(join(h.f.root, h.path), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  const interrupted = await readProjectionIndex(h.projected.location, true);
  if (interrupted.kind !== "index") throw new Error("Missing interrupted index");
  const entry = interrupted.index.entries[h.path];
  if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("Missing interrupted copy");
  const copy = entry.copies[0].name;
  expect(parseStampedFile(await readFile(join(h.f.root, copy), "utf8")).content).toBe(h.notes.content);
  await startProjection(h.command);
  await endProjection(h.command);
  await expect(readFile(join(h.f.root, h.path), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  expect(parseStampedFile(await readFile(join(h.f.root, ".arc/active/current/notes-beta.md"), "utf8")).content).toBe(h.notes.content);
  await expect(readFile(join(h.f.root, copy), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
});
