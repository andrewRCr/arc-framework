/** Read-back installs the merged stored record while retaining the edit's read baseline. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWriteBackFixture } from "../../../helpers/store/projection/write-back-fixture.js";
import { writeBackFile } from "../../../../src/lib/store/projection/read-back.js";
import { parseStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { stageRenderedRecordFile } from "../../../../src/lib/store/projection/staging.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readTakenInCopy } from "../../../../src/lib/store/projection/taken-in.js";
import { runSecondCheck } from "../../../../src/lib/store/projection/second-check.js";
import { createWriteBackPort } from "../../../../src/lib/store/projection/write-back.js";
import { readStat } from "../../../../src/lib/store/projection/change-detection.js";

let fixture: Awaited<ReturnType<typeof createWriteBackFixture>> | undefined;
afterEach(async () => { vi.restoreAllMocks(); await fixture?.dispose(); });

describe("write-back read-back", () => {
  it("replaces a stale edit with the merged record and records the merged version as its base", async () => {
    fixture = await createWriteBackFixture();
    const { store, entry, context, index, request } = fixture;
    const other = await store.write({ action: "put", reference: entry.reference, expected: entry.base.version,
      content: "opening\nbase\nclosing\nanother writer\n", provenance: { verb: "edit", lifecycleAction: "edit" } });
    if (other.status !== "ok") throw new Error("other writer refused");
    await fixture.edit("opening\nhand edit\nclosing\n");
    const written = await writeBackFile(context, index, request);
    const record = await store.read({ reference: entry.reference });
    if (record.status !== "ok") throw new Error("read refused");
    const content = "opening\nhand edit\nclosing\nanother writer\n";
    expect(record.result.content).toBe(content);
    expect(parseStampedFile(await fixture.file())).toMatchObject({ content, stamp: gitBlobId(content, "sha1") });
    expect(written.index.entries[request.path]).toMatchObject({ base: { blob: gitBlobId(content, "sha1"), version: record.result.version } });
  });

  it("stages rendered content with the stored content's stamp and the laid bytes' blob", async () => {
    fixture = await createWriteBackFixture();
    const { store, entry, context, checkout, path } = fixture;
    const read = await store.read({ reference: entry.reference });
    if (read.status !== "ok") throw new Error("record unavailable");
    const rendered = "opening\nrendered conflict text\nclosing\n";
    const staged = await stageRenderedRecordFile({ ...context, checkout, path, record: read.result,
      replacing: entry.base.blob, content: rendered, markerLength: 7 });
    const bytes = await readFile(join(checkout, staged.location));
    expect(parseStampedFile(bytes.toString("utf8"))).toMatchObject({ content: rendered, stamp: entry.base.blob });
    expect(staged).toMatchObject({ base: entry.base, written: gitBlobId(bytes, "sha1") });
    expect(staged.written).not.toBe(staged.base.blob);
  });

  it("lays the entry IDs the backend stamped and records the landed version as taken in", async () => {
    fixture = await createWriteBackFixture({ kind: "work-item/description", content: "# Errand\n\n## Description\n" });
    await fixture.edit("# Errand\n\n## Description\n\n### [ ] **New concern**\n\nDescription.\n");
    const written = await writeBackFile(fixture.context, fixture.index, fixture.request);
    const read = await fixture.store.read({ reference: fixture.entry.reference });
    if (read.status !== "ok") throw new Error("record unavailable");
    expect(read.result.content).toMatch(/- _Id:_ `[0-9a-f]{8}`/u);
    expect(parseStampedFile(await fixture.file())).toMatchObject({ content: read.result.content,
      stamp: gitBlobId(read.result.content, "sha1") });
    expect(written.index.entries[fixture.path]).toMatchObject({
      persisted: { stamp: fixture.entry.base.blob, takenIn: { kind: "landed", version: read.result.version } },
      written: gitBlobId(await fixture.file(), "sha1"), pending: false,
    });
  });

  it.each([false, true])("leaves an installed read-back pending only if it was already pending (%s)", async pending => {
    fixture = await createWriteBackFixture();
    await fixture.edit("opening\nhand edit\nclosing\n");
    const entry = { ...fixture.entry, pending };
    const index = { ...fixture.index, entries: { [fixture.path]: entry } };
    const written = await writeBackFile(fixture.context, index, { ...fixture.request, entry });
    expect(written.result.answer).toBe("taken-in");
    expect(written.index.entries[fixture.path]).toMatchObject({ kind: "record", pending });
    expect(parseStampedFile(await fixture.file()).content).toBe("opening\nhand edit\nclosing\n");
  });

  it.each([false, true])("sends only saves not already taken in when a later save arrives (%s)", async lateSave => {
    fixture = await createWriteBackFixture();
    const current = fixture;
    const first = "opening\nhand edit\nclosing\n";
    const second = `${first}later save\n`;
    await fixture.edit(first);
    if (lateSave) {
      const read = fixture.store.read.bind(fixture.store);
      vi.spyOn(fixture.store, "read").mockImplementationOnce(async input => {
        const record = await read(input);
        await current.edit(second);
        return record;
      });
    }
    const written = await writeBackFile(fixture.context, fixture.index, fixture.request);
    const expected = lateSave ? second : first;
    expect(parseStampedFile(await fixture.file()).content).toBe(expected);
    const history = await fixture.store.history({ reference: fixture.entry.reference });
    if (history.status !== "ok") throw new Error("history unavailable");
    expect(history.result.map(each => each.content)).toEqual(lateSave
      ? [second, first, "opening\nbase\nclosing\n"] : [first, "opening\nbase\nclosing\n"]);
    expect(written.index.entries[fixture.path]).toMatchObject({ base: {
      version: history.result[0]?.version, blob: gitBlobId(expected, "sha1"),
    }, written: gitBlobId(await fixture.file(), "sha1") });
  });

  it("keeps the taken-in entry content with its landed IDs when the backend merges another entry", async () => {
    const header = "# Errand\n\n## Description\n\n";
    fixture = await createWriteBackFixture({ kind: "work-item/description", content: header });
    const remote = "### [ ] **Remote**\n\nAnother writer.\n";
    const incoming = "### [ ] **Local**\n\nLocal concern.\n";
    const other = await fixture.store.write({ action: "put", reference: fixture.entry.reference,
      expected: fixture.entry.base.version, content: header + remote, provenance: { verb: "edit", lifecycleAction: "edit" } });
    if (other.status !== "ok") throw new Error("other writer refused");
    await fixture.edit(header + incoming);
    const written = await writeBackFile(fixture.context, fixture.index, fixture.request);
    const entry = written.index.entries[fixture.path];
    if (entry?.kind !== "record") throw new Error("entry unavailable");
    expect(entry.persisted?.takenIn.kind).toBe("copy");
    const kept = entry.persisted?.takenIn;
    if (kept?.kind !== "copy") throw new Error("copy unavailable");
    const takenIn = await readTakenInCopy(fixture.location, kept.name);
    expect(takenIn).toContain("**Local**");
    expect(takenIn).not.toContain("**Remote**");
    const id = /- _Id:_ `([0-9a-f]{8})`/u.exec(takenIn)?.[1];
    expect(id).toBeDefined();
    expect(await fixture.file()).toContain(`- _Id:_ \`${id}\``);
    const read = await fixture.store.read({ reference: fixture.entry.reference });
    expect(read.status === "ok" ? read.result.version : read).toBe(kept.version);
  });

  it("deletes a stampless read-back's unchanged aside copy at the second check without sending again", async () => {
    fixture = await createWriteBackFixture({ path: ".arc/personal-document.txt" });
    await fixture.edit("opening\nhand edit\nclosing\n");
    const written = await writeBackFile(fixture.context, fixture.index, fixture.request);
    const entry = written.index.entries[fixture.path];
    if (entry?.kind !== "record") throw new Error("entry unavailable");
    const { path } = fixture;
    const copies = entry.copies.map(copy => ({ path, copy: copy.name }));
    expect(copies).toHaveLength(1);
    const checked = await runSecondCheck({ ...fixture.context, checkout: fixture.checkout, index: written.index, copies,
      takeIn: createWriteBackPort(fixture.context) });
    expect(checked.settled.map(each => each.settlement.kind)).toEqual(["deleted"]);
    for (const copy of copies) expect(await readStat(join(fixture.checkout, copy.copy))).toBeNull();
    const history = await fixture.store.history({ reference: fixture.entry.reference });
    expect(history.status === "ok" ? history.result.map(each => each.content) : history)
      .toEqual(["opening\nhand edit\nclosing\n", "opening\nbase\nclosing\n"]);
    expect(await fixture.file()).toBe("opening\nhand edit\nclosing\n");
  });

  it("keeps a landed write pending when read-back is refused and continues once the store is repaired", async () => {
    fixture = await createWriteBackFixture();
    const current = fixture;
    const incoming = "opening\nhand edit\nclosing\n";
    await fixture.edit(incoming);
    const write = fixture.store.write.bind(fixture.store);
    vi.spyOn(fixture.store, "write").mockImplementationOnce(async input => {
      const result = await write(input);
      if (result.status !== "ok") throw new Error("expected a landed edit");
      await current.produce("namespace-corrupt");
      return result;
    });
    const held = await writeBackFile(fixture.context, fixture.index, fixture.request);
    expect(held.result).toMatchObject({ answer: "pending", entry: { pending: true, persisted: null } });
    expect(await fixture.file()).toContain("hand edit");
    expect(fixture.reports).toMatchObject([{ mark: { reason: expect.stringContaining("edit landed, but read-back failed") } }]);
    await fixture.repair("namespace-corrupt");
    const record = await fixture.store.read({ reference: fixture.entry.reference });
    expect(record.status === "ok" ? record.result.content : record).toBe(incoming);
    const landed = await writeBackFile(fixture.context, held.index, { ...fixture.request, entry: held.result.entry });
    expect(landed.result.answer).toBe("taken-in");
    expect(parseStampedFile(await fixture.file()).content).toBe(incoming);
  });
});
