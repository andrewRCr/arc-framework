/** What a persisted write-back took in: the recording, the kept copy, the entry-ID matcher, and the base selection. */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCountingStore } from "../../../helpers/store/counting-store.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import { stampEntryIds } from "../../../../src/lib/store/concurrency/index.js";
import {
  OwnerIdentitySchema, recordReferences, RecordVersionSchema, type RecordVersion,
} from "../../../../src/lib/store/identity.js";
import { ENTRY_CONFIGS } from "../../../../src/lib/store/kinds/entry-configs.js";
import { createHistoryMemo } from "../../../../src/lib/store/projection/base-recovery.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import type { RecordEntry } from "../../../../src/lib/store/projection/index-schema.js";
import type { ProjectionLocation } from "../../../../src/lib/store/projection/location.js";
import {
  readTakenInCopy, recordWriteBack, removeTakenInCopies, restoreEntryIds, selectPersistedBase, type WriteBackRecording,
} from "../../../../src/lib/store/projection/taken-in.js";

const INBOUND = ENTRY_CONFIGS["work-item/inbound"];
const reference = recordReferences["work-item/inbound"](OwnerIdentitySchema.parse({ type: "work-item", name: "alpha" }));
const v = (name: string): RecordVersion => RecordVersionSchema.parse(name);
const noHistory = createHistoryMemo({ history: () => Promise.reject(new Error("no history read was expected")) });

let location: ProjectionLocation;
beforeEach(async () => {
  const gitDir = await mkdtemp(join(tmpdir(), "arc-projection-taken-in-"));
  location = { gitDir, commonDir: gitDir, primary: true, stateDir: join(gitDir, "arc-projection") };
  await mkdir(location.stateDir);
});
afterEach(async () => { await rm(location.gitDir, { recursive: true, force: true }); });

/** An inbound list holding each entry, as `### [ ] **Title**` headings with their bodies. */
function inbound(...entries: string[]): string {
  return `# Inbound: alpha\n\n## Inbound\n\n${entries.join("\n")}`;
}

/** Stamp IDs as the backend does, from a fixed draw sequence. */
function stamped(content: string, ...draws: number[]): string {
  return stampEntryIds(content, INBOUND, () => draws.shift() ?? 0.999);
}

function entryAt(content: string, version: RecordVersion, persisted: RecordEntry["persisted"] = null): RecordEntry {
  const blob = gitBlobId(content, "sha1");
  return {
    kind: "record", reference, stat: null, written: blob, base: { blob, version }, markers: null, notices: [],
    unshown: [], protected: false, changed: false, pending: false, withheld: false, refused: null, persisted,
    inProgress: null, copies: [],
  };
}

function recording(overrides: Partial<WriteBackRecording> & Pick<WriteBackRecording, "takenIn">): WriteBackRecording {
  const base = inbound("### [ ] **First**\n- _Id:_ `11111111`\n\nfirst\n");
  return {
    location, entry: entryAt(base, v("v1")), stamp: gitBlobId(base, "sha1"), outcome: { kind: "landed", version: v("v2") },
    readBack: null, grammar: INBOUND, format: "sha1", memo: noHistory, ...overrides,
  };
}

describe("what a persisted write-back took in", () => {
  it("records the version written as the content taken in where the read-back differs only by stamped IDs", async () => {
    const takenIn = inbound("### [ ] **First**\n- _Id:_ `11111111`\n\nfirst, edited\n", "### [ ] **Second**\n\nsecond\n");
    const readBack = stamped(takenIn, 0.5);
    expect(readBack).toContain("_Id:_ `80000000`");
    const { entry, released } = await recordWriteBack(recording({ takenIn, readBack: { version: v("v2"), content: readBack } }));
    expect(entry.persisted).toEqual({ stamp: recording({ takenIn }).stamp, takenIn: { kind: "landed", version: v("v2") } });
    expect(released).toEqual([]);
  });

  it("keeps a copy carrying the landed IDs where the store merged, and releases it at a later landing", async () => {
    const takenIn = inbound("### [ ] **First**\n- _Id:_ `11111111`\n\nfirst, edited\n", "### [ ] **Second**\n\nsecond\n");
    const merged = stamped(inbound(
      "### [ ] **First**\n- _Id:_ `11111111`\n\nfirst, edited\nanother writer's line\n", "### [ ] **Second**\n\nsecond\n",
    ), 0.5);
    const first = await recordWriteBack(recording({ takenIn, readBack: { version: v("v2"), content: merged } }));
    const kept = first.entry.persisted?.takenIn;
    if (kept?.kind !== "copy") throw new Error(`expected a kept copy, got ${JSON.stringify(kept)}`);
    const withLandedIds = inbound(
      "### [ ] **First**\n- _Id:_ `11111111`\n\nfirst, edited\n", "### [ ] **Second**\n- _Id:_ `80000000`\n\nsecond\n",
    );
    expect(await readTakenInCopy(location, kept.name)).toBe(withLandedIds);
    expect(kept.blob).toBe(gitBlobId(withLandedIds, "sha1"));

    const later = await recordWriteBack(recording({
      entry: first.entry, stamp: gitBlobId(merged, "sha1"), takenIn: merged,
      outcome: { kind: "landed", version: v("v3") }, readBack: { version: v("v3"), content: merged },
    }));
    expect(later.entry.persisted?.takenIn).toEqual({ kind: "landed", version: v("v3") });
    expect(later.released).toEqual([kept.name]);
    await removeTakenInCopies(location, later.released);
    await expect(readTakenInCopy(location, kept.name)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("gives an entry the ID of the one landed entry its text equals, else of the one sharing its heading", () => {
    const landed = inbound(
      "### [ ] **Task**\n- _Id:_ `aaaaaaaa`\n\nbody A\n", "### [ ] **Task**\n- _Id:_ `bbbbbbbb`\n\nbody B\n",
      "### [ ] **Renamed body**\n- _Id:_ `cccccccc`\n\nold text\n",
      "### [ ] **Twice**\n- _Id:_ `dddddddd`\n\nx\n", "### [ ] **Twice**\n- _Id:_ `eeeeeeee`\n\ny\n",
    );
    const content = inbound(
      "### [ ] **Task**\n\nbody A\n", "### [ ] **Renamed body**\n\nnew text\n", "### [ ] **Twice**\n\nz\n",
    );
    expect(restoreEntryIds(content, landed, INBOUND)).toBe(inbound(
      "### [ ] **Task**\n- _Id:_ `aaaaaaaa`\n\nbody A\n", "### [ ] **Renamed body**\n- _Id:_ `cccccccc`\n\nnew text\n",
      "### [ ] **Twice**\n\nz\n",
    ));
  });

  it("keeps a copy where the record read back is at a version other than the write's, though its content matches", async () => {
    const takenIn = inbound("### [ ] **First**\n- _Id:_ `11111111`\n\nfirst, edited\n");
    const { entry } = await recordWriteBack(recording({ takenIn, readBack: { version: v("v3"), content: takenIn } }));
    const kept = entry.persisted?.takenIn;
    if (kept?.kind !== "copy") throw new Error(`expected a kept copy, got ${JSON.stringify(kept)}`);
    expect(await readTakenInCopy(location, kept.name)).toBe(takenIn);
  });

  it("gives neither of two entries matching one landed entry the same way its ID", () => {
    const landed = inbound(
      "### [ ] **Copied**\n- _Id:_ `aaaaaaaa`\n\nsame\n", "### [ ] **Split**\n- _Id:_ `bbbbbbbb`\n\nwhole\n",
    );
    const content = inbound(
      "### [ ] **Copied**\n\nsame\n", "### [ ] **Copied**\n\nsame\n",
      "### [ ] **Split**\n\nfirst half\n", "### [ ] **Split**\n\nsecond half\n",
    );
    expect(restoreEntryIds(content, landed, INBOUND)).toBe(content);
  });

  it("selects the content taken in as the base of a save carrying the stamp the persisted write-back read", async () => {
    const takenIn = inbound("### [ ] **First**\n- _Id:_ `11111111`\n\nfirst, edited\n");
    const landedAs = await recordWriteBack(recording({ takenIn, readBack: { version: v("v2"), content: takenIn } }));
    const keptAs = await recordWriteBack(recording({ takenIn, readBack: { version: v("v2"), content: `${takenIn}merged\n` } }));
    const stamp = recording({ takenIn }).stamp;
    // The read-back replaces the file, so the index's base moves on while a stale buffer keeps the old stamp.
    const select = (entry: RecordEntry, carried: string) => selectPersistedBase({
      location, entry: { ...entry, base: { blob: gitBlobId(takenIn, "sha1"), version: v("v2") } }, stamp: carried,
      content: `${takenIn}saved again\n`, memo: noHistory,
    });
    expect(await select(landedAs.entry, stamp)).toEqual({ status: "ok", result: { kind: "stored", version: v("v2") } });
    expect(await select(keptAs.entry, stamp)).toEqual({ status: "ok", result: { kind: "copy", content: takenIn } });
    expect(await select(keptAs.entry, gitBlobId(`${takenIn}merged\n`, "sha1"))).toEqual({ status: "ok", result: null });
  });

  it("selects the content a landing took in for a file kept with its stamp after a malformed entry was refused", async () => {
    const refusedEntry = "### [ ] **Second**\n- _Id:_ `22222222`\n- _Created:_ not a date\n\nsecond\n";
    const baseEntry = "### [ ] **Second**\n- _Id:_ `22222222`\n\nsecond\n";
    const base = inbound("### [ ] **First**\n- _Id:_ `11111111`\n\nfirst\n", baseEntry);
    const file = inbound("### [ ] **First**\n- _Id:_ `11111111`\n\nfirst, edited\n", refusedEntry);
    const takenIn = file.replace(refusedEntry, baseEntry);
    const entry = entryAt(base, v("v1"));
    const recorded = await recordWriteBack(recording({
      entry, stamp: entry.base.blob, takenIn, readBack: { version: v("v2"), content: takenIn },
    }));
    expect(await selectPersistedBase({ location, entry: recorded.entry, stamp: entry.base.blob, content: file, memo: noHistory }))
      .toEqual({ status: "ok", result: { kind: "stored", version: v("v2") } });
    expect(takenIn.replace(baseEntry, refusedEntry)).toBe(file);
  });

  it("records a landing that filed conflicts or refused an entry, and leaves the fields after any other outcome", async () => {
    const takenIn = inbound("### [ ] **First**\n- _Id:_ `11111111`\n\nfirst, edited\n");
    const conflicted = await recordWriteBack(recording({ takenIn, readBack: { version: v("v2"), content: `${takenIn}theirs\n` } }));
    expect(conflicted.entry.persisted?.takenIn.kind).toBe("copy");
    const before = { ...entryAt(takenIn, v("v1")), persisted: { stamp: gitBlobId("older", "sha1"), takenIn: { kind: "landed" as const, version: v("v1") } } };
    for (const kind of ["refused", "deferred", "clashed", "skipped"] as const) {
      expect(await recordWriteBack(recording({ entry: before, takenIn, outcome: { kind }, readBack: null })))
        .toEqual({ entry: before, released: [] });
    }
  });

  it("drops the record's history memo at a persisted write-back, so a later read finds the version written", async () => {
    const fixture = createReferenceFixture();
    const counting = createCountingStore(fixture.store);
    const memo = createHistoryMemo(counting.store);
    const document = fixture.reference("cohort/document");
    const put = async (content: string, expected: RecordVersion | null): Promise<RecordVersion> => {
      const result = await fixture.store.write({
        action: "put", reference: document, content, expected, provenance: { verb: "save", lifecycleAction: "save" },
      });
      if (result.status !== "ok" || result.result.version === undefined) throw new Error("the fixture write was refused");
      return result.result.version;
    };
    const first = await put("one\n", null);
    const entry = { ...entryAt("one\n", first), reference: document };
    await memo.read(document);
    await recordWriteBack(recording({ entry, grammar: undefined, memo, takenIn: "two\n", outcome: { kind: "deferred" }, readBack: null }));
    await memo.read(document);
    const historyReads = () => counting.count({ operation: "history", input: { reference: document } });
    expect(historyReads()).toBe(1);
    const written = await put("two\n", first);
    await recordWriteBack(recording({
      entry, grammar: undefined, memo, takenIn: "two\n", outcome: { kind: "landed", version: written },
      readBack: { version: written, content: "two\n" },
    }));
    const after = await memo.read(document);
    expect(historyReads()).toBe(2);
    expect(after.status === "ok" ? after.result.map((each) => each.version) : []).toContain(written);
  });

  it("selects for a file other than Markdown the closer of a kept copy and the version the read-back laid", async () => {
    const fixture = createReferenceFixture();
    const document = fixture.reference("cohort/document");
    const put = async (content: string, expected: RecordVersion | null): Promise<RecordVersion> => {
      const result = await fixture.store.write({
        action: "put", reference: document, content, expected, provenance: { verb: "save", lifecycleAction: "save" },
      });
      if (result.status !== "ok" || result.result.version === undefined) throw new Error("the fixture write was refused");
      return result.result.version;
    };
    const takenIn = "alpha\nbeta, edited\ngamma\n";
    const merged = "alpha\nbeta, edited\ngamma\ndelta from another writer\nepsilon\n";
    const landed = await put(merged, await put("alpha\nbeta\ngamma\n", null));
    const memo = createHistoryMemo(fixture.store);
    const entry = { ...entryAt("alpha\nbeta\ngamma\n", v("v1")), reference: document };
    const recorded = await recordWriteBack(recording({
      entry, stamp: entry.base.blob, takenIn, grammar: undefined, memo,
      outcome: { kind: "landed", version: landed }, readBack: { version: landed, content: merged },
    }));
    const readBackLaid = { ...recorded.entry, base: { blob: gitBlobId(merged, "sha1"), version: landed } };
    const select = (content: string) => selectPersistedBase({ location, entry: readBackLaid, stamp: null, content, memo });
    expect(await select(`${takenIn}a stale buffer's line\n`)).toEqual({ status: "ok", result: { kind: "copy", content: takenIn } });
    expect(await select(`${merged}a fresh line\n`)).toEqual({ status: "ok", result: { kind: "stored", version: landed } });
  });
});
