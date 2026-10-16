/** publish outcomes, independent configuration states and whole-record reconciliation. */

import { expect } from "vitest";
import { ConflictRecordSchema, TextConflictRecordSchema, KIND_REGISTRY, ListingOutcomeSchema, PullResultSchema, MaintainResultSchema, PushResultSchema, type PushResult, type FamilyId } from "../../../src/lib/store/index.js";
import { assertion, everyKind, seed, success, update, type SuiteContext } from "./suite-tools.js";

/** Register real publish/noop/reconciliation and transport/refusal outcomes through the remote hook.
 * @param context - item 16 context.
 */
export function registerSyncAssertions(context: SuiteContext): void {
  for (const family of context.registration.declarations.syncFamilies) {
    const kinds = Object.values(KIND_REGISTRY).filter((definition) => definition.family === family
      && !definition.id.endsWith("/conflict-record"));
    const definition = kinds.find((kind) => !["create-only", "write-once"].includes(kind.writerRule)) ?? kinds[0];
    if (definition === undefined) continue;
    assertion(context, family, "pull-merges-without-publishing", async (fixture) => {
      const remote = fixture.remote(true);
      if (remote === undefined) throw new Error("A sync fixture requires an independent remote");
      const base = await seed(fixture, fixture.reference(definition.id));
      success(await fixture.store.push());
      let reference = base.reference;
      if (["create-only", "write-once"].includes(definition.writerRule)) {
        reference = fixture.reference(definition.id, "pulled");
        success(await remote.write({ action: "put", reference, expected: null,
          content: fixture.content(reference), provenance: { verb: "merge", lifecycleAction: "edit" } }));
      } else {
        const remoteBase = success(await remote.read({ reference }));
        success(await remote.write(update(fixture, remoteBase)));
      }
      const expected = success(await remote.read({ reference }));
      const before = success(await remote.version());
      const pending = family === "personal"
        ? await seed(fixture, fixture.reference("personal/document", "unpublished")) : undefined;
      if (pending) expect(await remote.read({ reference: pending.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
      const result = PullResultSchema.parse(success(await fixture.store.pull()));
      expect(result.pulls).toContainEqual(expect.objectContaining({ status: "pulled", families: expect.arrayContaining([family]) }));
      expect(success(await fixture.store.read({ reference })).content).toBe(expected.content);
      expect(success(await remote.read({ reference }))).toEqual(expected);
      expect(success(await remote.version())).toBe(before);
      if (pending) expect(await remote.read({ reference: pending.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    });
  }
  const maintenanceFamily = context.registration.declarations.families[0];
  if (maintenanceFamily !== undefined) assertion(context, maintenanceFamily, "maintain-measurements", async (fixture) => {
    expect(MaintainResultSchema.safeParse(success(await fixture.store.maintain())).success).toBe(true);
  });
  const mergeReason = context.registration.declarations.mergesConcurrentWrites ? undefined : "This backend refuses concurrent writes instead of storing merge conflicts.";
  everyKind(context, "publish-and-noop-family-coverage", async (fixture, reference) => {
    fixture.remote(true);
    await seed(fixture, reference);
    const pushed = PushResultSchema.parse(success(await fixture.store.push()));
    expect(pushed.states).toEqual([]);
    expectPublishedFamilies(pushed, fixture.declarations.syncFamilies);
    expect(pushed.publishes.some((publish) => publish.status === "pushed")).toBe(true);
    const noop = PushResultSchema.parse(success(await fixture.store.push()));
    expectPublishedFamilies(noop, fixture.declarations.syncFamilies);
    expect(noop.publishes.every((publish) => publish.status === "noop")).toBe(true);
  });
  everyKind(context, "remote-movement-reconciles-by-mechanism", async (fixture, reference) => {
    const remote = fixture.remote(true)!;
    const base = await seed(fixture, reference);
    success(await fixture.store.push());
    const remoteBase = success(await remote.read({ reference: base.reference }));
    const content = fixture.content(base.reference, "changed");
    success(await remote.write(update(fixture, remoteBase, content)));
    const result = PushResultSchema.parse(success(await fixture.store.push()));
    expect(result.publishes.find((publish) => publish.families.includes(KIND_REGISTRY[reference.kind].family))?.status).toBe("reconciled");
    expect(success(await fixture.store.read({ reference: base.reference })).content).toBe(content);
  }, (kind) => !["create-only", "write-once"].includes(KIND_REGISTRY[kind].writerRule));
  everyKind(context, "concurrent-sync-merges-and-preserves-both-side-labels", async (fixture, reference) => {
    const remote = fixture.remote(true)!;
    const base = await seed(fixture, reference);
    success(await fixture.store.push());
    const current = fixture.content(base.reference, "changed");
    const incoming = fixture.content(base.reference, "changed-again");
    success(await remote.write(update(fixture, success(await remote.read({ reference: base.reference })), current)));
    success(await fixture.store.write(update(fixture, base, incoming)));
    const reconciled = PushResultSchema.parse(success(await fixture.store.push()));
    expect(reconciled.publishes.some((publish) => publish.status === "reconciled")).toBe(true);
    const record = success(await fixture.store.read({ reference: base.reference }));
    expect(record.content).toBe(current);
    expect(record.conflicts).toHaveLength(1);
    const conflict = TextConflictRecordSchema.parse(JSON.parse(success(await fixture.store.read({ reference: record.conflicts[0]! })).content));
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
      const result = PushResultSchema.parse(success(await fixture.store.push()));
      const publish = result.publishes.find((outcome) => outcome.status === "failed");
      expect(publish).toMatchObject({ status: "failed", failure: { code, class: classification, condition: expect.any(String), remedy: { text: expect.any(String) } } });
      if (publish?.status !== "failed") throw new Error("Expected failed publish");
      if (publish.failure.code === "retries-exhausted") {
        expect(publish.failure).toMatchObject({ retryCount: fixture.declarations.syncRetryCount ?? 3, waitedMs: fixture.declarations.syncWaitedMs ?? 30 });
      }
      expect(publish.retryCount).toBeGreaterThanOrEqual(0);
      expect(publish.waitedMs).toBeGreaterThanOrEqual(0);
      if (publish.failure.code === "refused") expect(publish.failure.message).toContain("Remote policy requires a permitted writer.");
      fixture.remoteState("available");
      expect(PushResultSchema.parse(success(await fixture.store.push())).publishes.some((outcome) => ["pushed", "reconciled"].includes(outcome.status))).toBe(true);
    });
  }
  assertion(context, "work-item", "no-remote-is-an-independent-state", async (fixture) => {
    fixture.remote(false);
    expect(success(await fixture.store.push())).toEqual({ states: [{ status: "no-remote" }], pulls: [], publishes: [] });
  });
  assertion(context, "personal", "no-identity-holds-every-identity-family-while-project-publishes", async (fixture) => {
    fixture.remote(true);
    await seed(fixture, fixture.reference("personal/inbox"));
    await seed(fixture, fixture.reference("work-item/meta"));
    fixture.identity(undefined);
    const result = PushResultSchema.parse(success(await fixture.store.push()));
    const identityFamilies = fixture.declarations.identitySyncFamilies;
    expect(result.states).toEqual([{ status: "no-identity", families: identityFamilies, remedy: expect.objectContaining({ text: expect.stringContaining("arc.identity") }) }]);
    expectPublishedFamilies(result, fixture.declarations.syncFamilies.filter((family) => !identityFamilies.includes(family)));
    expect(result.publishes.some((publish) => publish.status === "pushed")).toBe(true);
    fixture.remote(false);
    expect(PushResultSchema.parse(success(await fixture.store.push())).states.map((state) => state.status).sort()).toEqual(["no-identity", "no-remote"]);
  });
  everyKind(context, "single-writer-sync-keeps-remote-and-stores-local-conflict", async (fixture, reference) => {
    const remote = fixture.remote(true)!;
    const base = await seed(fixture, reference);
    success(await fixture.store.push());
    const remoteBase = success(await remote.read({ reference: base.reference }));
    const current = fixture.content(base.reference, "changed");
    const incoming = fixture.content(base.reference, "changed-again");
    success(await remote.write(update(fixture, remoteBase, current)));
    success(await fixture.store.write(update(fixture, base, incoming)));
    expect(PushResultSchema.parse(success(await fixture.store.push())).publishes.find((publish) => publish.families.includes(KIND_REGISTRY[reference.kind].family))?.status).toBe("reconciled");
    const read = success(await fixture.store.read({ reference: base.reference }));
    expect(read.content).toBe(current);
    expect(read.conflicts).toHaveLength(1);
    const conflict = success(await fixture.store.read({ reference: read.conflicts[0]! }));
    expect(ConflictRecordSchema.parse(JSON.parse(conflict.content))).toMatchObject({ record: base.reference, location: { kind: "record" },
      base: { reference: base.reference, content: base.content, version: base.version, formatVersion: base.formatVersion },
      current: { value: { reference: base.reference, content: current }, label: { actor: expect.any(String), time: expect.any(String) } },
      incoming: { value: { reference: base.reference, content: incoming }, label: { actor: expect.any(String), time: expect.any(String) } } });
    const listed = success(await fixture.store.list({ family: KIND_REGISTRY[reference.kind].family, kind: read.conflicts[0]!.kind }));
    if (listed.status !== "complete") throw new Error("Expected conflict enumeration");
    expect(listed.records.map((record) => record.reference)).toContainEqual(read.conflicts[0]);
    success(await fixture.store.write({ ...update(fixture, read, current), resolves: read.conflicts }));
    expect(success(await fixture.store.read({ reference: base.reference })).conflicts).toEqual([]);
    expect(PushResultSchema.parse(success(await fixture.store.push())).publishes.find((publish) => publish.families.includes(KIND_REGISTRY[reference.kind].family))?.status).toBe("pushed");
  }, (kind) => KIND_REGISTRY[kind].merge === "single-writer" && KIND_REGISTRY[kind].writerRule !== "create-only" && KIND_REGISTRY[kind].writerRule !== "write-once", mergeReason);
  for (const removing of ["local", "remote"] as const) everyKind(context, `single-writer-sync-preserves-${removing}-removal`, async (fixture, reference) => {
    const remote = fixture.remote(true)!;
    const base = await seed(fixture, reference);
    success(await fixture.store.push());
    const remover = removing === "local" ? fixture.store : remote;
    const editor = removing === "local" ? remote : fixture.store;
    success(await remover.write({ action: "remove", reference: base.reference, expected: base.version, provenance: { verb: "remove", lifecycleAction: "remove" } }));
    success(await editor.write(update(fixture, base)));
    const edited = success(await editor.read({ reference: base.reference }));
    expect(success(await fixture.store.push()).publishes.some((publish) => publish.status === "reconciled")).toBe(true);
    const listing = ListingOutcomeSchema.parse(success(await fixture.reopen().list({ family: KIND_REGISTRY[reference.kind].family, owner: base.reference.owner })));
    expect(listing.status).toBe("complete");
    if (listing.status !== "complete") throw new Error("Expected the clashing family's records");
    expect(listing.diagnostics).toEqual([]);
    const conflicts = listing.records.filter((record) => record.reference.kind.endsWith("/conflict-record"));
    expect(conflicts).toHaveLength(1);
    const conflict = ConflictRecordSchema.parse(JSON.parse(conflicts[0]!.content));
    expect(conflict).toMatchObject({ location: { kind: "record" }, record: base.reference,
      base: { reference: base.reference, content: base.content, version: base.version, formatVersion: base.formatVersion },
      current: { value: removing === "remote" ? null : { reference: edited.reference, content: edited.content, version: edited.version }, label: { actor: expect.any(String), time: expect.any(String) } },
      incoming: { value: removing === "local" ? null : { reference: edited.reference, content: edited.content, version: edited.version }, label: { actor: expect.any(String), time: expect.any(String) } } });
    if (removing === "remote") expect(await fixture.store.read({ reference: base.reference })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    else expect(success(await fixture.store.read({ reference: base.reference }))).toMatchObject({ version: edited.version, conflicts: [conflicts[0]!.reference] });
  }, (kind) => KIND_REGISTRY[kind].merge === "single-writer" && KIND_REGISTRY[kind].writerRule !== "create-only" && KIND_REGISTRY[kind].writerRule !== "write-once", mergeReason);
}

function expectPublishedFamilies(result: PushResult, families: readonly FamilyId[]): void {
  for (const publish of result.publishes) {
    if (!["pushed", "noop", "reconciled", "failed"].includes(publish.status)) continue;
    expect(publish).toMatchObject({ retryCount: expect.any(Number), waitedMs: expect.any(Number) });
  }
  expect([...new Set(result.publishes.flatMap((publish) => publish.families))].sort()).toEqual([...families].sort());
  expect(result.publishes.every((publish) => ["pushed", "noop", "reconciled"].includes(publish.status))).toBe(true);
}
