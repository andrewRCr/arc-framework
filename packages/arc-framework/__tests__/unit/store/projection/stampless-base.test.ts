/** A stampless save is sent only when its recorded possible bases agree on the merge. */
import { afterEach, describe, expect, it } from "vitest";
import { createWriteBackFixture, refreshWriteBackFixture } from "../../../helpers/store/projection/write-back-fixture.js";
import { writeBackFile } from "../../../../src/lib/store/projection/read-back.js";
import { createWriteBackPort, prepareWriteBack } from "../../../../src/lib/store/projection/write-back.js";
import { runSecondCheck } from "../../../../src/lib/store/projection/second-check.js";
import type { ProjectionIndex, RecordEntry } from "../../../../src/lib/store/projection/index-schema.js";
import { createCountingStore } from "../../../helpers/store/counting-store.js";
import { createHistoryMemo } from "../../../../src/lib/store/projection/base-recovery.js";
import { nameAsideFile, parseAsideFile } from "../../../../src/lib/store/projection/aside.js";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { guardReplacement } from "../../../../src/lib/store/projection/replace-guard.js";
import { stageRecordFile } from "../../../../src/lib/store/projection/staging.js";
import { swapBatch } from "../../../../src/lib/store/projection/swap.js";
import { readReference } from "../../../../src/lib/store/projection/change-detection.js";
import { readProjectionIndex } from "../../../../src/lib/store/projection/index-file.js";
import { TAKEN_IN_FOLDER } from "../../../../src/lib/store/projection/taken-in.js";
import { createHistoryRefusingStore } from "../../../helpers/store/projection/history-refusing-store.js";
import { selectWriteBackBase } from "../../../../src/lib/store/projection/base-selection.js";

type Fixture = Awaited<ReturnType<typeof createWriteBackFixture>>;
let fixture: Fixture | undefined;
afterEach(async () => { await fixture?.dispose(); });

async function finish(source: Fixture, index: ProjectionIndex): Promise<ProjectionIndex> {
  const entry = index.entries[source.path];
  if (entry?.kind !== "record") throw new Error("entry unavailable");
  const checked = await runSecondCheck({ ...source.context, checkout: source.checkout, index,
    copies: entry.copies.map(copy => ({ path: source.path, copy: copy.name })), takeIn: createWriteBackPort(source.context) });
  return checked.index;
}

async function mergedWriteBack(source: Fixture): Promise<{ index: ProjectionIndex; entry: RecordEntry; incoming: string; merged: string }> {
  const other = await source.store.write({ action: "put", reference: source.entry.reference, expected: source.entry.base.version,
    content: "opening\nbase\nclosing\nremote line\n", provenance: { verb: "edit", lifecycleAction: "edit" } });
  if (other.status !== "ok") throw new Error("other writer refused");
  const incoming = "opening\nhand edit\nclosing\n";
  const merged = `${incoming}remote line\n`;
  await source.edit(incoming);
  const first = await writeBackFile(source.context, source.index, source.request);
  const index = await finish(source, first.index);
  const entry = index.entries[source.path];
  if (entry?.kind !== "record") throw new Error("entry unavailable");
  expect(entry.persisted?.takenIn.kind).toBe("copy");
  return { index, entry, incoming, merged };
}

describe("stampless base agreement", () => {
  it("holds a save that could be a stale buffer or a reloaded deletion, and sends once its candidates agree", async () => {
    fixture = await createWriteBackFixture({ path: ".arc/personal-document.txt" });
    const { index, entry, incoming, merged } = await mergedWriteBack(fixture);
    const request = { ...fixture.request, entry, base: { kind: "blob" as const, blob: entry.base.blob } };
    await fixture.edit(incoming);
    const held = await writeBackFile(fixture.context, index, request);
    expect(held.result).toMatchObject({ answer: "clashed", entry: { pending: true, refused: { reason: "bases-disagree" } } });
    const read = await fixture.store.read({ reference: entry.reference });
    expect(read.status === "ok" ? read.result : read).toMatchObject({ version: entry.base.version, content: merged });
    expect(await fixture.file()).toContain("[arc-conflict: checkout]");
    const repaired = merged.replace("opening\n", "opening repaired\n");
    await fixture.edit(repaired);
    const retry = { ...request, entry: held.result.entry };
    expect(await prepareWriteBack(fixture.context, retry)).toMatchObject({ kind: "ready", write: { expected: entry.base.version } });
    const written = await writeBackFile(fixture.context, held.index, retry);
    expect(written.result.answer).toBe("taken-in");
    expect(await fixture.file()).toBe(repaired);
  });

  it("counts an indexed base and its landed version once, reading no candidate content or history", async () => {
    fixture = await createWriteBackFixture({ path: ".arc/personal-document.txt" });
    await fixture.edit("opening\nhand edit\nclosing\n");
    const first = await writeBackFile(fixture.context, fixture.index, fixture.request);
    const index = await finish(fixture, first.index);
    const entry = index.entries[fixture.path];
    if (entry?.kind !== "record") throw new Error("entry unavailable");
    expect(entry.persisted?.takenIn).toMatchObject({ kind: "landed", version: entry.base.version });
    await fixture.edit("opening repaired\nhand edit\nclosing\n");
    const counted = createCountingStore(fixture.store);
    const context = { ...fixture.context, store: counted.store, memo: createHistoryMemo(counted.store) };
    const request = { ...fixture.request, entry, base: { kind: "blob" as const, blob: entry.base.blob } };
    expect(await selectWriteBackBase(context, request, "opening repaired\nhand edit\nclosing\n", null))
      .toMatchObject({ status: "ok", result: { kind: "selected", base: { kind: "stored", version: entry.base.version } } });
    expect(counted.observations()).toEqual([]);
  });

  it("takes a save in a fast-forward read-back's aside copy against the base its name carries", async () => {
    fixture = await createWriteBackFixture({ path: ".arc/personal-document.txt" });
    await fixture.edit("opening edited\nbase\nclosing\n");
    const first = await writeBackFile(fixture.context, fixture.index, fixture.request);
    const entry = first.result.entry;
    const copy = entry.copies[0];
    if (copy === undefined) throw new Error("aside copy unavailable");
    const named = parseAsideFile(copy.name);
    if (named === undefined) throw new Error("copy name unavailable");
    expect(named.base).toBe(fixture.entry.base.blob);
    const incoming = "opening edited\nbase\n";
    await writeFile(join(fixture.checkout, copy.name), incoming);
    const request = { ...fixture.request, entry, copy: copy.name, base: { kind: "blob" as const, blob: named.base } };
    expect(await prepareWriteBack(fixture.context, request)).toMatchObject({ kind: "ready", write: { expected: fixture.entry.base.version } });
    const taken = await createWriteBackPort(fixture.context)(request);
    expect(taken).toMatchObject({ answer: "taken-in", entry: { base: entry.base } });
    const read = await fixture.store.read({ reference: entry.reference });
    expect(read.status === "ok" ? read.result.content : read).toBe(incoming);
    expect(taken.entry.copies.find(each => each.name === copy.name)?.landed).toBe(gitBlobId(incoming, "sha1"));
  });

  it.each(["indexed", "unknown"])("resolves an aside copy's %s base without selecting by closeness", async mode => {
    fixture = await createWriteBackFixture({ path: ".arc/personal-document.txt" });
    const original = "opening\nbase\nclosing\n";
    const current = "opening changed\nnew body\nclosing\n";
    const other = await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.entry.base.version,
      content: current, provenance: { verb: "edit", lifecycleAction: "edit" } });
    if (other.status !== "ok") throw new Error("other writer refused");
    const index = await refreshWriteBackFixture(fixture, fixture.index);
    const refreshed = index.entries[fixture.path];
    if (refreshed?.kind !== "record") throw new Error("entry unavailable");
    const blob = mode === "indexed" ? refreshed.base.blob : "f".repeat(40);
    const name = nameAsideFile({ path: fixture.path, base: blob, writer: fixture.context.writer, role: "aside" });
    const content = mode === "indexed" ? current.replace("new body", "hand edit") : original;
    await mkdir(dirname(join(fixture.checkout, name)), { recursive: true });
    await writeFile(join(fixture.checkout, name), content);
    const entry = { ...refreshed, copies: [{ name, moving: gitBlobId("older buffer\n", "sha1"), linked: refreshed.written,
      writeBackSent: false, landed: null }] };
    const counted = createCountingStore(fixture.store);
    const context = { ...fixture.context, store: counted.store, memo: createHistoryMemo(counted.store) };
    const request = { ...fixture.request, entry, copy: name, base: { kind: "blob" as const, blob } };
    expect(await prepareWriteBack(context, request)).toMatchObject({ kind: "ready", write: {
      expected: mode === "indexed" ? refreshed.base.version : fixture.entry.base.version,
    } });
    expect(counted.count({ operation: "history", input: { reference: entry.reference } })).toBe(mode === "indexed" ? 0 : 1);
  });

  it.each([false, true])("compares both bases after a stopped replacement and permits only agreement (%s)", async disagree => {
    fixture = await createWriteBackFixture({ path: ".arc/personal-document.txt" });
    const current = "opening changed\nbase\nclosing\n";
    const other = await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.entry.base.version,
      content: current, provenance: { verb: "edit", lifecycleAction: "edit" } });
    if (other.status !== "ok") throw new Error("other writer refused");
    const read = await fixture.store.read({ reference: fixture.entry.reference });
    if (read.status !== "ok") throw new Error("record unavailable");
    const staged = await stageRecordFile({ ...fixture.context, checkout: fixture.checkout, path: fixture.path,
      record: read.result, replacing: fixture.entry.base.blob });
    if (staged.status !== "ok") throw new Error("staging refused");
    const takeIn = createWriteBackPort(fixture.context);
    const guarded = await guardReplacement({ ...fixture.context, checkout: fixture.checkout, path: fixture.path,
      entry: fixture.entry, staged: staged.result, reference: await readReference(fixture.checkout), takeIn });
    if (guarded.kind !== "replace") throw new Error("replacement unavailable");
    await expect(swapBatch({ ...fixture.context, checkout: fixture.checkout, index: fixture.index,
      files: [{ path: fixture.path, replace: guarded }], readBack: false, takeIn,
      hooks: { afterMove: () => Promise.reject(new Error("stopped after move")) },
    })).rejects.toThrow("stopped after move");
    const disk = await readProjectionIndex(fixture.location, true);
    if (disk.kind !== "index") throw new Error("index unavailable");
    const entry = disk.index.entries[fixture.path];
    if (entry?.kind !== "record") throw new Error("entry unavailable");
    const incoming = `${disagree ? "opening" : "opening changed"}\nbase\nclosing edited\n`;
    await fixture.edit(incoming);
    const request = { ...fixture.request, entry, base: { kind: "blob" as const, blob: entry.base.blob } };
    const written = await writeBackFile(fixture.context, disk.index, request);
    if (disagree) {
      expect(written.result).toMatchObject({ answer: "clashed", entry: { pending: true, refused: { reason: "bases-disagree" } } });
      const unchanged = await fixture.store.read({ reference: entry.reference });
      expect(unchanged.status === "ok" ? unchanged.result.content : unchanged).toBe(current);
      const repaired = "opening changed\nbase\nclosing edited\n";
      await fixture.edit(repaired);
      expect((await writeBackFile(fixture.context, written.index, { ...request, entry: written.result.entry })).result.answer).toBe("taken-in");
      expect(await fixture.file()).toBe(repaired);
    } else {
      expect(written.result.answer).toBe("taken-in");
      expect(await fixture.file()).toBe(incoming);
    }
  });

  it("keeps an unreadable retained copy pending and lands the edit once that copy is restored", async () => {
    fixture = await createWriteBackFixture({ path: ".arc/personal-document.txt" });
    const { index, entry, merged } = await mergedWriteBack(fixture);
    const kept = entry.persisted?.takenIn;
    if (kept?.kind !== "copy") throw new Error("retained copy unavailable");
    const path = join(fixture.location.stateDir, TAKEN_IN_FOLDER, kept.name);
    await rename(path, `${path}.backup`);
    const incoming = merged.replace("opening\n", "opening repaired\n");
    await fixture.edit(incoming);
    const request = { ...fixture.request, entry, base: { kind: "blob" as const, blob: entry.base.blob } };
    const held = await writeBackFile(fixture.context, index, request);
    expect(held.result).toMatchObject({ answer: "pending", entry: { pending: true, refused: null } });
    expect(fixture.reports.at(-1)?.mark.reason).toContain("retained write-back base cannot be read");
    expect(await fixture.file()).toBe(incoming);
    const read = await fixture.store.read({ reference: entry.reference });
    expect(read.status === "ok" ? read.result : read).toMatchObject({ version: entry.base.version, content: merged });
    await rename(`${path}.backup`, path);
    expect((await writeBackFile(fixture.context, held.index, { ...request, entry: held.result.entry })).result.answer).toBe("taken-in");
    expect(await fixture.file()).toBe(incoming);
  });

  it("keeps a candidate with unreadable history pending without writing or pulling, then retries successfully", async () => {
    fixture = await createWriteBackFixture({ kind: "work-item/companion", path: ".arc/companion.txt" });
    const { index, entry, merged } = await mergedWriteBack(fixture);
    const incoming = merged.replace("opening\n", "opening repaired\n");
    await fixture.edit(incoming);
    const wrapped = createHistoryRefusingStore(fixture.store, [entry.reference]);
    const context = { ...fixture.context, store: wrapped.store, memo: createHistoryMemo(wrapped.store) };
    const request = { ...fixture.request, entry, base: { kind: "blob" as const, blob: entry.base.blob } };
    const held = await writeBackFile(context, index, request);
    expect(held.result).toMatchObject({ answer: "pending", entry: { pending: true, refused: null } });
    expect([wrapped.calls("write"), wrapped.calls("pull")]).toEqual([0, 0]);
    expect(await fixture.file()).toBe(incoming);
    const written = await writeBackFile(fixture.context, held.index, { ...request, entry: held.result.entry });
    expect(written.result.answer).toBe("taken-in");
    expect(await fixture.file()).toBe(incoming);
  });

  it("holds a stale save in a later refresh's aside copy instead of reverting the other writer", async () => {
    fixture = await createWriteBackFixture({ path: ".arc/personal-document.txt" });
    const source = fixture;
    const { index, entry, incoming, merged } = await mergedWriteBack(source);
    const current = merged.replace("opening\n", "opening newer\n");
    const other = await source.store.write({ action: "put", reference: entry.reference, expected: entry.base.version,
      content: current, provenance: { verb: "edit", lifecycleAction: "edit" } });
    if (other.status !== "ok") throw new Error("other writer refused");
    const refreshed = await refreshWriteBackFixture(source, index, { afterFirstCheck: async () => {
      const disk = await readProjectionIndex(source.location, true);
      if (disk.kind !== "index") throw new Error("index unavailable");
      const projected = disk.index.entries[source.path];
      const copy = projected?.kind === "record" ? projected.copies.at(-1) : undefined;
      if (copy === undefined || projected?.kind !== "record") throw new Error("refresh copy unavailable");
      await writeFile(join(source.checkout, copy.name), incoming);
      const named = parseAsideFile(copy.name);
      if (named === undefined) throw new Error("copy base unavailable");
      const taken = await createWriteBackPort(source.context)({ checkout: source.checkout, path: source.path,
        entry: projected, copy: copy.name, base: { kind: "blob", blob: named.base } });
      expect(taken).toMatchObject({ answer: "clashed", entry: { base: projected.base, refused: null } });
      expect(taken).not.toHaveProperty("mark");
    } });
    const read = await source.store.read({ reference: entry.reference });
    expect(read.status === "ok" ? read.result : read).toMatchObject({ version: other.result.version, content: current });
    const projected = refreshed.entries[source.path];
    if (projected?.kind !== "record") throw new Error("entry unavailable");
    expect(projected).toMatchObject({ pending: true, refused: null, base: { version: other.result.version } });
    expect(projected.copies).toHaveLength(1);
    expect(await source.file()).toBe(incoming);
    expect(source.reports.at(-1)?.mark.reason).toBe("ambiguous-base");
    const held = await writeBackFile(source.context, refreshed, { ...source.request, entry: projected });
    expect(held.result.entry.refused?.reason).toBe("bases-disagree");
    const settled = await finish(source, held.index);
    const repaired = settled.entries[source.path];
    if (repaired?.kind !== "record") throw new Error("held entry unavailable");
    await source.edit(current);
    expect((await writeBackFile(source.context, settled, { ...source.request, entry: repaired })).result.answer).toBe("taken-in");
  });

  it("holds an indexed-content revert before the read-back is laid, and accepts a repaired edit", async () => {
    fixture = await createWriteBackFixture({ path: ".arc/personal-document.txt" });
    const incoming = "opening\nhand edit\nclosing\n";
    await fixture.edit(incoming);
    const sent = await createWriteBackPort(fixture.context)(fixture.request);
    expect(sent.answer).toBe("taken-in");
    const index = { ...fixture.index, entries: { [fixture.path]: sent.entry } };
    await fixture.edit("opening\nbase\nclosing\n");
    const request = { ...fixture.request, entry: sent.entry };
    const held = await writeBackFile(fixture.context, index, request);
    expect(held.result).toMatchObject({ answer: "clashed", entry: { pending: true, refused: { reason: "bases-disagree" } } });
    expect(await fixture.file()).toContain("[arc-conflict: checkout]");
    const read = await fixture.store.read({ reference: sent.entry.reference });
    expect(read.status === "ok" ? read.result.content : read).toBe(incoming);
    const repaired = `new prefix\n${incoming}`;
    await fixture.edit(repaired);
    expect((await writeBackFile(fixture.context, held.index, { ...request, entry: held.result.entry })).result.answer).toBe("taken-in");
    expect(await fixture.file()).toBe(repaired);
  });

  it("sends candidates that file the same clash at the same place from different stored versions", async () => {
    fixture = await createWriteBackFixture({ path: ".arc/personal-document.txt" });
    const intermediate = await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.entry.base.version,
      content: "opening\nintermediate\nclosing\n", provenance: { verb: "edit", lifecycleAction: "edit" } });
    if (intermediate.status !== "ok" || intermediate.result.version === undefined) throw new Error("intermediate write refused");
    const current = await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: intermediate.result.version,
      content: "opening\ncurrent\nclosing\n", provenance: { verb: "edit", lifecycleAction: "edit" } });
    if (current.status !== "ok") throw new Error("current write refused");
    const entry = { ...fixture.entry, persisted: { stamp: fixture.entry.base.blob,
      takenIn: { kind: "landed" as const, version: intermediate.result.version } } };
    await fixture.edit("opening\nincoming\nclosing\n");
    const taken = await createWriteBackPort(fixture.context)({ ...fixture.request, entry });
    expect(taken).toMatchObject({ answer: "taken-in", entry: { refused: null } });
    const read = await fixture.store.read({ reference: entry.reference });
    expect(read.status === "ok" ? read.result.content : read).toBe("opening\ncurrent\nclosing\n");
    expect(read.status === "ok" ? read.result.conflicts : []).toHaveLength(1);
    if (read.status === "ok") expect(read.result.version).not.toBe(current.result.version);
    expect(await fixture.file()).toBe("opening\nincoming\nclosing\n");
  });
});
