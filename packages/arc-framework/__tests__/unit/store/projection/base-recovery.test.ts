/** Base-stamp recovery over the reference backend: exact versions, the closest candidate, and the empty base. */
import { beforeEach, describe, expect, it } from "vitest";
import { createCountingStore } from "../../../helpers/store/counting-store.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import type { RecordReference, RecordVersion } from "../../../../src/lib/store/identity.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { createHistoryMemo, recoverBase } from "../../../../src/lib/store/projection/base-recovery.js";
import type { RecordEntry } from "../../../../src/lib/store/projection/index-schema.js";
import type { Store } from "../../../../src/lib/store/contract.js";

let store: Store;
let reference: RecordReference;
let latest: RecordVersion | null;
beforeEach(() => {
  const fixture = createReferenceFixture();
  store = fixture.store;
  reference = fixture.reference("cohort/document");
  latest = null;
});

/** Write each content as the record's next version, oldest first. */
async function versions(...contents: string[]): Promise<RecordVersion[]> {
  const written: RecordVersion[] = [];
  for (const content of contents) {
    const result = await store.write({
      action: "put", reference, content, expected: latest, provenance: { verb: "save", lifecycleAction: "save" },
    });
    if (result.status !== "ok" || result.result.version === undefined) throw new Error("the fixture write was refused");
    latest = result.result.version;
    written.push(latest);
  }
  return written;
}

/** The entry of a file rendered from `content` at `version`. */
function entryAt(content: string, version: RecordVersion, persisted: RecordEntry["persisted"] = null): RecordEntry {
  const blob = gitBlobId(content, "sha1");
  return {
    kind: "record", reference, stat: null, written: blob, base: { blob, version }, markers: null, notices: [],
    unshown: [], protected: false, changed: false, pending: false, withheld: false, refused: null, persisted,
    inProgress: null, copies: [],
  };
}

const noCopy = (name: string): Promise<string> => Promise.reject(new Error(`no copy ${name} was seeded`));

describe("base-stamp recovery", () => {
  it("takes the version whose content equals the file's, though it is older than the index's", async () => {
    const [first, , third] = await versions("one\ntwo\nthree\n", "one\ntwo\nfour\n", "one\nfive\nfour\n");
    if (first === undefined || third === undefined) throw new Error("expected three versions");
    const recovered = await recoverBase({
      content: "one\ntwo\nthree\n", entry: entryAt("one\nfive\nfour\n", third), format: "sha1",
      memo: createHistoryMemo(store), readCopy: noCopy,
    });
    expect(recovered).toEqual({ status: "ok", result: { kind: "stored", version: first } });
  });

  it("takes the closest candidate by line diff, among the index's version and the five newest", async () => {
    const [first, , third] = await versions("a\nb\nc\nd\n", "a\nb\nX\nd\n", "a\nY\nX\nZ\n");
    if (first === undefined || third === undefined) throw new Error("expected three versions");
    const recover = () => recoverBase({
      content: "a\nb\nc\nE\n", entry: entryAt("a\nY\nX\nZ\n", third), format: "sha1",
      memo: createHistoryMemo(store), readCopy: noCopy,
    });
    expect(await recover()).toEqual({ status: "ok", result: { kind: "stored", version: first } });
    await versions(...[4, 5, 6, 7, 8].map((n) => `a\nY\nX\nZ\nn${n}\n`));
    expect(await recover()).toEqual({ status: "ok", result: { kind: "stored", version: third } });
  });

  it("breaks a tie for the content taken in, then for the newer version", async () => {
    const [first, second, third] = await versions("a\nb\nc\n", "a\nb\nd\n", "q\nr\ns\n");
    if (first === undefined || second === undefined || third === undefined) throw new Error("expected three versions");
    const stamp = gitBlobId("a\nb\nd\n", "sha1");
    const recover = (persisted: RecordEntry["persisted"], readCopy = noCopy) => recoverBase({
      content: "a\nb\ne\n", entry: entryAt("q\nr\ns\n", third, persisted), format: "sha1",
      memo: createHistoryMemo(store), readCopy,
    });
    expect(await recover(null)).toEqual({ status: "ok", result: { kind: "stored", version: second } });
    expect(await recover({ stamp, takenIn: { kind: "landed", version: first } }))
      .toEqual({ status: "ok", result: { kind: "stored", version: first } });
    const copy = "a\nb\nf\n";
    const readCopy = (name: string) => (name === "kept" ? Promise.resolve(copy) : noCopy(name));
    expect(await recover({ stamp, takenIn: { kind: "copy", version: first, name: "kept", blob: gitBlobId(copy, "sha1") } }, readCopy))
      .toEqual({ status: "ok", result: { kind: "copy", content: copy } });
  });

  it("takes an empty base for content sharing only blank lines with every candidate", async () => {
    const [, second] = await versions("a\n\nb\n", "c\n\nd\n");
    if (second === undefined) throw new Error("expected two versions");
    expect(await recoverBase({
      content: "x\n\ny\n", entry: entryAt("c\n\nd\n", second), format: "sha1", memo: createHistoryMemo(store),
      readCopy: noCopy,
    })).toEqual({ status: "ok", result: { kind: "empty" } });
  });

  it("reads a record's history once for two of its files in a command, and again once its entry is dropped", async () => {
    const [, second] = await versions("one\n", "two\n");
    if (second === undefined) throw new Error("expected two versions");
    const counting = createCountingStore(store);
    const memo = createHistoryMemo(counting.store);
    const historyReads = () => counting.count({ operation: "history", input: { reference } });
    const recover = (content: string) => recoverBase({
      content, entry: entryAt("two\n", second), format: "sha1", memo, readCopy: noCopy,
    });
    await recover("two\n");
    expect(historyReads()).toBe(0);
    await recover("one\n");
    await recover("one\nmore\n");
    expect(historyReads()).toBe(1);
    memo.drop(reference);
    await recover("one\n");
    expect(historyReads()).toBe(2);
  });
});
