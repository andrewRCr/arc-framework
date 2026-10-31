/** Files other than Markdown: the entry's version as the base, a replacement in progress, and the aside-copy deletion. */
import { lstat, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCountingStore } from "../../../helpers/store/counting-store.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { OwnerIdentitySchema, recordReferences, RecordVersionSchema, type RecordVersion } from "../../../../src/lib/store/identity.js";
import { createHistoryMemo } from "../../../../src/lib/store/projection/base-recovery.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import type { RecordEntry } from "../../../../src/lib/store/projection/index-schema.js";
import { deleteAsideCopy, readStamplessFile } from "../../../../src/lib/store/projection/stampless.js";

const reference = recordReferences["personal/document"](OwnerIdentitySchema.parse({ type: "person", name: "andrew" }), "scratch/notes.txt");
const v = (name: string): RecordVersion => RecordVersionSchema.parse(name);
const noHistory = createHistoryMemo({ history: () => Promise.reject(new Error("no history read was expected")) });
const LONG_AGO = 0n;
const ASIDE_COPY = `.arc/system/.local/projection/aside/user/andrew/scratch/notes.txt/${"a".repeat(40)}.1-x-${"0".repeat(16)}.${"1".repeat(16)}.aside`;

function entryAt(content: string, version: RecordVersion, inProgress: RecordEntry["inProgress"] = null): RecordEntry {
  const blob = gitBlobId(content, "sha1");
  return {
    kind: "record", reference, stat: null, written: blob, base: { blob, version }, markers: null, notices: [],
    unshown: [], protected: false, changed: false, pending: false, withheld: false, refused: null, persisted: null,
    inProgress, copies: [],
  };
}

describe("files other than Markdown", () => {
  it("reads a file restored to an older version as an edit from the entry's version", async () => {
    const entry = entryAt("newer\n", v("v2"));
    expect(await readStamplessFile({ entry, text: "older\n", mtimeNs: LONG_AGO, format: "sha1", memo: noHistory }))
      .toEqual({ status: "ok", result: { kind: "edit", base: entry.base } });
    expect(await readStamplessFile({ entry, text: "newer\r\n", mtimeNs: LONG_AGO, format: "sha1", memo: noHistory }))
      .toEqual({ status: "ok", result: { kind: "unedited" } });
  });

  it("reads the old content a stopped replacement left as unedited, so the replacing version is laid again", async () => {
    const replacing = entryAt("newer\n", v("v2"), {
      replaces: { blob: gitBlobId("older\n", "sha1"), version: v("v1") }, copy: ASIDE_COPY,
    });
    expect(await readStamplessFile({ entry: replacing, text: "older\n", mtimeNs: LONG_AGO, format: "sha1", memo: noHistory }))
      .toEqual({ status: "ok", result: { kind: "unedited" } });
  });

  it("takes the closer of the two versions as the base of content matching neither, reading history once", async () => {
    const fixture = createReferenceFixture();
    const counting = createCountingStore(fixture.store);
    const document = fixture.reference("cohort/document");
    const put = async (content: string, expected: RecordVersion | null): Promise<RecordVersion> => {
      const result = await fixture.store.write({
        action: "put", reference: document, content, expected, provenance: { verb: "save", lifecycleAction: "save" },
      });
      if (result.status !== "ok" || result.result.version === undefined) throw new Error("the fixture write was refused");
      return result.result.version;
    };
    const replaced = await put("a\nb\nc\n", null);
    const replacingVersion = await put("x\ny\nz\n", replaced);
    const entry = { ...entryAt("x\ny\nz\n", replacingVersion, {
      replaces: { blob: gitBlobId("a\nb\nc\n", "sha1"), version: replaced }, copy: ASIDE_COPY,
    }), reference: document };
    const memo = createHistoryMemo(counting.store);
    const readOf = (text: string) => readStamplessFile({ entry, text, mtimeNs: LONG_AGO, format: "sha1", memo });
    expect(await readOf("a\nb\nc\nd\n")).toEqual({
      status: "ok", result: { kind: "edit", base: { blob: gitBlobId("a\nb\nc\n", "sha1"), version: replaced } },
    });
    expect(await readOf("x\ny\nz\nw\n")).toEqual({ status: "ok", result: { kind: "edit", base: entry.base } });
    expect(counting.count({ operation: "history", input: { reference: document } })).toBe(1);
  });

  it("leaves an empty file younger than 50 ms for the next command, and reads one older", async () => {
    const entry = entryAt("content\n", v("v1"));
    const now = 10_000_000_000n;
    const readAt = (mtimeNs: bigint) => readStamplessFile({ entry, text: "", mtimeNs, format: "sha1", memo: noHistory, now: () => now });
    expect(await readAt(now - 49_000_000n)).toEqual({ status: "ok", result: { kind: "wait" } });
    expect(await readAt(now - 50_000_000n)).toEqual({ status: "ok", result: { kind: "edit", base: entry.base } });
  });

  it("clears the in-progress record when its copy is deleted while the file holds what was linked, and not otherwise",
    async () => {
    const checkout = await mkdtemp(join(tmpdir(), "arc-projection-stampless-"));
    try {
      const path = ".arc/user/andrew/scratch/notes.txt";
      const copy = (nonce: string) =>
        `.arc/system/.local/projection/aside/user/andrew/scratch/notes.txt/${"a".repeat(40)}.1-x-${"0".repeat(16)}.${nonce}.aside`;
      const [named, other] = [copy("1".repeat(16)), copy("2".repeat(16))];
      for (const target of [path, named, other]) {
        await mkdir(dirname(join(checkout, target)), { recursive: true });
        await writeFile(join(checkout, target), "content\n");
      }
      const linked = await lstat(join(checkout, path), { bigint: true });
      const record = (name: string) => ({ name, moving: gitBlobId("older\n", "sha1"), linked: gitBlobId("newer\n", "sha1"), writeBackSent: false, landed: null });
      const entry: RecordEntry = {
        ...entryAt("newer\n", v("v2"), { replaces: { blob: gitBlobId("older\n", "sha1"), version: v("v1") }, copy: named }),
        stat: { type: "file", size: linked.size, mtimeNs: linked.mtimeNs, ino: linked.ino },
        copies: [record(named), record(other)],
      };
      const afterOther = await deleteAsideCopy({ checkout, path, entry, copy: other });
      expect(afterOther.copies).toEqual([record(named)]);
      expect(afterOther.inProgress).toEqual(entry.inProgress);
      await expect(lstat(join(checkout, other))).rejects.toMatchObject({ code: "ENOENT" });

      await rename(join(checkout, path), join(checkout, `${path}.moved`));
      await writeFile(join(checkout, path), "a save over the path\n");
      const savedOver = await deleteAsideCopy({ checkout, path, entry: afterOther, copy: named });
      expect(savedOver.copies).toEqual([]);
      expect(savedOver.inProgress).toEqual(entry.inProgress);

      await rm(join(checkout, path));
      await rename(join(checkout, `${path}.moved`), join(checkout, path));
      await writeFile(join(checkout, named), "content\n");
      const cleared = await deleteAsideCopy({ checkout, path, entry: afterOther, copy: named });
      expect(cleared).toMatchObject({ copies: [], inProgress: null });
      await expect(lstat(join(checkout, named))).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(checkout, { recursive: true, force: true });
    }
  });
});
