/** Own-path callers report restaging failures after accepting an intervening save. */
import { afterEach, describe, expect, it } from "vitest";
import { createWriteBackFixture } from "../../../helpers/store/projection/write-back-fixture.js";
import { createCheckoutFixture } from "../../../helpers/store/projection/checkout-fixture.js";
import { success } from "../../../helpers/store/suite-tools.js";
import { parseStampedFile } from "../../../../src/lib/store/projection/stamp.js";
import { writeBackFile } from "../../../../src/lib/store/projection/read-back.js";
import { createHistoryMemo } from "../../../../src/lib/store/projection/base-recovery.js";
import { gitBlobId } from "../../../../src/lib/store/projection/blob-id.js";
import { StoreRefusalSchema } from "../../../../src/lib/store/refusal.js";
import type { Store } from "../../../../src/lib/store/contract.js";

const fixtures: { dispose(): Promise<void> }[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose())); });

describe("restaging refusal reports", () => {
  it.each(["read-back", "checkout drawing"] as const)("keeps fresh conflict evidence and the remedy through %s", async mode => {
    const base = "opening\nbase first\nseparation one\nseparation two\nbase tail\nclosing\n";
    const incoming = base.replace("base first", "first edit");
    const fixture = mode === "read-back" ? await createWriteBackFixture({ content: base })
      : await createCheckoutFixture({ base, current: base + "remote note\n", incoming });
    fixtures.push(fixture);
    if (mode === "read-back") {
      success(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: fixture.entry.base.version,
        content: base.replace("base first", "stored first"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
      await fixture.edit(incoming);
    } else {
      const current = success(await fixture.store.read({ reference: fixture.entry.reference }));
      success(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: current.version,
        content: current.content.replace("first edit", "stored first"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
      success(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: current.version,
        content: current.content.replace("first edit", "other first"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
      await fixture.edit(incoming.replace("first edit", "next first"));
    }
    const refusal = StoreRefusalSchema.parse({ code: "namespace-corrupt", class: "terminal", namespace: "memory",
      condition: "Restaging conflict data is unreadable.", remedy: { text: "Repair conflict data and refresh again." } });
    let conflictReads = 0, writes = 0, lateBytes = "", faultEnabled = true;
    const read: Store["read"] = async input => {
      const conflict = input.reference.kind.endsWith("/conflict-record");
      if (conflict && ++conflictReads > 1 && faultEnabled) return { status: "refused", refusal };
      const result = await fixture.store.read(input);
      if (conflict && conflictReads === 1) {
        const record = success(await fixture.store.read({ reference: fixture.entry.reference }));
        await fixture.edit(record.content.replace("base tail", "late tail"), gitBlobId(record.content, "sha1"));
        lateBytes = await fixture.file();
      }
      return result;
    };
    const batch: Store["batch"] = async input => {
      const record = success(await fixture.store.read({ reference: fixture.entry.reference }));
      const result = await fixture.store.batch(input);
      if (++writes === (mode === "read-back" ? 2 : 1)) {
        success(await fixture.store.write({ action: "put", reference: fixture.entry.reference, expected: record.version,
          content: record.content.replace("base tail", "racing tail"), provenance: { verb: "edit", lifecycleAction: "edit" } }));
      }
      return result;
    };
    const store = new Proxy(fixture.store, { get(target, key) {
      if (key === "read") return read;
      if (key === "batch") return batch;
      const value: unknown = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    const context = { ...fixture.context, store, memo: createHistoryMemo(store) };
    const result = await writeBackFile(context, fixture.index, fixture.request);
    const current = success(await fixture.store.read({ reference: fixture.entry.reference }));
    expect(current.conflicts).toHaveLength(2);
    expect(result.result.entry).toMatchObject({ pending: true, base: fixture.entry.base, written: fixture.entry.written });
    expect(result.result.entry.persisted).not.toBeNull();
    expect(await fixture.file()).toBe(lateBytes);
    expect(result.result.entry.unshown).toEqual(current.conflicts);
    expect(fixture.reports).toContainEqual(expect.objectContaining({ path: fixture.path, copy: null,
      mark: expect.objectContaining({ reason: expect.stringContaining(refusal.condition), remedy: refusal.remedy }) }));
    faultEnabled = false;
    const retry = await writeBackFile(context, result.index, { ...fixture.request, entry: result.result.entry });
    expect(retry.result.answer).toBe("taken-in");
    expect(retry.result.entry.unshown).toEqual([]);
    expect(retry.result.entry.markers?.sets).toHaveLength(2);
    expect(parseStampedFile(await fixture.file()).content).toContain("late tail");
  });
});
