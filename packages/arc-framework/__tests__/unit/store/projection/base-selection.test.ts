/** A hand edit uses the base its stamp or recorded take-in identifies. */
import { afterEach, describe, expect, it } from "vitest";
import { createWriteBackFixture } from "../../../helpers/store/projection/write-back-fixture.js";
import { prepareWriteBack } from "../../../../src/lib/store/projection/write-back.js";
import { writeBackFile } from "../../../../src/lib/store/projection/read-back.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parseStampedFile, renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { nameAsideFile } from "../../../../src/lib/store/projection/aside.js";
import { createHistoryRefusingStore } from "../../../helpers/store/projection/history-refusing-store.js";
import { createCountingStore } from "../../../helpers/store/counting-store.js";
import { TAKEN_IN_FOLDER } from "../../../../src/lib/store/projection/taken-in.js";
import { createHistoryMemo } from "../../../../src/lib/store/projection/base-recovery.js";

let fixture: Awaited<ReturnType<typeof createWriteBackFixture>> | undefined;
afterEach(async () => { await fixture?.dispose(); });

describe("selecting a write-back base", () => {
  it("uses the last landed content for its old stamp after a refresh, preserving another writer's addition", async () => {
    fixture = await createWriteBackFixture();
    await fixture.edit("opening\nfirst edit\nclosing\n");
    const first = await writeBackFile(fixture.context, fixture.index, fixture.request);
    const takenIn = first.result.entry.persisted?.takenIn;
    if (takenIn?.kind !== "landed") throw new Error("expected a fast-forward landing");
    const currentContent = "opening\nfirst edit\nclosing\nremote line\n";
    const other = await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: takenIn.version,
      content: currentContent, provenance: { verb: "edit", lifecycleAction: "edit" } });
    if (other.status !== "ok" || other.result.version === undefined) throw new Error("other writer refused");
    const refreshed = { ...first.result.entry, base: { blob: gitBlobId(currentContent, "sha1"), version: other.result.version } };
    const index = { ...first.index, entries: { [fixture.path]: refreshed } };
    await fixture.edit("opening\nclosing\n", fixture.entry.base.blob);
    const request = { ...fixture.request, entry: refreshed };
    expect(await prepareWriteBack(fixture.context, request)).toMatchObject({ kind: "ready", write: { expected: takenIn.version } });
    await writeBackFile(fixture.context, index, request);
    const read = await fixture.store.read({ reference: fixture.entry.reference });
    expect(read.status === "ok" ? read.result.content : read).toBe("opening\nclosing\nremote line\n");
  });

  it.each(["older", "unknown", "missing", "aside"])("recovers the stored version of a %s stamp", async mode => {
    fixture = await createWriteBackFixture();
    const original = "opening\nbase\nclosing\n";
    const current = `${original}another writer\n`;
    const other = await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.entry.base.version,
      content: current, provenance: { verb: "edit", lifecycleAction: "edit" } });
    if (other.status !== "ok" || other.result.version === undefined) throw new Error("other writer refused");
    const refreshed = { ...fixture.entry, stat: null, base: { blob: gitBlobId(current, "sha1"), version: other.result.version } };
    const stamp = mode === "unknown" ? "f".repeat(40) : fixture.entry.base.blob;
    const copy = mode === "aside" ? nameAsideFile({ path: fixture.path, base: fixture.entry.base.blob,
      writer: fixture.context.writer, role: "aside" }) : null;
    const path = join(fixture.checkout, copy ?? fixture.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, mode === "missing" ? original : renderStampedFile({ content: original, stamp }));
    const request = { ...fixture.request, entry: refreshed, copy };
    expect(await prepareWriteBack(fixture.context, request)).toMatchObject({ kind: "ready", write: { expected: fixture.entry.base.version } });
    if (copy === null) {
      const written = await writeBackFile(fixture.context, { ...fixture.index, entries: { [fixture.path]: refreshed } }, request);
      expect(parseStampedFile(await fixture.file())).toMatchObject({ content: current, stamp: gitBlobId(current, "sha1") });
      expect(written.result.entry.persisted?.stamp).toBe(mode === "missing" ? fixture.entry.base.blob : stamp);
    }
  });

  it("uses the indexed base without history when the stamp names it", async () => {
    fixture = await createWriteBackFixture();
    await fixture.edit("opening\nhand edit\nclosing\n");
    const counted = createCountingStore(fixture.store);
    const context = { ...fixture.context, store: counted.store, memo: createHistoryMemo(counted.store) };
    expect(await prepareWriteBack(context, fixture.request)).toMatchObject({ kind: "ready", write: { expected: fixture.entry.base.version } });
    expect(counted.count({ operation: "history", input: { reference: fixture.entry.reference } })).toBe(0);
  });

  it.each(["matching", "unknown", "missing", "recovery", "no-history"].flatMap(stamp =>
    ["missing-copy", "directory-copy"].map(fault => ({ stamp, fault }))))(
    "holds a $stamp Markdown base with $fault and retries after repair", async ({ stamp, fault }) => {
      fixture = await createWriteBackFixture(stamp === "no-history" ? { kind: "work-item/companion" } : {});
      const remote = await fixture.store.write({ action: "put", reference: fixture.entry.reference,
        expected: fixture.entry.base.version, content: "opening\nbase\nclosing\nremote addition\n",
        provenance: { verb: "edit", lifecycleAction: "edit" } });
      if (remote.status !== "ok") throw new Error("Remote edit refused");
      await fixture.edit("opening\nfirst edit\nclosing\n");
      const landed = await writeBackFile(fixture.context, fixture.index, fixture.request);
      const kept = landed.result.entry.persisted?.takenIn;
      if (kept?.kind !== "copy") throw new Error("The merged landing did not retain its input");
      const payload = join(fixture.location.stateDir, TAKEN_IN_FOLDER, kept.name), backup = `${payload}.saved`;
      await rename(payload, backup);
      if (fault === "directory-copy") await mkdir(payload);
      const content = "opening\nsecond edit\nclosing\n";
      if (stamp === "missing" || stamp === "no-history") await writeFile(join(fixture.checkout, fixture.path), content);
      else await fixture.edit(content, stamp === "unknown" ? "f".repeat(40) : fixture.entry.base.blob);
      const request = { ...fixture.request, entry: landed.result.entry };
      const store = stamp === "no-history" ? createHistoryRefusingStore(fixture.store, [fixture.entry.reference]).store : fixture.store;
      const context = { ...fixture.context, store, memo: createHistoryMemo(store), recoveringBase: stamp === "recovery" };
      expect(await prepareWriteBack(context, request)).toMatchObject({ kind: "held", result: { answer: "pending", entry: { pending: true } },
        diagnostic: { reason: expect.stringContaining("retained"), remedy: { text: expect.stringContaining("Restore") } } });
      expect(parseStampedFile(await fixture.file()).content).toBe(content);
      if (fault === "directory-copy") await rm(payload, { recursive: true });
      await rename(backup, payload);
      expect(await prepareWriteBack(context, request)).toMatchObject({ kind: "ready", write: {
        content: "opening\nsecond edit\nclosing\nremote addition\n",
      } });
    },
  );

  it("normalizes stampless content for the store while retaining the raw read's blob", async () => {
    fixture = await createWriteBackFixture({ path: ".arc/personal-document.txt" });
    const raw = "opening\r\nhand edit\r\nclosing\r\n";
    const content = "opening\nhand edit\nclosing\n";
    await fixture.edit(raw);
    expect(await prepareWriteBack(fixture.context, fixture.request)).toMatchObject({ kind: "ready",
      write: { content }, read: { blob: gitBlobId(raw, "sha1") } });
    const written = await writeBackFile(fixture.context, fixture.index, fixture.request);
    expect(written.result.answer).toBe("taken-in");
    expect(await fixture.file()).toBe(content);
    const read = await fixture.store.read({ reference: fixture.entry.reference });
    expect(read.status === "ok" ? read.result.content : read).toBe(content);
  });
});
