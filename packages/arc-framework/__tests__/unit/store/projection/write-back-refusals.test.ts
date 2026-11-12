/** Typed backend refusals retain edits and permit retry after their conditions are repaired. */
import { afterEach, describe, expect, it } from "vitest";
import { createWriteBackFixture } from "../../../helpers/store/projection/write-back-fixture.js";
import { createRefusingStore } from "../../../helpers/store/projection/refusing-store.js";
import { createWriteBackPort } from "../../../../src/lib/store/projection/write-back.js";
import { createHistoryMemo } from "../../../../src/lib/store/projection/base-recovery.js";
import { StoreRefusalSchema, type StoreRefusal } from "../../../../src/lib/store/refusal.js";
import type { RecordReference } from "../../../../src/lib/store/identity.js";

const fixtures: Awaited<ReturnType<typeof createWriteBackFixture>>[] = [];
afterEach(async () => { await Promise.all(fixtures.splice(0).map(fixture => fixture.dispose())); });

function refusal(code: "unsupported" | "state-unresolvable" | "namespace-corrupt", reference: RecordReference): StoreRefusal {
  const common = { condition: `Injected ${code} condition.`, remedy: { text: `Repair the ${code} condition, then retry.` } };
  return StoreRefusalSchema.parse(code === "unsupported"
    ? { ...common, code, class: "terminal", case: "unhomed-kind" }
    : code === "state-unresolvable" ? { ...common, code, class: "recoverable", reference, historyRefs: [] }
      : { ...common, code, class: "terminal", namespace: "refs/arc/user/test-user/personal" });
}

describe("refused hand edits", () => {
  it.each(["unsupported", "state-unresolvable", "namespace-corrupt"] as const)("retains a write refused %s", async code => {
    const fixture = await createWriteBackFixture();
    fixtures.push(fixture);
    const boundary = createRefusingStore(fixture.store);
    const fault = refusal(code, fixture.entry.reference);
    boundary.refuse("batch", fault);
    const content = "opening\nhand edit\nclosing\n";
    await fixture.edit(content);
    const context = { ...fixture.context, store: boundary.store, memo: createHistoryMemo(boundary.store) };
    const result = await createWriteBackPort(context)(fixture.request);
    expect(result).toMatchObject({ answer: "refused", entry: { refused: { reason: fault.condition, remedy: fault.remedy } } });
    expect(fixture.reports).toContainEqual({ path: fixture.path, copy: null, mark: { reason: fault.condition, remedy: fault.remedy } });
    expect(await fixture.file()).toContain(content);
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { version: fixture.entry.base.version } });
    expect(boundary.calls("pull")).toBe(0);
    if (code === "unsupported") return;
    boundary.refuse("batch", null);
    expect(await createWriteBackPort(context)(fixture.request)).toMatchObject({ answer: "taken-in" });
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { content } });
  });

  it.each(["state-unresolvable", "namespace-corrupt"] as const)("retains a stale edit when its check history refuses %s without pulling", async code => {
    const fixture = await createWriteBackFixture();
    fixtures.push(fixture);
    const current = "remote opening\nbase\nclosing\n";
    expect(await fixture.store.write({ action: "put", reference: fixture.entry.reference,
      expected: fixture.entry.base.version, content: current, provenance: { verb: "remote", lifecycleAction: "edit" } })).toMatchObject({ status: "ok" });
    const content = "opening\nbase\nhand closing\n";
    await fixture.edit(content);
    const boundary = createRefusingStore(fixture.store);
    const fault = refusal(code, fixture.entry.reference);
    boundary.refuse("history", fault);
    const context = () => ({ ...fixture.context, store: boundary.store, memo: createHistoryMemo(boundary.store) });
    expect(await createWriteBackPort(context())(fixture.request)).toMatchObject({ answer: "refused", mark: { reason: fault.condition, remedy: fault.remedy } });
    expect(boundary.calls("history")).toBe(1);
    expect(boundary.calls("write")).toBe(0);
    expect(boundary.calls("batch")).toBe(0);
    expect(boundary.calls("pull")).toBe(0);
    expect(await fixture.file()).toContain(content);
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { content: current } });
    boundary.refuse("history", null);
    expect(await createWriteBackPort(context())(fixture.request)).toMatchObject({ answer: "taken-in" });
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { content: "remote opening\nbase\nhand closing\n" } });
  });

  it("holds a batch atomically until its missing-state condition is repaired", async () => {
    const fixture = await createWriteBackFixture();
    fixtures.push(fixture);
    const boundary = createRefusingStore(fixture.store);
    const fault = refusal("state-unresolvable", fixture.entry.reference);
    const content = "batched hand edit\n";
    const input = { writes: [{ action: "put" as const, reference: fixture.entry.reference,
      expected: fixture.entry.base.version, content }], provenance: { verb: "write-back", lifecycleAction: "edit" } };
    boundary.refuse("batch", fault);
    expect(await boundary.store.batch(input)).toEqual({ status: "refused", refusal: fault });
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { version: fixture.entry.base.version } });
    boundary.refuse("batch", null);
    expect(await boundary.store.batch(input)).toMatchObject({ status: "ok" });
    expect(await fixture.store.read({ reference: fixture.entry.reference })).toMatchObject({ status: "ok", result: { content } });
  });

  it("returns a typed pull lock refusal and restores pulling after the lock is cleared", async () => {
    const fixture = await createWriteBackFixture();
    fixtures.push(fixture);
    const boundary = createRefusingStore(fixture.store);
    const fault = StoreRefusalSchema.parse({ code: "lock-held", class: "recoverable", lock: "history-pull",
      condition: "Another history pull holds the lock.", remedy: { text: "Wait for that pull, then retry." } });
    boundary.refuse("pull", fault);
    expect(await boundary.store.pull()).toEqual({ status: "refused", refusal: fault });
    boundary.refuse("pull", null);
    expect(await boundary.store.pull()).toMatchObject({ status: "ok" });
  });
});
