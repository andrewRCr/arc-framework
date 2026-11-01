/** Aside copies over a seeded projection, each made as the swap makes it: the file renamed aside, a new one linked in. */
import { link, mkdir, readFile, rename, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { seedProjection } from "../../../helpers/store/projection/seeded-projection.js";
import { removeGitBackedDirs } from "../../../helpers/temp-repo.js";
import { nameAsideFile } from "../../../../src/lib/store/projection/aside.js";
import {
  recordWriteBackSent, settleAsideCopy, type AsideCopySettling,
} from "../../../../src/lib/store/projection/aside-copies.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { readStat } from "../../../../src/lib/store/projection/change-detection.js";
import type { AsideCopyRecord, RecordEntry } from "../../../../src/lib/store/projection/index-schema.js";
import { renderStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { deleteAsideCopy } from "../../../../src/lib/store/projection/stampless.js";
import { stageRecordFile } from "../../../../src/lib/store/projection/staging.js";
import type { TakeInPort, TakeInRequest } from "../../../../src/lib/store/projection/take-in-port.js";

const directories: string[] = [];
afterEach(async () => { await removeGitBackedDirs(directories.splice(0)); });

const PATH = ".arc/backlog/planned/one/cohort-one.md";
const WRITER = { pid: process.pid, processInstance: "copies-test", processScope: "pid:[copies-test]" };
const PROVENANCE = { verb: "save", lifecycleAction: "save" } as const;

/** A take-in that refuses whatever reaches it, so a copy that reaches it is kept. */
const refusing: TakeInPort = async (request) => ({
  answer: "refused", entry: request.entry, mark: { reason: "test-refusal", remedy: { text: "Nothing to do; a test refused it." } },
});

/** A take-in that lands whatever reaches it whole, answering what it read. */
const takingIn: TakeInPort = async (request) => {
  const location = join(request.checkout, request.copy ?? request.path);
  const stat = await readStat(location);
  if (stat === null) throw new Error("nothing to take in");
  return { answer: "taken-in", entry: request.entry, read: { stat, blob: gitBlobId(await readFile(location), "sha1") } };
};

/**
 * A projected file swapped as a refresh swaps it: the record's next version stored, the file renamed into the aside
 * folder, and the staged next version hard-linked onto its path, with the entry and copy record the swap writes.
 */
async function swapped(path = PATH, contents: readonly [string, string] = ["# Cohort: one\n\nBody.\n", "# Cohort: one\n\nBody, refreshed.\n"]) {
  const fixture = createReferenceFixture();
  const reference = fixture.reference("cohort/document", "one");
  const put = await fixture.store.write({ action: "put", reference, content: contents[0], expected: null, provenance: PROVENANCE });
  if (put.status !== "ok") throw new Error("the fixture write was refused");
  const seeded = await seedProjection({ store: fixture.store, files: [{ reference, path }] });
  directories.push(seeded.checkout);
  const laid = seeded.index.entries[path];
  if (laid?.kind !== "record") throw new Error("expected the file's record entry");
  const next = await fixture.store.write({
    action: "put", reference, content: contents[1], expected: laid.base.version, provenance: PROVENANCE,
  });
  if (next.status !== "ok") throw new Error("the fixture write was refused");
  const record = await fixture.store.read({ reference });
  if (record.status !== "ok") throw new Error("the fixture read was refused");
  const file = join(seeded.checkout, path);
  const name = nameAsideFile({ path, base: laid.base.blob, writer: WRITER, role: "aside" });
  const aside = join(seeded.checkout, name);
  await mkdir(dirname(aside), { recursive: true });
  await rename(file, aside);
  const staged = await stageRecordFile({ checkout: seeded.checkout, path, record: record.result, replacing: laid.base.blob, writer: WRITER, format: "sha1" });
  await link(join(seeded.checkout, staged.location), file);
  const copy: AsideCopyRecord = { name, moving: laid.written, linked: staged.written, writeBackSent: false, landed: null };
  const entry: RecordEntry = { ...laid, base: staged.base, written: staged.written, stat: await readStat(file), copies: [copy] };
  const settle = (takeIn: TakeInPort, overrides: Partial<AsideCopySettling> = {}) => settleAsideCopy({
    checkout: seeded.checkout, path, entry, copy, format: "sha1", takeIn, writer: WRITER, ...overrides,
  });
  return { checkout: seeded.checkout, laid, entry, copy, file, aside, settle };
}

describe("an aside copy", () => {
  it("holding the blob its swap was moving, or the one it held when its own take-in landed, is deleted without the port", async () => {
    const unedited = await swapped();
    expect(await unedited.settle(refusing)).toEqual({ kind: "deleted", entry: { ...unedited.entry, copies: [] } });
    expect(await readStat(unedited.aside)).toBeNull();

    const landed = await swapped();
    const saved = renderStampedFile({ content: "# Cohort: one\n\nBody, saved into the copy.\n", stamp: landed.laid.base.blob });
    await writeFile(landed.aside, saved);
    const copy = { ...landed.copy, landed: gitBlobId(saved, "sha1") };
    expect(await landed.settle(refusing, { copy, entry: { ...landed.entry, copies: [copy] } }))
      .toEqual({ kind: "deleted", entry: { ...landed.entry, copies: [] } });
    expect(await readStat(landed.aside)).toBeNull();
  });

  it("holding an edit is taken in while its path holds what its swap linked, and kept, never sent, once a save moved the path on", async () => {
    const saveInto = (copy: { aside: string; laid: RecordEntry }) => writeFile(copy.aside, renderStampedFile({
      content: "# Cohort: one\n\nBody, saved into the copy.\n", stamp: copy.laid.base.blob,
    }));
    const unmoved = await swapped();
    await saveInto(unmoved);
    expect(await unmoved.settle(takingIn)).toEqual({ kind: "deleted", entry: { ...unmoved.entry, copies: [] } });

    const moved = await swapped();
    await saveInto(moved);
    await rm(moved.file);
    await writeFile(moved.file, renderStampedFile({ content: "# Cohort: one\n\nA later save.\n", stamp: moved.entry.base.blob }));
    expect(await moved.settle(refusing)).toEqual({ kind: "moved-on", entry: moved.entry, path: PATH, copy: moved.copy.name });
    expect(await readStat(moved.aside)).not.toBeNull();
  });

  it("reads an absent path as not moved on until a write-back of it is sent since the swap, and a link there as moved on", async () => {
    const save = (copy: { aside: string; laid: RecordEntry }) => writeFile(copy.aside, renderStampedFile({
      content: "# Cohort: one\n\nBody, saved into the copy.\n", stamp: copy.laid.base.blob,
    }));
    const absent = await swapped();
    await save(absent);
    await rm(absent.file);
    expect(await absent.settle(takingIn)).toEqual({ kind: "deleted", entry: { ...absent.entry, copies: [] } });

    const sent = await swapped();
    await save(sent);
    await rm(sent.file);
    const copy = { ...sent.copy, writeBackSent: true };
    const entry = { ...sent.entry, copies: [copy] };
    expect(await sent.settle(refusing, { copy, entry })).toEqual({ kind: "moved-on", entry, path: PATH, copy: copy.name });

    const linked = await swapped();
    await save(linked);
    await rm(linked.file);
    await symlink(linked.aside, linked.file);
    expect(await linked.settle(refusing)).toMatchObject({ kind: "moved-on" });
  });

  it("is marked when a write-back of its path is sent, all but the copy taken in, and deleting one clears its record", async () => {
    const { checkout, entry, copy, laid } = await swapped();
    const another = (): AsideCopyRecord => ({ ...copy, name: nameAsideFile({ path: PATH, base: laid.base.blob, writer: WRITER, role: "aside" }) });
    const [older, newer] = [another(), another()];
    const marked = recordWriteBackSent({ ...entry, copies: [older, copy, newer] }, copy.name);
    expect(marked.copies).toEqual([{ ...older, writeBackSent: true }, copy, { ...newer, writeBackSent: true }]);
    expect(recordWriteBackSent(marked, null).copies.every((record) => record.writeBackSent)).toBe(true);
    const deleted = await deleteAsideCopy({ checkout, path: PATH, entry: marked, copy: older.name });
    expect(deleted.copies.map((record) => record.name)).toEqual([copy.name, newer.name]);
  });

  it("that is a symbolic link, swapped aside from a projected path, is deleted as no edit, its target never read", async () => {
    const { checkout, aside, entry, settle } = await swapped();
    const target = join(checkout, "elsewhere.md");
    await writeFile(target, "# Someone else's notes\n");
    await rm(aside);
    await symlink(target, aside);
    expect(await settle(refusing)).toEqual({ kind: "deleted", entry: { ...entry, copies: [] } });
    expect(await readStat(aside)).toBeNull();
    expect(await readFile(target, "utf8")).toBe("# Someone else's notes\n");
  });

  it("no longer in the aside folder has its record dropped; one still being written, or deferred, is kept", async () => {
    const gone = await swapped();
    await rm(gone.aside);
    expect(await gone.settle(refusing)).toEqual({ kind: "dropped", entry: { ...gone.entry, copies: [] } });

    const writing = await swapped();
    let size = 100n;
    const gate = {
      now: () => BigInt(Date.now()) * 1_000_000n,
      stat: async () => ({ type: "file" as const, size: (size += 1n), mtimeNs: BigInt(Date.now()) * 1_000_000n, ino: 1n }),
      sleep: async () => undefined,
    };
    expect(await writing.settle(refusing, { gate })).toEqual({ kind: "kept", entry: writing.entry, answer: "unsettled" });

    const deferred = await swapped();
    await writeFile(deferred.aside, renderStampedFile({ content: "# Cohort: one\n\nSaved into the copy.\n", stamp: deferred.laid.base.blob }));
    expect(await deferred.settle(async (request) => ({ answer: "deferred", entry: request.entry })))
      .toEqual({ kind: "kept", entry: deferred.entry, answer: "deferred" });
    expect(await readStat(deferred.aside)).not.toBeNull();
  });

  it("holding an edit is taken in against the stamp it carries, or, stampless, the base its name carries", async () => {
    const bases: TakeInRequest["base"][] = [];
    const recording: TakeInPort = async (request) => { bases.push(request.base); return takingIn(request); };
    const markdown = await swapped();
    const stale = gitBlobId("# Cohort: one\n\nAn older body.\n", "sha1");
    await writeFile(markdown.aside, renderStampedFile({ content: "# Cohort: one\n\nA stale save.\n", stamp: stale }));
    await markdown.settle(recording);
    const text = await swapped(".arc/user/andrew/scratch/two.txt", ["plain: text\n", "plain: refreshed\n"]);
    await writeFile(text.aside, "plain: saved into the copy\n");
    await text.settle(recording);
    expect(bases).toEqual([{ kind: "stamp", stamp: stale }, { kind: "blob", blob: text.laid.base.blob }]);
    expect(text.entry.base.blob).not.toBe(text.laid.base.blob);
  });
});
