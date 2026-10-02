/** Real tracked refusal producers and explicit selection of capable backends for recovery. */
import { expect } from "vitest";
import { RecordReferenceSchema, type StoreResult } from "../../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import { createReferenceFixture } from "./reference-fixture.js";
import { seed, success, testProvenance, update } from "./suite-tools.js";
import type { ConformanceFixture, RecoveryCaseId, RecoveryOperation } from "./fixture-contract.js";
import { produceRemoteRecovery } from "./in-repo-remote-recovery.js";
type Repairs = Map<string, () => Promise<void>>;

/** Produce an actual refused operation whose retained repair preserves its logical intent.
 * @param fixture - Real tracked checkout.
 * @param exec - Real Git executor.
 * @param repairs - Fixture-owned continuation remedies.
 * @param caseId - Named contract case.
 * @returns Original operation and its repaired continuation.
 */
export async function produceInRepoRecovery(fixture: ConformanceFixture, exec: GitExec, repairs: Repairs, caseId: RecoveryCaseId): Promise<RecoveryOperation> {
  const remote = await produceRemoteRecovery(fixture, repairs, caseId);
  if (remote) return remote;
  if (caseId === "not-found:identity") {
    const record = await seed(fixture, fixture.reference("personal/document"));
    fixture.identity(undefined);
    repairs.set(caseId, async () => { fixture.identity(record.reference.owner.name); });
    return { run: () => fixture.store.read({ reference: record.reference }) };
  }
  if (caseId.startsWith("unsupported:")) return unsupported(fixture, exec, repairs, caseId);
  const reference = fixture.reference(caseId === "not-found:name" || caseId === "checkout-not-writable" ? "work-item/meta" : "review/candidate");
  if (caseId === "not-found:name") {
    repairs.set(caseId, async () => { await seed(fixture, reference); });
    return { run: () => fixture.store.lookup({ kind: "slug", slug: reference.owner.name }) };
  }
  if (caseId === "version-conflict") {
    const record = await seed(fixture, reference);
    success(await fixture.store.write(update(fixture, record)));
    let input = update(fixture, record, fixture.content(reference, "changed-again"));
    repairs.set(caseId, async () => { input = update(fixture, success(await fixture.store.read({ reference })), input.content); });
    return { run: () => fixture.store.write(input) };
  }
  if (caseId === "record-malformed" || caseId === "identity-mismatch") {
    const wrong = RecordReferenceSchema.parse({ ...reference, owner: { ...reference.owner, name: "wrong-owner" } });
    let content = caseId === "record-malformed" ? fixture.content(reference, "invalid") : fixture.content(wrong);
    repairs.set(caseId, async () => { content = fixture.content(reference); });
    return { run: () => fixture.store.write({ action: "put", reference, content, expected: null, provenance: testProvenance }) };
  }
  if (caseId === "lock-held") {
    await fixture.hold(reference, true);
    repairs.set(caseId, async () => { await fixture.hold(reference, false); });
    return { run: () => fixture.store.write({ action: "put", reference, content: fixture.content(reference), expected: null, provenance: testProvenance }) };
  }
  if (caseId === "ambiguous-match") return ambiguous(fixture, repairs, caseId);
  if (caseId === "checkout-not-writable") {
    const base = await fixture.settle();
    await exec("git", ["checkout", "-b", "feat/work-item-one"]);
    const record = await seed(fixture, reference);
    await fixture.settle();
    await exec("git", ["checkout", "--detach", base]);
    repairs.set(caseId, async () => { await exec("git", ["checkout", "feat/work-item-one"]); });
    return { run: () => fixture.store.write(update(fixture, record)) };
  }
  throw new Error(`No tracked producer: ${caseId}`);
}

async function ambiguous(fixture: ConformanceFixture, repairs: Repairs, caseId: RecoveryCaseId): Promise<RecoveryOperation> {
  const alpha = await seed(fixture, fixture.reference("work-item/meta", "alpha"));
  const beta = await seed(fixture, fixture.reference("work-item/meta", "beta"));
  await seed(fixture, fixture.reference("lineage/transition", "alpha"), JSON.stringify({ schemaVersion: 1, origin: alpha.reference.owner.name, kind: "rename", successors: [beta.reference.owner.name], edges: [] }));
  repairs.set(caseId, async () => { success(await fixture.store.write({ action: "remove", reference: alpha.reference, expected: alpha.version, provenance: testProvenance })); });
  return { run: () => fixture.store.lookup({ kind: "slug", slug: alpha.reference.owner.name }) };
}

async function unsupported(fixture: ConformanceFixture, exec: GitExec, repairs: Repairs, caseId: RecoveryCaseId): Promise<RecoveryOperation> {
  if (caseId === "unsupported:work-item-kind-required") {
    let kind: "work-item/meta" | undefined;
    repairs.set(caseId, async () => { kind = "work-item/meta"; });
    return { run: () => fixture.store.list({ family: "work-item", ...(kind ? { kind } : {}) }) };
  }
  if (caseId === "unsupported:uncovered-state-version") {
    const asOf = await fixture.settle();
    await exec("git", ["checkout", "-b", "feat/work-item-one"]);
    const record = await seed(fixture, fixture.reference("work-item/meta"));
    await fixture.settle();
    let own = false;
    repairs.set(caseId, async () => { own = true; });
    return { run: async () => {
      if (own) expect(success(await fixture.store.read({ reference: record.reference })).version).toBe(record.version);
      return fixture.store.read({ reference: record.reference, ...(own ? {} : { asOf }) });
    } };
  }
  if (caseId === "unsupported:cross-substrate-batch") return crossSubstrate(fixture, repairs, caseId);
  return selectCapableBackend(fixture, repairs, caseId);
}

async function crossSubstrate(fixture: ConformanceFixture, repairs: Repairs, caseId: RecoveryCaseId): Promise<RecoveryOperation> {
  const tracked = fixture.reference("review/candidate"), personal = fixture.reference("personal/document");
  const left = { action: "put" as const, reference: tracked, content: fixture.content(tracked), expected: null, provenance: testProvenance };
  const right = { action: "put" as const, reference: personal, content: fixture.content(personal), expected: null, provenance: testProvenance };
  let split = false;
  repairs.set(caseId, async () => { split = true; });
  return { run: async () => {
    if (!split) return fixture.store.batch({ writes: [left, right], provenance: testProvenance });
    success(await fixture.store.write(left));
    const result = await fixture.store.write(right);
    success(result);
    expect(success(await fixture.store.read({ reference: tracked })).content).toBe(left.content);
    expect(success(await fixture.store.read({ reference: personal })).content).toBe(right.content);
    return result;
  } };
}

async function selectCapableBackend(fixture: ConformanceFixture, repairs: Repairs, caseId: RecoveryCaseId): Promise<RecoveryOperation> {
  const capable = createReferenceFixture();
  let switched = false;
  let migrated = capable.reference("work-item/meta");
  const tracked = fixture.reference("work-item/meta");
  let current = caseId === "unsupported:completed-create" ? undefined : await seed(fixture, tracked);
  if (caseId === "unsupported:unhomed-kind") {
    const reference = fixture.reference("review/evidence");
    repairs.set(caseId, async () => { switched = true; });
    return { run: () => switched ? seedAndReturn(capable, capable.reference("review/evidence")) : fixture.store.write({ action: "put", reference, content: "{}", expected: null, provenance: testProvenance }) };
  }
  if (caseId === "unsupported:personal-history") {
    const record = await seed(fixture, fixture.reference("personal/document"));
    const reference = capable.reference("personal/document");
    repairs.set(caseId, async () => { await seed(capable, reference, record.content); switched = true; });
    return { run: () => switched ? capable.store.history({ reference }) : fixture.store.history({ reference: record.reference }) };
  }
  repairs.set(caseId, async () => {
    if (current) { current = await seed(capable, migrated); migrated = current.reference; }
    switched = true;
  });
  return { run: async () => {
    const reference = switched ? migrated : tracked;
    const renamed = RecordReferenceSchema.parse({ ...reference, owner: { ...reference.owner, name: "renamed-work", ...(!switched ? { uid: "12345678-1234-4234-9234-123456789012" } : {}) } });
    return (switched ? capable.store : fixture.store).write({ action: "put", reference: caseId === "unsupported:rename" ? renamed : reference,
      content: (switched ? capable : fixture).content(reference, "changed"), expected: current?.version ?? null, provenance: testProvenance,
      placement: caseId === "unsupported:completed-create" || caseId === "unsupported:placement-move" ? { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } : { kind: "active" },
      ...(caseId === "unsupported:links-write" ? { links: { branch: { repository: "repo", ref: "feat/example" } } } : {}) });
  } };
}

async function seedAndReturn(fixture: ConformanceFixture, reference: ReturnType<ConformanceFixture["reference"]>): Promise<StoreResult<unknown>> {
  const record = await seed(fixture, reference);
  return fixture.store.read({ reference: record.reference });
}
