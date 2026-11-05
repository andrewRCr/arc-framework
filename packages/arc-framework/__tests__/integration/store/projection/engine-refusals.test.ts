/** Store refusals preserve projected edits and retain a working retry after repair. */
import { afterEach, describe, expect, it } from "vitest";
import { RecordVersionSchema } from "../../../../src/lib/store/identity.js";
import type { StoreRefusal } from "../../../../src/lib/store/refusal.js";
import { startProjection, endProjection } from "../../../../src/lib/store/projection/engine.js";
import { writeProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { createWriteBackPort } from "../../../../src/lib/store/projection/write-back.js";
import { projectionProcessState } from "../../../../src/lib/store/projection/process-state.js";
import { createEngineFixture, overrideEngineStore } from "../../../helpers/store/projection/engine-fixture.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { success, update } from "../../../helpers/store/suite-tools.js";
import { createEditorHandles } from "../../../helpers/store/projection/editor-handles.js";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";

const directories: string[] = [];
const editors = createEditorHandles();
afterEach(async () => { await editors.closeAll(); await removeGitBackedDirs(directories.splice(0)); });

describe("projection store refusals", () => {
  it("reports a real stale-merge parser refusal with its rule and lands the repaired edit", async () => {
    const h = await createEngineFixture(directories, { registryOverrides: { "personal/document": {
      parser: content => content.includes("current opening") && content.includes("incoming closing")
        ? { success: false, error: "Combined edit is invalid." } : { success: true, data: { content } },
    } } });
    success(await h.store.write(update(h, h.record, "current opening\nbase\nclosing\n")));
    await h.edit("opening\nbase\nincoming closing\n");
    const bytes = await h.file();
    const state = await h.settle();
    await startProjection({ store: h.store, checkout: h.checkout });
    expect(await h.settle()).toBe(state);
    expect(await h.file()).toBe(bytes);
    expect((await h.disk()).entries[h.path]).toMatchObject({ refused: { reason: expect.stringContaining("Combined edit is invalid.") } });
    expect(projectionProcessState().diagnostics).toMatchObject([{ path: h.path, mark: {
      reason: expect.stringContaining("Combined edit is invalid."), remedy: { text: expect.any(String) },
    } }]);
    await h.edit("opening\nbase\nrepaired closing\n");
    await startProjection({ store: h.store, checkout: h.checkout });
    expect((await h.stored()).content).toBe("current opening\nbase\nrepaired closing\n");
  });

  it("recovers a projected version outside the record's history and lands the saved edit", async () => {
    const h = await createEngineFixture(directories);
    await writeProjectionIndex(h.location, { ...h.index, entries: { ...h.index.entries,
      [h.path]: { ...h.entry, base: { ...h.entry.base, version: RecordVersionSchema.parse("outside-history") } } } });
    await h.edit("opening\nhand edit\nclosing\n");
    await startProjection({ store: h.store, checkout: h.checkout });
    expect((await h.stored()).content).toBe("opening\nhand edit\nclosing\n");
    expect((await h.disk()).entries[h.path]).toMatchObject({ pending: false, refused: null });
  });

  it.each(["md", "txt"])("recovers an invalid carried version when the observed %s save exactly matches the indexed blob", async extension => {
    const h = await createEngineFixture(directories, { path: `.arc/user/andrew/document.${extension}` });
    const entry = { ...h.entry, base: { ...h.entry.base, version: RecordVersionSchema.parse("outside-history") } };
    const takeIn = createWriteBackPort({ store: h.store, location: h.location, format: "sha1", actor: "test-user@fixture" });
    const result = await takeIn({ checkout: h.checkout, path: h.path, copy: null, entry, observedEdit: true,
      base: extension === "md" ? { kind: "stamp", stamp: entry.base.blob } : { kind: "blob", blob: entry.base.blob } });
    expect(result).toMatchObject({ answer: "taken-in", entry: { refused: null,
      persisted: { stamp: h.entry.base.blob, takenIn: { version: (await h.stored()).version } } } });
    expect((await h.stored()).content).toBe(h.record.content);
  });

  it("leaves a locked record pending with the backend remedy and lands it after release", async () => {
    const h = await createEngineFixture(directories);
    await h.edit("opening\nhand edit\nclosing\n");
    const bytes = await h.file();
    await h.hold(h.record.reference, true);
    await startProjection({ store: h.store, checkout: h.checkout });
    expect((await h.stored()).content).toBe(h.record.content);
    expect(await h.file()).toBe(bytes);
    expect((await h.disk()).entries[h.path]).toMatchObject({ pending: true, refused: null });
    expect(projectionProcessState().diagnostics).toMatchObject([{ path: h.path, mark: { remedy: { text: expect.any(String) } } }]);
    await h.hold(h.record.reference, false);
    await startProjection({ store: h.store, checkout: h.checkout });
    expect((await h.stored()).content).toBe("opening\nhand edit\nclosing\n");
  });

  it("shares one recovery allowance across repeated take-ins and retries next command", async () => {
    const h = await createEngineFixture(directories);
    await h.edit("opening\nhand edit\nclosing\n");
    const bytes = await h.file();
    const refusal: StoreRefusal = { code: "version-conflict", class: "recoverable", records: [h.record.reference],
      condition: "The expected version is outside readable history.", remedy: { text: "Recover the base and retry." } };
    let rejected = 3;
    const store = overrideEngineStore(h.store, { write: input => rejected-- > 0
      ? Promise.resolve({ status: "refused", refusal }) : h.store.write(input) });
    const takeIn = createWriteBackPort({ store, location: h.location, format: "sha1", actor: "test-user@fixture" });
    const request = { checkout: h.checkout, path: h.path, copy: null, entry: h.entry,
      base: { kind: "stamp" as const, stamp: h.entry.base.blob } };
    const first = await takeIn(request);
    expect(first).toMatchObject({ answer: "pending", entry: { pending: true, refused: null } });
    const second = await takeIn({ ...request, entry: first.entry });
    expect(second).toMatchObject({ answer: "pending", entry: { pending: true, refused: null } });
    expect((await h.stored()).content).toBe(h.record.content);
    expect(await h.file()).toBe(bytes);
    await startProjection({ store, checkout: h.checkout });
    expect((await h.stored()).content).toBe("opening\nhand edit\nclosing\n");
  });

  it("preserves an edit to a removed record and reports how to resolve it", async () => {
    const h = await createEngineFixture(directories);
    await h.edit("opening\nhand edit\nclosing\n");
    const bytes = await h.file();
    success(await h.store.write({ action: "remove", reference: h.record.reference, expected: h.record.version,
      provenance: { verb: "edit", lifecycleAction: "remove" } }));
    await startProjection({ store: h.store, checkout: h.checkout });
    expect(await h.file()).toBe(bytes);
    expect(await h.store.read({ reference: h.record.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect((await h.disk()).entries[h.path]).toMatchObject({ refused: { reason: expect.stringContaining("removed"),
      remedy: { text: expect.stringContaining("Copy out") } } });
  });

  it("shares the walk's recovery allowance with an aside take-in at command end", async () => {
    const h = await createEngineFixture(directories);
    await h.edit("opening\nfirst edit\nclosing\n");
    const editor = await editors.open(join(h.checkout, h.path));
    const refusal: StoreRefusal = { code: "version-conflict", class: "recoverable", records: [h.record.reference],
      condition: "The expected version is outside readable history.", remedy: { text: "Recover the base and retry." } };
    let writes = 0;
    const store = overrideEngineStore(h.store, { write: input => ++writes === 1 || writes === 3
      ? Promise.resolve({ status: "refused", refusal }) : h.store.write(input) });
    const native = h.ports();
    await startProjection({ store, checkout: h.checkout, ports: () => ({ ...native,
      writer: async () => ({ ...await native.writer(), processInstance: "first-command" }) }) });
    expect((await h.stored()).content).toBe("opening\nfirst edit\nclosing\n");
    const late = renderStampedFile({ content: "opening\nlate edit\nclosing\n", stamp: h.entry.base.blob });
    await editor.truncate(0);
    const bytes = Buffer.from(late);
    await editor.write(bytes, 0, bytes.length, 0);
    await editor.close();
    await endProjection({ store, checkout: h.checkout });
    expect((await h.stored()).content).toBe("opening\nfirst edit\nclosing\n");
    const entry = (await h.disk()).entries[h.path];
    if (entry?.kind !== "record" || entry.copies[0] === undefined) throw new Error("missing pending aside copy");
    expect(entry.pending).toBe(true);
    expect(await readFile(join(h.checkout, entry.copies[0].name), "utf8")).toBe(late);
    await startProjection({ store, checkout: h.checkout, ports: () => ({ ...native,
      writer: async () => ({ ...await native.writer(), processInstance: "next-command" }) }) });
    expect((await h.stored()).content).toBe("opening\nlate edit\nclosing\n");
  });

  for (const operation of ["write", "history"] as const) for (const code of ["state-unresolvable", "namespace-corrupt"] as const) {
    it(`preserves ${operation}'s ${code} remedy without pulling, then lands after repair`, async () => {
      const h = await createEngineFixture(directories);
      const current = success(await h.store.write(update(h, h.record, "current opening\nbase\nclosing\n")));
      await h.edit("opening\nbase\nincoming closing\n");
      const bytes = await h.file();
      const remedy = { text: "Restore the missing local store data, then retry.", argv: ["repair-store", "local data"] };
      const refusal: StoreRefusal = code === "state-unresolvable"
        ? { code, class: "recoverable", historyRefs: [], reference: h.record.reference, condition: "A live record object is unreadable.", remedy }
        : { code, class: "terminal", namespace: "personal", condition: "The stored namespace is corrupt.", remedy };
      let broken = true;
      const store = overrideEngineStore(h.store, {
        write: input => broken && operation === "write" ? Promise.resolve({ status: "refused", refusal }) : h.store.write(input),
        history: input => broken && operation === "history" ? Promise.resolve({ status: "refused", refusal }) : h.store.history(input),
        pull: async () => { throw new Error("An unnamed local fault must never pull history"); },
      });
      await startProjection({ store, checkout: h.checkout });
      expect((await h.stored()).version).toBe(current.version);
      expect(await h.file()).toBe(bytes);
      expect((await h.disk()).entries[h.path]).toMatchObject({ refused: { reason: refusal.condition, remedy } });
      expect(projectionProcessState().diagnostics).toMatchObject([{ path: h.path, mark: { reason: refusal.condition, remedy } }]);
      broken = false;
      await startProjection({ store, checkout: h.checkout });
      expect((await h.stored()).content).toBe("current opening\nbase\nincoming closing\n");
      expect((await h.disk()).entries[h.path]).toMatchObject({ refused: null, pending: false });
    });
  }
});
