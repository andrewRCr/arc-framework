/** The `history` refusal a clone missing a history ref returns, and the arms recovery and a stopped replacement take. */
import { describe, expect, it } from "vitest";
import { createHistoryRefusingStore } from "../../../helpers/store/projection/history-refusing-store.js";
import { createReferenceFixture } from "../../../helpers/store/reference-fixture.js";
import type { Store } from "../../../../src/lib/store/contract.js";
import type { RecordReference, RecordVersion } from "../../../../src/lib/store/identity.js";
import { createHistoryMemo, recoverBase } from "../../../../src/lib/store/projection/base-recovery.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import type { RecordEntry } from "../../../../src/lib/store/projection/index-schema.js";
import { readStamplessFile } from "../../../../src/lib/store/projection/stampless.js";
import { HistoryRefSchema, StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";

/** Write the record's versions oldest first, and return its stored reference and versions. */
async function seeded(store: Store, reference: RecordReference, ...contents: string[]) {
  const versions: RecordVersion[] = [];
  for (const content of contents) {
    const result = await store.write({
      action: "put", reference, content, expected: versions.at(-1) ?? null, provenance: { verb: "save", lifecycleAction: "save" },
    });
    if (result.status !== "ok" || result.result.version === undefined) throw new Error("the fixture write was refused");
    versions.push(result.result.version);
  }
  const read = await store.read({ reference });
  if (read.status !== "ok") throw new Error("the fixture read was refused");
  return { stored: read.result.reference, versions };
}

/** The entry of a file rendered from `content` at `version`. */
function entryAt(content: string, version: RecordVersion, persisted: RecordEntry["persisted"] = null, inProgress: RecordEntry["inProgress"] = null): RecordEntry {
  const fixture = createReferenceFixture();
  const blob = gitBlobId(content, "sha1");
  return {
    kind: "record", reference: fixture.reference("cohort/document"), stat: null, written: blob, base: { blob, version },
    markers: null, notices: [], unshown: [], protected: false, changed: false, pending: false, withheld: false,
    refused: null, persisted, inProgress, copies: [],
  };
}

describe("a history refusal", () => {
  it("refuses history for a named record with a history ref that parses, and passes every other call through", async () => {
    const fixture = createReferenceFixture();
    const named = await seeded(fixture.store, fixture.reference("cohort/document", "one"), "one\n");
    const other = await seeded(fixture.store, fixture.reference("cohort/document", "two"), "two\n");
    const wrapped = createHistoryRefusingStore(fixture.store, [named.stored]);
    const refused = await wrapped.store.history({ reference: named.stored });
    if (refused.status !== "refused") throw new Error("expected the named record's history to refuse");
    expect(StoreRefusalSchema.parse(refused.refusal)).toMatchObject({ code: "state-unresolvable", class: "recoverable" });
    const refs = refused.refusal.code === "state-unresolvable" ? refused.refusal.historyRefs : [];
    expect(refs).toEqual([`refs/arc/history/cohort/${named.stored.owner.type === "cohort" ? named.stored.owner.uid : ""}`]);
    expect(refs.map((ref) => HistoryRefSchema.safeParse(ref).success)).toEqual([true]);
    expect(await wrapped.store.history({ reference: other.stored })).toEqual(await fixture.store.history({ reference: other.stored }));
    expect(await wrapped.store.read({ reference: named.stored })).toEqual(await fixture.store.read({ reference: named.stored }));
    expect([wrapped.calls("history"), wrapped.calls("read"), wrapped.calls("pull")]).toEqual([2, 1, 0]);
  });

  it("recovers a base from the index's version and the content taken in alone, pulling nothing", async () => {
    const fixture = createReferenceFixture();
    const { stored, versions: [older, indexed] } = await seeded(fixture.store, fixture.reference("cohort/document"), "a\nb\n", "a\nc\n");
    if (older === undefined || indexed === undefined) throw new Error("expected two versions");
    const wrapped = createHistoryRefusingStore(fixture.store, [stored]);
    const memo = createHistoryMemo(wrapped.store);
    const copies: Record<string, string> = { near: "a\nlost stamp\n", far: "x\ny\n" };
    const recover = (persisted: RecordEntry["persisted"]) => recoverBase({
      content: "a\nlost stamp, edited\n", entry: { ...entryAt("a\nc\n", indexed, persisted), reference: stored }, format: "sha1",
      memo, readCopy: (name) => Promise.resolve(copies[name] ?? ""),
    });
    const stamp = gitBlobId("a\nc\n", "sha1");
    const copy = (name: string): RecordEntry["persisted"] => ({ stamp, takenIn: { kind: "copy", name, blob: gitBlobId(copies[name] ?? "", "sha1") } });
    expect(await recover(null)).toEqual({ status: "ok", result: { kind: "stored", version: indexed } });
    expect(await recover(copy("near"))).toEqual({ status: "ok", result: { kind: "copy", content: copies.near } });
    expect(await recover(copy("far"))).toEqual({ status: "ok", result: { kind: "stored", version: indexed } });
    expect(await recover({ stamp, takenIn: { kind: "landed", version: older } }))
      .toEqual({ status: "ok", result: { kind: "stored", version: older } });
    expect([wrapped.calls("history"), wrapped.calls("pull")]).toEqual([1, 0]);
  });

  it("keeps a file matching neither version of a replacement in progress pending, sending and pulling nothing", async () => {
    const fixture = createReferenceFixture();
    const { stored, versions: [replaced, replacing] } = await seeded(fixture.store, fixture.reference("cohort/document"), "old\n", "new\n");
    if (replaced === undefined || replacing === undefined) throw new Error("expected two versions");
    const wrapped = createHistoryRefusingStore(fixture.store, [stored]);
    const entry = {
      ...entryAt("new\n", replacing, null, { replaces: { blob: gitBlobId("old\n", "sha1"), version: replaced }, copy: null }),
      reference: stored,
    };
    const read = await readStamplessFile({ entry, text: "neither\n", mtimeNs: 0n, format: "sha1", memo: createHistoryMemo(wrapped.store) });
    expect(read).toMatchObject({ status: "ok", result: { kind: "pending", refusal: { code: "state-unresolvable" } } });
    expect([wrapped.calls("write"), wrapped.calls("batch"), wrapped.calls("pull")]).toEqual([0, 0, 0]);
  });
});
