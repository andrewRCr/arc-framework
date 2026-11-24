/** Accepted adoption stays pending while an editor keeps saving through guarded read-back. */
import { afterEach, expect, it } from "vitest";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createAdoptionFixture } from "../helpers/store/projection/adoption-fixture.js";
import { overrideEngineStore } from "../helpers/store/projection/engine-fixture.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";
import { recordReferences } from "../../src/lib/store/identity.js";
import { createProjectionEnginePorts } from "../../src/lib/store/projection/engine-ports.js";
import { endProjection, startProjection } from "../../src/lib/store/projection/engine.js";
import { beginProjectionCommand, projectionProcessState } from "../../src/lib/store/projection/process-state.js";
import { gitBlobId } from "../../src/lib/store/projection/blob-id.js";
import { renderStampedFile, parseStampedFile } from "../../src/lib/store/projection/stamp.js";
import { commitProjectionIndex, readProjectionIndex } from "../../src/lib/store/projection/index-file.js";
import type { SwapHooks } from "../../src/lib/store/projection/swap.js";

afterEach(() => { beginProjectionCommand(); });

it("retains an accepted creation and its latest unsent bytes, then completes read-back after saving stops", async () => {
  const { f, primary, folder, projected } = await createAdoptionFixture();
  const path = `${folder}/note.md`, absolute = join(f.root, path);
  let revision = 1, saving = true;
  await writeFile(absolute, `edit ${revision}\n`);
  const reference = recordReferences["work-item/companion"](primary.reference.owner, "note.md");
  const store = overrideEngineStore(f.store, { batch: async input => {
    const result = await f.store.batch(input);
    const mutation = input.writes[0];
    if (saving && result.status === "ok" && mutation?.action === "put") await writeFile(absolute, renderStampedFile({
      content: `edit ${++revision}\n`, stamp: gitBlobId(mutation.content, "sha1"),
    }));
    return result;
  } });
  await startProjection({ store, checkout: f.root });
  expect(success(await f.store.read({ reference })).content).toBe("edit 4\n");
  expect(parseStampedFile(await readFile(absolute, "utf8")).content).toBe("edit 5\n");
  const held = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (held.kind !== "index") throw new Error("Missing pending index");
  expect(held.index.entries[path]).toMatchObject({ kind: "record", reference, pending: true, adoption: { kind: "read-back" } });
  expect(projectionProcessState().roots.get(f.root)?.unsent.has(path)).toBe(true);
  expect(projectionProcessState().diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ path, mark: expect.objectContaining({ reason: expect.stringContaining("unsettled") }) }),
  ]));
  saving = false;
  await startProjection({ store, checkout: f.root });
  expect(success(await f.store.read({ reference })).content).toBe("edit 5\n");
  expect(parseStampedFile(await readFile(absolute, "utf8")).content).toBe("edit 5\n");
  const repaired = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (repaired.kind !== "index") throw new Error("Missing repaired index");
  expect(repaired.index.entries[path]).toMatchObject({ kind: "record", reference, pending: false });
  expect(repaired.index.entries[path]).not.toHaveProperty("adoption");
  expect(projectionProcessState().roots.get(f.root)?.unsent.has(path)).toBe(false);
});

it("retains a newer save that wins an accepted creation's swap and reports it until the next command", async () => {
  const { f, primary, folder, projected } = await createAdoptionFixture();
  const path = `${folder}/swap-note.md`, absolute = join(f.root, path);
  const accepted = "accepted creation\n", latest = "new save wins\n";
  await writeFile(absolute, accepted);
  const reference = recordReferences["work-item/companion"](primary.reference.owner, "swap-note.md");
  let recreate = true;
  const native = createProjectionEnginePorts(f.root);
  const input = { store: f.store, checkout: f.root, ports: () => ({ ...native, hooks: { afterMove: async (swapped: string) => {
    if (recreate && swapped === path) await writeFile(absolute, renderStampedFile({ content: latest, stamp: gitBlobId(accepted, "sha1") }));
  } } }) };
  await startProjection(input);
  expect(success(await f.store.read({ reference })).content).toBe(accepted);
  expect(parseStampedFile(await readFile(absolute, "utf8")).content).toBe(latest);
  const held = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (held.kind !== "index") throw new Error("Missing pending index");
  expect(held.index.entries[path]).toMatchObject({ kind: "record", reference, pending: true, adoption: { kind: "read-back" } });
  expect(projectionProcessState().roots.get(f.root)?.unsent.has(path)).toBe(true);
  expect(projectionProcessState().diagnostics).toEqual(expect.arrayContaining([
    expect.objectContaining({ path, mark: expect.objectContaining({ reason: expect.stringContaining("pending"),
      remedy: { text: expect.stringContaining("next command") } }) }),
  ]));
  recreate = false;
  await startProjection(input);
  expect(success(await f.store.read({ reference })).content).toBe(latest);
  const settled = await readProjectionIndex(projected.location, true, { groups: "all" });
  if (settled.kind !== "index") throw new Error("Missing settled index");
  expect(settled.index.entries[path]).toMatchObject({ pending: false });
  expect(settled.index.entries[path]).not.toHaveProperty("adoption");
  expect(projectionProcessState().roots.get(f.root)?.unsent.has(path)).toBe(false);
});

/** Stop an accepted adoption's installation of a teammate's later version, as a command that exits there would leave it. */
async function stoppedInstallation(name: string, stop: keyof SwapHooks, input: { existing?: string; settled?: boolean } = {}) {
  const { f, primary, folder, projected } = await createAdoptionFixture();
  const path = `${folder}/${name}`, absolute = join(f.root, path), original = "one\ntwo\nthree\n", teammate = "one\nTEAMMATE\nthree\n";
  const reference = recordReferences["work-item/companion"](primary.reference.owner, name);
  if (input.existing !== undefined) await seed(f, reference, input.existing);
  await writeFile(absolute, original);
  let accepting = true;
  const store = overrideEngineStore(f.store, { batch: async batch => {
    const result = await f.store.batch(batch);
    if (accepting) { accepting = false; success(await f.store.write(update(f, success(await f.store.read({ reference })), teammate))); }
    return result;
  } });
  const native = createProjectionEnginePorts(f.root);
  const ports = () => ({ ...native, writer: async () => ({ ...await native.writer(), processInstance: "exited-writer" }),
    hooks: { [stop]: async () => { throw new Error("Stopped mid-installation"); } } });
  await expect(startProjection({ store, checkout: f.root, ports })).rejects.toThrow("Stopped mid-installation");
  beginProjectionCommand();
  const entryOnDisk = async () => {
    const disk = await readProjectionIndex(projected.location, true, { groups: "all" });
    const entry = disk.kind === "index" ? disk.index.entries[path] : undefined;
    if (disk.kind !== "index" || entry?.kind !== "record") throw new Error("Missing adopted entry");
    return { index: disk.index, entry };
  };
  const stopped = await entryOnDisk();
  expect(stopped.entry).toMatchObject({ pending: true, adoption: { kind: "read-back" }, base: { blob: gitBlobId(teammate, "sha1") } });
  if (input.settled) await commitProjectionIndex({ location: projected.location, checkout: f.root,
    index: { ...stopped.index, entries: { ...stopped.index.entries, [path]: { ...stopped.entry, pending: false } } } });
  return { f, path, absolute, original, teammate, reference, entryOnDisk, next: async () => {
    await startProjection({ store: f.store, checkout: f.root });
    const diagnostics = projectionProcessState().diagnostics.filter(each => each.path === path).map(each => each.mark.reason);
    await endProjection({ store: f.store, checkout: f.root });
    return { diagnostics, file: await readFile(absolute, "utf8"), stored: success(await f.store.read({ reference })).content };
  } };
}

async function restore(absolute: string, content: string, how: "in place" | "by rename"): Promise<void> {
  if (how === "in place") return writeFile(absolute, content);
  await writeFile(`${absolute}.restored`, content);
  await rename(`${absolute}.restored`, absolute);
}

it.each([
  { how: "in place", settled: false }, { how: "by rename", settled: false }, { how: "in place", settled: true }, { how: "by rename", settled: true },
] as const)("holds an original restored $how over a teammate's installed version as an edit (settled: $settled)", async ({ how, settled }) => {
  const h = await stoppedInstallation("restored.txt", "afterFirstCheck", { settled });
  expect(await readFile(h.absolute, "utf8")).toBe(h.teammate);
  await restore(h.absolute, h.original, how);
  const held = await h.next();
  expect(held.stored).toBe(h.teammate);
  expect(held.diagnostics).toContain("bases-disagree");
  expect(held.file).toContain("TEAMMATE");
  expect(held.file).toMatch(/^two$/mu);
  expect((await h.entryOnDisk()).entry).not.toHaveProperty("adoption");
});

it("holds a restored file whose accepted edit joined an established record", async () => {
  const h = await stoppedInstallation("established.txt", "afterFirstCheck", { existing: "one\nfirst\nthree\n" });
  await restore(h.absolute, h.original, "by rename");
  const held = await h.next();
  expect(held.stored).toBe(h.teammate);
  expect(held.file).toContain("TEAMMATE");
  expect(held.file).toMatch(/^two$/mu);
});

it.each(["afterRecheck", "afterMove"] as const)("installs over an original a stop left in place or aside (%s)", async stop => {
  const h = await stoppedInstallation("untouched.txt", stop);
  expect(await h.next()).toEqual({ diagnostics: [], file: h.teammate, stored: h.teammate });
  const { entry } = await h.entryOnDisk();
  expect(entry).toMatchObject({ pending: false, refused: null, copies: [], inProgress: null });
  expect(entry).not.toHaveProperty("adoption");
});

it.each([false, true])("settles an untouched installation (settled: %s)", async settled => {
  const h = await stoppedInstallation("installed.txt", "afterFirstCheck", { settled });
  expect(await h.next()).toEqual({ diagnostics: [], file: h.teammate, stored: h.teammate });
  const { entry } = await h.entryOnDisk();
  expect(entry).toMatchObject({ pending: false, refused: null, copies: [], inProgress: null });
  expect(entry).not.toHaveProperty("adoption");
});

it("holds a further edit of an installed teammate's version until its base is settled", async () => {
  const h = await stoppedInstallation("edited.txt", "afterFirstCheck");
  await writeFile(h.absolute, h.teammate.replace("three", "PERSON"));
  const taken = await h.next();
  expect(taken.file).toContain("PERSON");
  expect(taken.stored.includes("PERSON") || taken.diagnostics.includes("bases-disagree")).toBe(true);
  expect(taken.file).toContain("TEAMMATE");
});

it("refreshes a Markdown original restored over a teammate's installed version", async () => {
  const h = await stoppedInstallation("restored.md", "afterFirstCheck");
  await restore(h.absolute, h.original, "by rename");
  const refreshed = await h.next();
  expect(refreshed).toMatchObject({ diagnostics: [], stored: h.teammate });
  expect(parseStampedFile(refreshed.file).content).toBe(h.teammate);
});
