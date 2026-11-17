/** Interrupted swaps and late editor saves driven through command start and end. */
import { access, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { readStatSync } from "../../../../src/lib/store/projection/change-detection.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { createProjectionEnginePorts } from "../../../../src/lib/store/projection/engine-ports.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { createEngineFixture, configureEngineCheckout, initializeEngineCheckout } from "../../../helpers/store/projection/engine-fixture.js";
import { createCheckoutFixture } from "../../../helpers/store/projection/checkout-fixture.js";
import { createMarkerFixture } from "../../../helpers/store/projection/marker-fixture.js";
import { prepareSwap } from "../../../helpers/store/projection/swap-fixture.js";
import { createEditorHandles } from "../../../helpers/store/projection/editor-handles.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { RecordReferenceSchema } from "../../../../src/lib/store/identity.js";
import type { ProjectionLocation } from "../../../../src/lib/store/projection/location.js";

const directories: string[] = [];
const editors = createEditorHandles();
afterEach(async () => { await editors.closeAll(); await removeGitBackedDirs(directories.splice(0)); });
class Stop extends Error {}

function commandPorts(checkout: string, instance: string) {
  const native = createProjectionEnginePorts(checkout);
  return { ...native, writer: async () => ({ ...await native.writer(), processInstance: instance }) };
}
async function indexAt(location: ProjectionLocation) {
  const read = await readProjectionIndex(location, true, { groups: "all" });
  if (read.kind !== "index") throw new Error("unusable fixture index");
  return read.index;
}

describe("editor races across command boundaries", () => {
  it.each(["swept", "left"])("discards early stats after the sweep has a %s copy", async outcome => {
    const extraPath = ".arc/user/andrew/scratch/other.md";
    const h = await createEngineFixture(directories, { kind: "work-item/notes", path: ".arc/active/current/notes-work-item-one.md", extraPaths: [extraPath] });
    const extra = h.extra[0];
    if (extra === undefined) throw new Error("Missing personal companion");
    const extraFull = join(h.checkout, extraPath), old = new Date(Date.now() - 2_000);
    await utimes(extraFull, old, old);
    const input = { store: h.store, checkout: h.checkout };
    expect(await startProjection(input)).toMatchObject({ kind: "ready" }); await endProjection(input);
    await h.edit("A hand edit for interrupted recovery.\n");
    await expect(startProjection({ ...input, ports: () => ({ ...commandPorts(h.checkout, "interrupted-writer"),
      hooks: { afterMove: async path => { if (path === h.path) throw new Stop(); } } }) })).rejects.toBeInstanceOf(Stop);
    await expect(access(join(h.checkout, h.path))).rejects.toMatchObject({ code: "ENOENT" });
    if (outcome === "left") {
      const excludes = join(h.location.commonDir, "info/exclude");
      await writeFile(excludes, (await readFile(excludes, "utf8")).replace(".arc/active/\n", ""));
    }
    const bytes = await readFile(extraFull, "utf8");
    let edited = false;
    const ports = { ...commandPorts(h.checkout, "recovering-writer"), stats: { platform: "linux" as const,
      readSync: (path: string) => {
        const observed = readStatSync(path);
        if (path === extraFull && !edited) { edited = true; writeFileSync(path, bytes.replace("extra base", "edit after observation")); }
        return observed;
      },
    } };
    expect(await startProjection({ ...input, ports: () => ports })).toMatchObject({ kind: "ready" });
    expect(edited).toBe(true);
    expect(success(await h.store.read({ reference: extra.record.reference })).content).toBe("edit after observation\n");
    if (outcome === "swept") expect(await h.file()).toContain("A hand edit for interrupted recovery.");
    else expect(projectionProcessState().diagnostics.some(each => each.path === h.path && each.copy !== null)).toBe(true);
  });

  it("reads a copy the sweep linked back even though the initial walk saw no file", async () => {
    const h = await createEngineFixture(directories);
    await h.edit("hand edit\n");
    await expect(startProjection({ store: h.store, checkout: h.checkout, ports: () => ({
      ...commandPorts(h.checkout, "stopped-writer"), hooks: { afterMove: async () => { throw new Stop(); } },
    }) })).rejects.toBeInstanceOf(Stop);
    await expect(access(join(h.checkout, h.path))).rejects.toMatchObject({ code: "ENOENT" });
    await startProjection({ store: h.store, checkout: h.checkout, ports: () => commandPorts(h.checkout, "next-writer") });
    expect(parseStampedFile(await h.file())).toMatchObject({ content: "hand edit\n", stamp: gitBlobId("hand edit\n", "sha1") });
    await endProjection({ store: h.store, checkout: h.checkout });
    expect((await h.disk()).entries[h.path]).toMatchObject({ copies: [] });
  });

  it("sends a stampless recreated save against the replaced version, retaining an independent stored change", async () => {
    const h = await prepareSwap({ path: ".arc/user/andrew/scratch/one.txt",
      reference: RecordReferenceSchema.parse({ kind: "personal/document", owner: { type: "person", name: "andrew" }, key: "scratch/one.txt" }),
      contents: ["opening\nbase\nclosing\n", "opening\nbase\nclosing\nremote note\n"] });
    directories.push(h.seeded.checkout);
    await configureEngineCheckout(h.seeded.checkout);
    h.fixture.identity("andrew");
    await rm(h.file);
    await h.swap({ hooks: { beforeRebuildLink: async () => { await writeFile(h.file, "opening\nhand edit\nclosing\n"); } } });
    await startProjection({ store: h.fixture.store, checkout: h.seeded.checkout });
    expect(await h.fixture.store.read({ reference: h.reference })).toMatchObject({ status: "ok", result: {
      content: "opening\nhand edit\nclosing\nremote note\n",
    } });
    expect(await readFile(h.file, "utf8")).toBe("opening\nhand edit\nclosing\nremote note\n");
  });

  it("returns a late aside clash at the end and draws it at the next start", async () => {
    const h = await createCheckoutFixture({ path: ".arc/user/andrew/scratch/document.md" });
    directories.push(h.checkout);
    await initializeEngineCheckout(h.checkout);
    const current = h.record.content.replace("first edit", "remote edit");
    await h.store.write({ action: "put", reference: h.entry.reference, expected: h.record.version, content: current,
      provenance: { verb: "edit", lifecycleAction: "edit" } });
    await h.edit("opening\ninitial edit\nclosing\n");
    const editor = await editors.open(join(h.checkout, h.path));
    await startProjection({ store: h.store, checkout: h.checkout, ports: () => commandPorts(h.checkout, "first-command") });
    const late = renderStampedFile({ content: "opening\nlate edit\nclosing\n", stamp: h.initialEntry.base.blob });
    await editor.truncate(0);
    const bytes = Buffer.from(late);
    await editor.write(bytes, 0, bytes.length, 0);
    await editor.close();
    await endProjection({ store: h.store, checkout: h.checkout });
    expect(await h.file()).toBe(late);
    expect((await indexAt(h.location)).entries[h.path]).toMatchObject({ pending: true });
    await startProjection({ store: h.store, checkout: h.checkout, ports: () => commandPorts(h.checkout, "second-command") });
    expect(parseStampedFile(await h.file()).content).toContain("late edit\n>>>>>>>");
    await endProjection({ store: h.store, checkout: h.checkout });
    expect(parseStampedFile(await h.file()).content).toContain("late edit\n>>>>>>>");
  });

  it.each([false, true])("sweeps a failed command's drawing copy, preserving markers and outside deletion %s", async deleted => {
    const h = await createCheckoutFixture({ path: ".arc/user/andrew/scratch/document.md" });
    directories.push(h.checkout);
    await initializeEngineCheckout(h.checkout);
    await h.store.write({ action: "put", reference: h.entry.reference, expected: h.record.version,
      content: h.record.content.replace("first edit", "remote edit"), provenance: { verb: "edit", lifecycleAction: "edit" } });
    await h.edit("opening\ninitial edit\nclosing\n");
    await startProjection({ store: h.store, checkout: h.checkout, ports: () => commandPorts(h.checkout, "failed-command") });
    const before = await h.file();
    expect(before).toContain("<<<<<<<");
    const index = await indexAt(h.location);
    const entry = index.entries[h.path];
    if (entry?.kind !== "record" || entry.copies.length === 0) throw new Error("missing drawing copy");
    if (deleted) await writeFile(join(h.checkout, h.path), before.replace("remote note\n", ""));
    await startProjection({ store: h.store, checkout: h.checkout, ports: () => commandPorts(h.checkout, "next-command") });
    expect(await h.file()).toContain("<<<<<<<");
    if (deleted) expect(await h.file()).not.toContain("remote note");
    for (const copy of entry.copies) await expect(access(join(h.checkout, copy.name))).rejects.toMatchObject({ code: "ENOENT" });
    await endProjection({ store: h.store, checkout: h.checkout });
  });

  it("returns a resolution in progress from an aside copy byte-for-byte and reports its refusal", async () => {
    const h = await createMarkerFixture({ path: ".arc/user/andrew/scratch/document.md" });
    directories.push(h.checkout);
    await initializeEngineCheckout(h.checkout);
    await h.edit(h.content + "independent note\n");
    const editor = await editors.open(join(h.checkout, h.path));
    await startProjection({ store: h.store, checkout: h.checkout });
    const late = renderStampedFile({ content: h.content.replace("stored side", "resolution in progress") + "independent note\n", stamp: h.entry.base.blob });
    await editor.truncate(0);
    const bytes = Buffer.from(late);
    await editor.write(bytes, 0, bytes.length, 0);
    await editor.close();
    await endProjection({ store: h.store, checkout: h.checkout });
    expect(await h.file()).toBe(late);
    expect((await indexAt(h.location)).entries[h.path]).toMatchObject({ pending: true, refused: expect.any(Object) });
    expect(projectionProcessState().diagnostics.some(diagnostic => diagnostic.mark.reason.includes("resolution"))).toBe(true);
  });
});
