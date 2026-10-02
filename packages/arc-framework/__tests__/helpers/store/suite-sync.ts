/** publish outcomes, independent configuration states and whole-record reconciliation. */

import { expect } from "vitest";
import { ConflictRecordSchema, KIND_REGISTRY, SyncResultSchema, type SyncResult, type FamilyId } from "../../../src/lib/store/index.js";
import { assertion, everyKind, seed, success, update, type SuiteContext } from "./suite-tools.js";

/** Register real publish/noop/reconciliation and transport/refusal outcomes through the remote hook.
 * @param context - item 16 context.
 */
export function registerSyncAssertions(context: SuiteContext): void {
  const mergeReason = context.registration.declarations.mergesConcurrentWrites ? undefined : "This backend refuses concurrent writes instead of storing merge conflicts.";
  everyKind(context, "publish-and-noop-family-coverage", async (fixture, reference) => {
    fixture.remote(true);
    await seed(fixture, reference);
    const pushed = SyncResultSchema.parse(success(await fixture.store.sync()));
    expect(pushed.states).toEqual([]);
    expectPublishedFamilies(pushed, fixture.declarations.syncFamilies);
    expect(pushed.publishes.some((publish) => publish.status === "pushed")).toBe(true);
    const noop = SyncResultSchema.parse(success(await fixture.store.sync()));
    expectPublishedFamilies(noop, fixture.declarations.syncFamilies);
    expect(noop.publishes.every((publish) => publish.status === "noop")).toBe(true);
  });
  everyKind(context, "remote-movement-reconciles-by-mechanism", async (fixture, reference) => {
    const remote = fixture.remote(true)!;
    const base = await seed(fixture, reference);
    success(await fixture.store.sync());
    const remoteBase = success(await remote.read({ reference: base.reference }));
    const content = fixture.content(base.reference, "changed");
    success(await remote.write(update(fixture, remoteBase, content)));
    const result = SyncResultSchema.parse(success(await fixture.store.sync()));
    expect(result.publishes.find((publish) => publish.families.includes(KIND_REGISTRY[reference.kind].family))?.status).toBe("reconciled");
    expect(success(await fixture.store.read({ reference: base.reference })).content).toBe(content);
  }, (kind) => !["create-only", "write-once"].includes(KIND_REGISTRY[kind].writerRule));
  everyKind(context, "concurrent-sync-merges-and-preserves-both-side-labels", async (fixture, reference) => {
    const remote = fixture.remote(true)!;
    const base = await seed(fixture, reference);
    success(await fixture.store.sync());
    const current = fixture.content(base.reference, "changed");
    const incoming = fixture.content(base.reference, "changed-again");
    success(await remote.write(update(fixture, success(await remote.read({ reference: base.reference })), current)));
    success(await fixture.store.write(update(fixture, base, incoming)));
    const reconciled = SyncResultSchema.parse(success(await fixture.store.sync()));
    expect(reconciled.publishes.some((publish) => publish.status === "reconciled")).toBe(true);
    const record = success(await fixture.store.read({ reference: base.reference }));
    expect(record.content).toBe(current);
    expect(record.conflicts).toHaveLength(1);
    const conflict = ConflictRecordSchema.parse(JSON.parse(success(await fixture.store.read({ reference: record.conflicts[0]! })).content));
    expect(conflict.location.kind).toBe(KIND_REGISTRY[reference.kind].merge === "entry" ? "entry" : "hunk");
    expect(current).toContain(conflict.current.content.trim());
    expect(incoming).toContain(conflict.incoming.content.trim());
    expect(conflict.current.label.actor.length).toBeGreaterThan(0);
    expect(conflict.incoming.label.actor.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(conflict.current.label.time))).toBe(false);
    expect(Number.isNaN(Date.parse(conflict.incoming.label.time))).toBe(false);
  }, (kind) => KIND_REGISTRY[kind].merge !== "single-writer", mergeReason);
  for (const [state, code, classification] of [["down", "unreachable", "recoverable"], ["contended", "retries-exhausted", "recoverable"], ["refusing", "refused", "terminal"]] as const) {
    assertion(context, "work-item", `remote-${state}-with-success-after-repair`, async (fixture) => {
      fixture.remote(true);
      await seed(fixture, fixture.reference("work-item/meta"));
      fixture.remoteState(state, "Remote policy requires a permitted writer.");
      const result = SyncResultSchema.parse(success(await fixture.store.sync()));
      const publish = result.publishes.find((outcome) => outcome.status === "failed");
      expect(publish).toMatchObject({ status: "failed", failure: { code, class: classification, condition: expect.any(String), remedy: { text: expect.any(String) } } });
      if (publish?.status !== "failed") throw new Error("Expected failed publish");
      if (publish.failure.code === "retries-exhausted") expect(publish.failure).toMatchObject({ retryCount: fixture.declarations.syncRetryCount ?? 3, waitedMs: fixture.declarations.syncWaitedMs ?? 30 });
      if (publish.failure.code === "refused") expect(publish.failure.message).toContain("Remote policy requires a permitted writer.");
      fixture.remoteState("available");
      expect(SyncResultSchema.parse(success(await fixture.store.sync())).publishes.some((outcome) => ["pushed", "reconciled"].includes(outcome.status))).toBe(true);
    });
  }
  assertion(context, "work-item", "no-remote-is-an-independent-state", async (fixture) => {
    fixture.remote(false);
    expect(success(await fixture.store.sync())).toEqual({ states: [{ status: "no-remote" }], publishes: [] });
  });
  assertion(context, "personal", "no-identity-holds-every-identity-family-while-project-publishes", async (fixture) => {
    fixture.remote(true);
    await seed(fixture, fixture.reference("personal/inbox"));
    await seed(fixture, fixture.reference("work-item/meta"));
    fixture.identity(undefined);
    const result = SyncResultSchema.parse(success(await fixture.store.sync()));
    const identityFamilies = fixture.declarations.identitySyncFamilies;
    expect(result.states).toEqual([{ status: "no-identity", families: identityFamilies, remedy: expect.objectContaining({ text: expect.stringContaining("arc.identity") }) }]);
    expectPublishedFamilies(result, fixture.declarations.syncFamilies.filter((family) => !identityFamilies.includes(family)));
    expect(result.publishes.some((publish) => publish.status === "pushed")).toBe(true);
    fixture.remote(false);
    expect(SyncResultSchema.parse(success(await fixture.store.sync())).states.map((state) => state.status).sort()).toEqual(["no-identity", "no-remote"]);
  });
  everyKind(context, "single-writer-sync-keeps-remote-and-stores-local-conflict", async (fixture, reference) => {
    const remote = fixture.remote(true)!;
    const base = await seed(fixture, reference);
    success(await fixture.store.sync());
    const remoteBase = success(await remote.read({ reference: base.reference }));
    const current = fixture.content(base.reference, "changed");
    const incoming = fixture.content(base.reference, "changed-again");
    success(await remote.write(update(fixture, remoteBase, current)));
    success(await fixture.store.write(update(fixture, base, incoming)));
    expect(SyncResultSchema.parse(success(await fixture.store.sync())).publishes.find((publish) => publish.families.includes(KIND_REGISTRY[reference.kind].family))?.status).toBe("reconciled");
    const read = success(await fixture.store.read({ reference: base.reference }));
    expect(read.content).toBe(current);
    expect(read.conflicts).toHaveLength(1);
    const conflict = success(await fixture.store.read({ reference: read.conflicts[0]! }));
    expect(ConflictRecordSchema.parse(JSON.parse(conflict.content))).toMatchObject({ record: base.reference, location: { kind: "record" }, base: base.content,
      current: { content: current, label: { actor: expect.any(String), time: expect.any(String) } }, incoming: { content: incoming, label: { actor: expect.any(String), time: expect.any(String) } } });
    const listed = success(await fixture.store.list({ family: KIND_REGISTRY[reference.kind].family, kind: read.conflicts[0]!.kind }));
    if (listed.status !== "complete") throw new Error("Expected conflict enumeration");
    expect(listed.records.map((record) => record.reference)).toContainEqual(read.conflicts[0]);
    success(await fixture.store.write({ ...update(fixture, read, current), resolves: read.conflicts }));
    expect(success(await fixture.store.read({ reference: base.reference })).conflicts).toEqual([]);
    expect(SyncResultSchema.parse(success(await fixture.store.sync())).publishes.find((publish) => publish.families.includes(KIND_REGISTRY[reference.kind].family))?.status).toBe("pushed");
  }, (kind) => KIND_REGISTRY[kind].merge === "single-writer" && KIND_REGISTRY[kind].writerRule !== "create-only" && KIND_REGISTRY[kind].writerRule !== "write-once", mergeReason);
}

function expectPublishedFamilies(result: SyncResult, families: readonly FamilyId[]): void {
  expect([...new Set(result.publishes.flatMap((publish) => publish.families))].sort()).toEqual([...families].sort());
  expect(result.publishes.every((publish) => ["pushed", "noop", "reconciled"].includes(publish.status))).toBe(true);
}
