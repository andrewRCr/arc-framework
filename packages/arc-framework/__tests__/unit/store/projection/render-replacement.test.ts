/** Every guarded replacement retains stored conflicts and yields safely when rendering cannot read them. */
import { afterEach, describe, expect, it } from "vitest";
import { createWriteBackFixture, refreshWriteBackFixture } from "../../../helpers/store/projection/write-back-fixture.js";
import { createCheckoutFixture } from "../../../helpers/store/projection/checkout-fixture.js";
import { createMarkerFixture } from "../../../helpers/store/projection/marker-fixture.js";
import { createStoredConflictFixture } from "../../../helpers/store/projection/stored-conflict-fixture.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { stageRecordFile } from "../../../../src/lib/store/projection/staging.js";
import { createRecordRenderer } from "../../../../src/lib/store/projection/record-render.js";
import { guardReplacement } from "../../../../src/lib/store/projection/replace-guard.js";
import { readReference } from "../../../../src/lib/store/projection/change-detection.js";
import { swapBatch } from "../../../../src/lib/store/projection/swap.js";
import { createWriteBackPort } from "../../../../src/lib/store/projection/write-back.js";
import { writeBackFile } from "../../../../src/lib/store/projection/read-back.js";
import { parseStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { createHistoryMemo } from "../../../../src/lib/store/projection/base-recovery.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";
import type { Store } from "../../../../src/lib/store/contract.js";

const fixtures: { dispose(): Promise<void> }[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose())); });

function unreadableConflicts(store: Store) {
  let broken = true;
  const refusal = StoreRefusalSchema.parse({ code: "namespace-corrupt", class: "terminal", namespace: "memory",
    condition: "Conflict data is unreadable.", remedy: { text: "Repair conflict data and refresh again." } });
  const read: Store["read"] = input => broken && input.reference.kind.endsWith("/conflict-record")
    ? Promise.resolve({ status: "refused", refusal }) : store.read(input);
  const wrapped = new Proxy(store, { get(target, key) {
    if (key === "read") return read;
    const value: unknown = Reflect.get(target, key, target);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  return { store: wrapped, repair: () => { broken = false; }, breakRead: () => { broken = true; } };
}

describe("rendered replacements", () => {
  it("restages an edit taken in by the guard with stored markers and notices", async () => {
    const base = "left first\nbase first\nright first\n\nspare\n\nleft second\nbase second\nright second\n\ntail\n";
    const fixture = await createStoredConflictFixture({ base,
      current: base.replace("base first", "stored first").replace("base second", "stored second"),
      incoming: base.replace("base first", "incoming first").replace("base second", "incoming second") });
    fixtures.push(fixture);
    success(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.record.version,
      content: fixture.record.content.replace("left first", "later left first"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    await fixture.edit(base.replace("tail", "hand tail"));
    const index = await refreshWriteBackFixture(fixture, fixture.index);
    const file = parseStampedFile(await fixture.file());
    expect(file.content).toContain("hand tail");
    expect(file.content).toContain("incoming second");
    expect(file.notices).toHaveLength(1);
    expect(index.entries[fixture.path]).toMatchObject({ markers: { sets: [{ shows: "stored" }] }, notices: [expect.any(Object)], unshown: [] });
    expect(success(await fixture.store.read({ reference: fixture.entry.reference })).content).toContain("hand tail");
  });

  it("retains a landed take-in and the original file when reading its new conflict refuses, then retries", async () => {
    const fixture = await createWriteBackFixture();
    fixtures.push(fixture);
    success(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.entry.base.version,
      content: "opening\nstored\nclosing\n", provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const incoming = "opening\nincoming\nclosing\n";
    await fixture.edit(incoming);
    const before = await fixture.file();
    const boundary = unreadableConflicts(fixture.store);
    const context = { ...fixture.context, store: boundary.store, memo: createHistoryMemo(boundary.store) };
    const held = await writeBackFile(context, fixture.index, fixture.request);
    expect(held.result).toMatchObject({ answer: "pending", entry: { base: fixture.entry.base, written: fixture.entry.written,
      pending: true, persisted: { stamp: fixture.entry.base.blob }, unshown: [expect.any(Object)] } });
    expect(await fixture.file()).toBe(before);
    expect(fixture.reports).toContainEqual(expect.objectContaining({ mark: expect.objectContaining({ reason: expect.stringContaining("read-back rendering failed") }) }));
    expect(success(await fixture.store.read({ reference: fixture.entry.reference })).conflicts).toHaveLength(1);
    boundary.repair();
    const retry = await writeBackFile(context, held.index, { ...fixture.request, entry: held.result.entry });
    expect(retry.result.answer).toBe("taken-in");
    expect(parseStampedFile(await fixture.file()).content).toContain("stored\n=======\nincoming");
    expect(retry.result.entry.unshown).toEqual([]);
  });
  it("sends an unchanged drawn blank-line side without treating it as a resolution in progress", async () => {
    const fixture = await createStoredConflictFixture({ base: "base\n", current: "stored\n", incoming: "\n" });
    fixtures.push(fixture);
    const index = await refreshWriteBackFixture(fixture, fixture.index);
    const entry = index.entries[fixture.path];
    if (entry?.kind !== "record") throw new Error("Rendered entry missing");
    expect(parseStampedFile(await fixture.file()).content).toContain("=======\n\n>>>>>>>");
    const sent = await createWriteBackPort(fixture.context)({ ...fixture.request, entry, base: { kind: "stamp", stamp: entry.base.blob } });
    expect(sent.answer).toBe("taken-in");
    expect(success(await fixture.store.read({ reference: entry.reference })).conflicts).toEqual(fixture.record.conflicts);
  });

  it("draws a stored conflict beside a checkout clash and notices the one on its span", async () => {
    const base = "head\nbase first\nbetween one\nbetween two\nbase second\nbetween three\nbetween four\nbase third\nfoot\n";
    const incoming = base.replace("base first", "first edit");
    const fixture = await createCheckoutFixture({ base, current: base + "remote note\n", incoming });
    fixtures.push(fixture);
    const current = fixture.record.content.replace("first edit", "remote edit").replace("base second", "stored second");
    success(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.record.version, content: current,
      provenance: { verb: "edit", lifecycleAction: "edit" } }));
    success(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.record.version,
      content: fixture.record.content.replace("first edit", "other first").replace("base second", "incoming second"),
      provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const record = success(await fixture.store.read({ reference: fixture.entry.reference }));
    expect(record.conflicts).toHaveLength(2);
    await fixture.edit(incoming.replace("first edit", "next edit"));
    const result = await writeBackFile(fixture.context, fixture.index, fixture.request);
    expect(result.result.answer).toBe("clashed");
    const file = parseStampedFile(await fixture.file());
    expect(file.content).toContain("next edit");
    expect(file.content).toContain("incoming second");
    expect(file.notices).toHaveLength(1);
    expect(result.result.entry.markers?.sets.map(set => set.shows)).toEqual(["checkout", "stored"]);
    expect(result.result.entry.unshown).toEqual([]);
    expect(success(await fixture.store.read({ reference: fixture.entry.reference }))).toEqual(record);
  });

  it("holds a malformed entry undrawn with fresh conflicts recorded, then draws after repair", async () => {
    const base = "# Inbox\n\n## Errand\n\n### [ ] **First**\n\n- _Id:_ `11111111`\n\nbase first\n\n"
      + "### [ ] **Second**\n\n- _Id:_ `22222222`\n\nbase second\n";
    const fixture = await createMarkerFixture({ kind: "personal/inbox", base,
      current: base.replace("base first", "stored first"), incoming: base.replace("base first", "incoming first") });
    fixtures.push(fixture);
    success(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.record.version,
      content: fixture.record.content.replace("base second", "stored second"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    success(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.record.version,
      content: fixture.record.content.replace("base second", "incoming second"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
    const damaged = fixture.content.replace(/^>>>>>>>[^\n]*\n?/mu, "");
    await fixture.edit(damaged);
    const before = await fixture.file();
    const held = await writeBackFile(fixture.context, fixture.index, fixture.request);
    expect(held.result.answer).toBe("refused");
    expect(await fixture.file()).toBe(before);
    expect(held.result.entry.unshown).toHaveLength(1);
    await fixture.edit(fixture.content);
    const repaired = await writeBackFile(fixture.context, held.index, { ...fixture.request, entry: held.result.entry });
    expect(repaired.result.answer).toBe("taken-in");
    expect(parseStampedFile(await fixture.file()).content).toContain("incoming second");
    expect(repaired.result.entry.markers?.sets).toHaveLength(2);
    expect(repaired.result.entry.unshown).toEqual([]);
  });

  it("holds a successful guard take-in when restaging cannot read a conflict, then replaces after repair", async () => {
    const base = "left\nbase\nright\n\ntail\n";
    const fixture = await createStoredConflictFixture({ base, current: base.replace("base", "stored"), incoming: base.replace("base", "incoming") });
    fixtures.push(fixture);
    const boundary = unreadableConflicts(fixture.store);
    boundary.repair();
    const memo = createHistoryMemo(boundary.store);
    const renderer = createRecordRenderer({ store: boundary.store, memo });
    const context = { ...fixture.context, store: boundary.store, memo, renderer };
    const staged = success(await stageRecordFile({ ...context, checkout: fixture.checkout, path: fixture.path,
      record: fixture.record, replacing: fixture.entry.base.blob }));
    boundary.breakRead();
    await fixture.edit(base.replace("tail", "hand tail"));
    const before = await fixture.file();
    const input = { ...context, checkout: fixture.checkout, path: fixture.path, entry: fixture.entry, staged,
      reference: await readReference(fixture.checkout), takeIn: createWriteBackPort(context) };
    const held = await guardReplacement(input);
    expect(held).toMatchObject({ kind: "unreplaced", cause: "refresh-refused", entry: { pending: true, base: fixture.entry.base } });
    expect(held.entry.persisted).not.toBeNull();
    expect(await fixture.file()).toBe(before);
    expect(success(await fixture.store.read({ reference: fixture.entry.reference })).content).toContain("hand tail");
    boundary.repair();
    const retried = await guardReplacement({ ...input, entry: held.entry });
    expect(retried.kind).toBe("replace");
    if (retried.kind !== "replace") throw new Error("Replacement still held");
    await swapBatch({ ...context, checkout: fixture.checkout, index: { ...fixture.index, entries: { [fixture.path]: retried.entry } },
      files: [{ path: fixture.path, replace: retried }], readBack: false, takeIn: input.takeIn });
    const file = parseStampedFile(await fixture.file());
    expect(file.content).toContain("hand tail");
    expect(file.content).toContain("stored\n=======\nincoming");
  });

});
