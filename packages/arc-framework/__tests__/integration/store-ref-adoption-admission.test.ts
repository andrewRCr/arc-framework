/** New companion admission preserves authored files and repairs through the command's outer boundary. */
import { afterEach, expect, it, vi } from "vitest";
import { mkdir, readFile, rename, utimes, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { success } from "../helpers/store/suite-tools.js";
import { createAdoptionFixture } from "../helpers/store/projection/adoption-fixture.js";
import { recordReferences } from "../../src/lib/store/index.js";
import { startProjection } from "../../src/lib/store/projection/engine.js";
import { beginProjectionCommand, projectionProcessState } from "../../src/lib/store/projection/process-state.js";
import { readProjectionIndex } from "../../src/lib/store/projection/index-file.js";
import { parseStampedFile } from "../../src/lib/store/projection/stamp.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import type { WriteResult } from "../../src/lib/store/write.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import { entry } from "../helpers/inbox-harness.js";
import { gitBlobId } from "../../src/lib/store/projection/blob-id.js";

afterEach(() => { beginProjectionCommand(); });

it("adopts an empty settled Markdown companion and installs its stamp", async () => {
  const { f, primary, folder, projected } = await createAdoptionFixture();
  const path = `${folder}/empty.md`, absolute = join(f.root, path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, "");
  const settled = new Date(Date.now() - 1_000);
  await utimes(absolute, settled, settled);
  await startProjection({ store: f.store, checkout: f.root });
  const reference = recordReferences["work-item/companion"](primary.reference.owner, "empty.md");
  expect(await f.store.read({ reference })).toMatchObject({ status: "ok", result: { reference, content: "" } });
  const disk = await readProjectionIndex(projected.location, true);
  if (disk.kind !== "index") throw new Error("Missing projection index");
  expect(disk.index.entries[path]).toMatchObject({ kind: "record", reference, pending: false, refused: null });
  expect(parseStampedFile(await readFile(absolute, "utf8"))).toMatchObject({ content: "", stamp: expect.any(String) });
});

it.each(["companion", "inbound"])("retains an accepted %s's exact basis when read-back refuses and installs it after repair without resending", async kind => {
  const { f, registry, primary, folder, projected } = await createAdoptionFixture();
  const path = `${folder}/${kind === "companion" ? "note.md" : "inbound-alpha.md"}`;
  const prose = "Authored prose survives read-back failure";
  const content = kind === "companion" ? `${prose}\n` : `## Inbound\n\n${entry("12345678", "Concern", prose).replace(/^- _Id:_.*\n/mu, "")}\n`;
  const reference = kind === "companion" ? recordReferences["work-item/companion"](primary.reference.owner, "note.md")
    : recordReferences["work-item/inbound"](primary.reference.owner);
  await writeFile(join(f.root, path), content);
  const home = expandStoredPath(primary.reference, { registry });
  let accepted: WriteResult | undefined, repair: (() => Promise<void>) | undefined;
  const write = f.store.write.bind(f.store);
  vi.spyOn(f.store, "write").mockImplementationOnce(async input => {
    const result = await write(input);
    if (result.status !== "ok") throw new Error("Expected adoption to persist before namespace damage");
    accepted = result.result;
    const entries = await capturedEntries(f, home.ref);
    const parent = new TextDecoder().decode((await f.ports.rawExec([...f.gitDir ? [`--git-dir=${f.gitDir}`] : [], "rev-parse", home.ref],
      { objectAccess: "local-only" })).stdout).trim();
    const damaged = await plantRef(f.root, home.ref, entries.map(entry => entry.path === home.metadataPath
      ? { path: entry.path, content: "broken metadata" } : entry), { parents: [parent], gitDir: f.gitDir });
    repair = async () => { await plantRef(f.root, home.ref, entries, { parents: [damaged.tip], gitDir: f.gitDir }); };
    return result;
  });
  await startProjection({ store: f.store, checkout: f.root });
  if (accepted === undefined || repair === undefined) throw new Error("The fixture did not reach the accepted-write boundary");
  expect(accepted.reference).toEqual(reference);
  const held = await readProjectionIndex(projected.location, true);
  if (held.kind !== "index") throw new Error("Missing held index");
  expect(held.index.entries[path]).toMatchObject({ kind: "record", reference: accepted.reference, pending: true,
    base: { version: accepted.version }, refused: { reason: expect.stringContaining("read-back failed") } });
  expect(await readFile(join(f.root, path), "utf8")).toBe(content);
  await repair();
  const stored = success(await f.store.read({ reference }));
  expect(held.index.entries[path]).toMatchObject({ base: { blob: gitBlobId(stored.content, "sha1"), version: stored.version } });
  const beforeRetry = success(await f.store.version());
  await startProjection({ store: f.store, checkout: f.root });
  expect(success(await f.store.version())).toBe(beforeRetry);
  expect(success(await f.store.read({ reference })).content).toBe(stored.content);
  expect(stored.content).toContain(prose);
  const settled = await readProjectionIndex(projected.location, true);
  if (settled.kind !== "index") throw new Error("Missing settled index");
  expect(settled.index.entries[path]).toMatchObject({ kind: "record", reference: accepted.reference, pending: false, refused: null });
  expect(settled.index.entries[path]).not.toHaveProperty("adoption");
  expect(parseStampedFile(await readFile(join(f.root, path), "utf8"))).toMatchObject({ content: stored.content, stamp: expect.any(String) });
});

it.each(["metadata", "review"])("preserves the backend's %s path refusal and adopts the same bytes after moving out of the reserved path", async reserved => {
  const { f, primary, folder, projected } = await createAdoptionFixture();
  const owner = primary.reference.owner;
  if (owner.type !== "work-item" || owner.uid === undefined) throw new Error("Expected an allocated work-item owner");
  const key = reserved === "metadata" ? `metadata-${owner.uid}.json` : "review/notes.md";
  const reference = recordReferences["work-item/companion"](owner, key), content = "Authored bytes must survive reserved-path refusal\n";
  const denied = await f.store.write({ action: "put", reference, content, expected: null,
    provenance: { verb: "write-back", lifecycleAction: "edit" } });
  expect(denied.status).toBe("refused");
  if (denied.status !== "refused") throw new Error("The fixture did not reach native path admission");
  const path = `${folder}/${key}`;
  await mkdir(dirname(join(f.root, path)), { recursive: true });
  await writeFile(join(f.root, path), content);
  const before = success(await f.store.version());
  await startProjection({ store: f.store, checkout: f.root });
  const held = await readProjectionIndex(projected.location, true);
  if (held.kind !== "index") throw new Error("Missing refused index");
  expect(held.index.entries[path]).toMatchObject({ kind: "ownerless", refused: { remedy: denied.refusal.remedy } });
  expect(held.index.entries[path]?.refused?.reason).toContain(denied.refusal.condition);
  expect(await readFile(join(f.root, path), "utf8")).toBe(content);
  expect(success(await f.store.version())).toBe(before);
  const repairedKey = `scratch/${key}`, repairedPath = `${folder}/${repairedKey}`;
  await mkdir(dirname(join(f.root, repairedPath)), { recursive: true });
  await rename(join(f.root, path), join(f.root, repairedPath));
  await startProjection({ store: f.store, checkout: f.root });
  const repaired = recordReferences["work-item/companion"](owner, repairedKey);
  expect(success(await f.store.read({ reference: repaired })).content).toBe(content);
  const disk = await readProjectionIndex(projected.location, true);
  if (disk.kind !== "index") throw new Error("Missing repaired index");
  expect(disk.index.entries[path]).toBeUndefined();
  expect(disk.index.entries[repairedPath]).toMatchObject({ kind: "record", reference: repaired, pending: false, refused: null });
  expect(parseStampedFile(await readFile(join(f.root, repairedPath), "utf8")).content).toBe(content);
});

it("adopts a new inbound list with stored entry identities and lays the same stored content", async () => {
  const { f, primary, folder, projected } = await createAdoptionFixture();
  const path = `${folder}/inbound-alpha.md`;
  const content = `## Inbound\n\n${entry("12345678", "New concern", "Authored prose").replace(/^- _Id:_.*\n/mu, "")}\n`;
  expect(content).not.toContain("_Id:_");
  await writeFile(join(f.root, path), content);
  await startProjection({ store: f.store, checkout: f.root });
  const reference = recordReferences["work-item/inbound"](primary.reference.owner), record = success(await f.store.read({ reference }));
  expect(record.content).toMatch(/- _Id:_ `[0-9a-f]{8}`/u);
  expect(record.content).toContain("Authored prose");
  expect(parseStampedFile(await readFile(join(f.root, path), "utf8")).content).toBe(record.content);
  const disk = await readProjectionIndex(projected.location, true);
  if (disk.kind !== "index") throw new Error("Missing inbound adoption index");
  expect(disk.index.entries[path]).toMatchObject({ kind: "record", reference, pending: false, refused: null });
});

it("keeps another person's Planning inbound list unadopted and accepts the same bytes under its owner", async () => {
  const { f, primary, folder, projected } = await createAdoptionFixture({ owner: "bob" });
  const path = `${folder}/inbound-alpha.md`, absolute = join(f.root, path);
  const content = `## Inbound\n\n${entry("12345678", "New concern", "Preserved authored prose").replace(/^- _Id:_.*\n/mu, "")}\n`;
  await writeFile(absolute, content);
  const reference = recordReferences["work-item/inbound"](primary.reference.owner);
  const before = success(await f.store.version());
  await startProjection({ store: f.store, checkout: f.root });
  expect(success(await f.store.version())).toBe(before);
  expect(await readFile(absolute, "utf8")).toBe(content);
  const held = await readProjectionIndex(projected.location, true);
  if (held.kind !== "index") throw new Error("Missing refused index");
  expect(held.index.entries[path]).toMatchObject({ kind: "ownerless", refused: {
    reason: expect.stringContaining("bob"), remedy: { text: expect.stringContaining("bob") },
  } });
  expect(projectionProcessState().diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ path, mark: expect.objectContaining({ reason: expect.stringContaining("bob") }) }),
  ]));
  await createExecaGitExec()("git", ["config", "arc.identity", "bob"], { cwd: f.root });
  f.identity("bob");
  await startProjection({ store: f.store, checkout: f.root });
  const record = success(await f.store.read({ reference }));
  expect(record.content).toContain("Preserved authored prose");
  expect(parseStampedFile(await readFile(absolute, "utf8")).content).toBe(record.content);
  const repaired = await readProjectionIndex(projected.location, true);
  if (repaired.kind !== "index") throw new Error("Missing repaired index");
  expect(repaired.index.entries[path]).toMatchObject({ kind: "record", reference, pending: false, refused: null });
});
