/** Unavailable retained input holds one edit while independent native writes and repaired retries remain possible. */
import { afterEach, expect, it, vi } from "vitest";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { createAdoptionFixture } from "../helpers/store/projection/adoption-fixture.js";
import { configureEngineCheckout } from "../helpers/store/projection/engine-fixture.js";
import { seedProjection } from "../helpers/store/projection/seeded-projection.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";
import { capturedEntries } from "../helpers/store/ref-fixture-plant.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { createKindRegistry } from "../../src/lib/store/registry.js";
import { PRODUCTION_REGISTRATIONS } from "../../src/lib/store/kinds/registrations.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { expandStoredPath } from "../../src/lib/store/stored-path.js";
import { endProjection, startProjection } from "../../src/lib/store/projection/engine.js";
import { beginProjectionCommand, projectionProcessState } from "../../src/lib/store/projection/process-state.js";
import { readProjectionIndex } from "../../src/lib/store/projection/index-file.js";
import { gitBlobId } from "../../src/lib/store/projection/blob-id.js";
import { renderStampedFile } from "../../src/lib/store/projection/stamp.js";
import { TAKEN_IN_FOLDER } from "../../src/lib/store/projection/taken-in.js";

afterEach(() => { beginProjectionCommand(); });
const person = OwnerIdentitySchema.parse({ type: "person", name: "andrew" });

it("holds a missing retained Markdown base, continues another edit, and resumes the held save after repair", async () => {
  const f = await createRefFixture(createKindRegistry(PRODUCTION_REGISTRATIONS));
  f.identity("andrew");
  await configureEngineCheckout(f.root);
  const original = await seed(f, recordReferences["personal/document"](person, "a-held.md"), "opening\nbase\nclosing\n");
  const healthy = await seed(f, recordReferences["personal/document"](person, "z-healthy.md"), "healthy base\n");
  const path = ".arc/user/andrew/a-held.md", other = ".arc/user/andrew/z-healthy.md";
  const projected = await seedProjection({ store: f.store, checkout: f.root, files: [
    { reference: original.reference, path }, { reference: healthy.reference, path: other },
  ] });
  success(await f.store.write(update(f, original, "opening\nbase\nclosing\nremote addition\n")));
  const save = (content: string) => writeFile(join(f.root, path), renderStampedFile({ content, stamp: gitBlobId(original.content, "sha1") }));
  await save("opening\nfirst edit\nclosing\n");
  await startProjection({ store: f.store, checkout: f.root });
  await endProjection({ store: f.store, checkout: f.root });
  const landed = await readProjectionIndex(projected.location, true);
  if (landed.kind !== "index") throw new Error("Missing merged landing");
  const entry = landed.index.entries[path];
  if (entry?.kind !== "record" || entry.persisted?.takenIn.kind !== "copy") throw new Error("Merged input was not retained");
  const payload = join(projected.location.stateDir, TAKEN_IN_FOLDER, entry.persisted.takenIn.name);
  await rename(payload, join(projected.location.stateDir, "retained-input-saved"));
  await save("opening\nsecond edit\nclosing\n");
  const bytes = await readFile(join(f.root, path), "utf8");
  await writeFile(join(f.root, other), renderStampedFile({ content: "healthy edit\n", stamp: gitBlobId(healthy.content, "sha1") }));
  await startProjection({ store: f.store, checkout: f.root });
  await endProjection({ store: f.store, checkout: f.root });
  expect(success(await f.store.read({ reference: healthy.reference })).content).toBe("healthy edit\n");
  expect(success(await f.store.read({ reference: original.reference })).content).toBe("opening\nfirst edit\nclosing\nremote addition\n");
  expect(await readFile(join(f.root, path), "utf8")).toBe(bytes);
  const held = await readProjectionIndex(projected.location, true);
  if (held.kind !== "index") throw new Error("Missing held index");
  expect(held.index.entries[path]).toMatchObject({ pending: true, persisted: entry.persisted });
  expect(projectionProcessState().diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ path, mark: expect.objectContaining({ remedy: { text: expect.stringContaining("Restore") } }) }),
  ]));
  await rename(join(projected.location.stateDir, "retained-input-saved"), payload);
  await startProjection({ store: f.store, checkout: f.root });
  expect(success(await f.store.read({ reference: original.reference })).content).toBe("opening\nsecond edit\nclosing\nremote addition\n");
  expect(projectionProcessState().roots.get(f.root)?.unsent.has(path)).toBe(false);
});

it("holds an accepted adoption's missing input without resending and completes recording after restoration", async () => {
  const { f, registry, primary, folder, projected: initial } = await createAdoptionFixture();
  const other = ".arc/user/andrew/healthy.md";
  const healthy = await seed(f, recordReferences["personal/document"](person, "healthy.md"), "Healthy base\n");
  const metaPath = Object.keys(initial.index.entries)[0];
  if (metaPath === undefined) throw new Error("Missing initial primary projection");
  await unlink(join(f.root, metaPath));
  const projected = await seedProjection({ store: f.store, checkout: f.root, files: [
    { reference: primary.reference, path: metaPath }, { reference: healthy.reference, path: other },
  ] });
  const reference = recordReferences["work-item/companion"](primary.reference.owner, "research");
  const original = await seed(f, reference, "Original prose\n");
  const path = `${folder}/research-alpha.md`, content = "Authored correction\n";
  const bytes = renderStampedFile({ content, stamp: gitBlobId(original.content, "sha1") });
  await writeFile(join(f.root, path), bytes);
  const home = expandStoredPath(primary.reference, { registry });
  let repair: (() => Promise<void>) | undefined;
  const write = f.store.write.bind(f.store);
  vi.spyOn(f.store, "write").mockImplementationOnce(async input => {
    const result = await write(input);
    if (result.status !== "ok") throw new Error("Expected accepted existing adoption");
    const entries = await capturedEntries(f, home.ref);
    const parent = new TextDecoder().decode((await f.ports.rawExec(["rev-parse", home.ref], { objectAccess: "local-only" })).stdout).trim();
    const damaged = await plantRef(f.root, home.ref, entries.map(entry => entry.path === home.metadataPath
      ? { path: entry.path, content: "broken metadata" } : entry), { parents: [parent], gitDir: f.gitDir });
    repair = async () => { await plantRef(f.root, home.ref, entries, { parents: [damaged.tip], gitDir: f.gitDir }); };
    return result;
  });
  await startProjection({ store: f.store, checkout: f.root });
  await endProjection({ store: f.store, checkout: f.root });
  if (repair === undefined) throw new Error("Accepted adoption was not interrupted");
  const interrupted = await readProjectionIndex(projected.location, true);
  if (interrupted.kind !== "index") throw new Error("Missing accepted index");
  const entry = interrupted.index.entries[path];
  if (entry?.kind !== "record" || entry.adoption?.kind !== "read-back" || !entry.persisted?.recording
    || entry.persisted?.takenIn.kind !== "copy") throw new Error("Missing accepted input recording");
  await repair();
  const accepted = success(await f.store.read({ reference }));
  const payload = join(projected.location.stateDir, TAKEN_IN_FOLDER, entry.persisted.takenIn.name);
  await rename(payload, join(projected.location.stateDir, "retained-input-saved"));
  await writeFile(join(f.root, other), renderStampedFile({ content: "Independent edit\n", stamp: gitBlobId(healthy.content, "sha1") }));
  await startProjection({ store: f.store, checkout: f.root });
  await endProjection({ store: f.store, checkout: f.root });
  expect(success(await f.store.read({ reference: healthy.reference })).content).toBe("Independent edit\n");
  expect(success(await f.store.read({ reference })).version).toBe(accepted.version);
  expect(await readFile(join(f.root, path), "utf8")).toBe(bytes);
  const held = await readProjectionIndex(projected.location, true);
  if (held.kind !== "index") throw new Error("Missing held recording");
  expect(held.index.entries[path]).toMatchObject({ base: entry.base, persisted: entry.persisted, adoption: entry.adoption,
    pending: true, refused: { reason: expect.stringContaining("retained") } });
  expect(projectionProcessState().roots.get(f.root)?.unsent.has(path)).toBe(true);
  await rename(join(projected.location.stateDir, "retained-input-saved"), payload);
  const beforeRetry = success(await f.store.version());
  await startProjection({ store: f.store, checkout: f.root });
  expect(success(await f.store.version())).toBe(beforeRetry);
  const settled = await readProjectionIndex(projected.location, true);
  if (settled.kind !== "index") throw new Error("Missing completed recording");
  expect(settled.index.entries[path]).toMatchObject({ pending: false, refused: null });
  expect(settled.index.entries[path]).not.toHaveProperty("adoption");
  expect(success(await f.store.read({ reference })).content).toBe(content);
});
