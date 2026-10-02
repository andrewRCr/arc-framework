/** Shared assertion registration and faithful record setup for store conformance. */

import { expect, it } from "vitest";
import {
  KIND_REGISTRY, familyOf, singletonReference, type FamilyId, type KindId, type Links,
  type RecordReference, type StoreRecord, type StoreResult, type WritePlacement,
} from "../../../src/lib/store/index.js";
import type { ConformanceFixture, ConformanceRegistration, SuiteItem } from "./fixture-contract.js";

/** One numbered item's backend registration context. */
export interface SuiteContext { item: SuiteItem; registration: ConformanceRegistration }
/** Stable caller provenance used by setup writes; behavior tests override it where relevant. */
export const testProvenance = { verb: "merge", lifecycleAction: "test", codeHead: "a".repeat(40) };

/** Assert success at the public operation boundary and unwrap its contract result.
 * @param envelope - Backend operation result.
 * @returns Its successful payload after recording a meaningful failed assertion otherwise.
 */
export function success<T>(envelope: StoreResult<T>): T {
  expect(envelope.status, JSON.stringify(envelope)).toBe("ok");
  if (envelope.status !== "ok") throw new Error(`Unexpected refusal ${envelope.refusal.code}`);
  return envelope.result;
}

/** Register an assertion or a named reasoned skip from one family's fixture declarations.
 * @param context - Stable numbered item and backend fixture factory.
 * @param family - Family under test.
 * @param name - Stable assertion name used by per-assertion exclusions.
 * @param test - Behavior driven entirely through fixture hooks and the public store.
 * @param inapplicableReason - Named mechanism limitation when the behavior does not apply.
 */
export function assertion(context: SuiteContext, family: FamilyId, name: string, test: (fixture: ConformanceFixture) => Promise<void>, inapplicableReason?: string): void {
  if (!context.registration.declarations.families.includes(family)) return;
  const exclusions = context.registration.declarations.familyExclusions[family];
  const reason = exclusions?.items?.[context.item] ?? exclusions?.assertions?.[name] ?? inapplicableReason;
  if (reason) it.skip(`${family}: ${name} — ${reason}`, () => {});
  else it(`${family}: ${name}`, async () => { await test(await context.registration.create()); });
}

/** Register one named behavior for each served role selected by its declared mechanism.
 * @param context - Item and fixture registration.
 * @param name - Assertion role, prefixed to each kind identifier.
 * @param test - Per-kind observable behavior.
 * @param select - Optional applicability filter from registry data.
 * @param inapplicableReason - Explicit mechanism reason reported for each selected kind.
 */
export function everyKind(context: SuiteContext, name: string, test: (fixture: ConformanceFixture, reference: RecordReference) => Promise<void>, select: (kind: KindId) => boolean = () => true, inapplicableReason?: string): void {
  for (const family of context.registration.declarations.families) {
    const kinds = (Object.keys(KIND_REGISTRY) as KindId[]).filter((kind) => KIND_REGISTRY[kind].family === family && select(kind));
    for (const kind of kinds) assertion(context, family, `${name}:${kind}`, (fixture) => test(fixture, fixture.reference(kind)), inapplicableReason);
  }
}

/** Seed a kind with valid content, first creating its work-item primary where required.
 * @param fixture - Fresh backend-neutral hooks.
 * @param reference - Record to create.
 * @param content - Optional valid content override.
 * @param placement - Primary placement, defaulting to active.
 * @param links - Optional primary traceability links.
 * @returns The newly readable record with its canonical identity and exact version.
 */
export async function seed(fixture: ConformanceFixture, reference: RecordReference, content?: string, placement: WritePlacement = { kind: "active" }, links?: Links): Promise<StoreRecord> {
  const primary = reference.kind === "work-item/meta" || reference.kind === "work-item/record";
  if (reference.owner.type === "work-item" && ["work-item", "review"].includes(familyOf(reference.kind)) && !primary) {
    const root = singletonReference(reference.owner, reference.kind === "work-item/description" ? "work-item/record" : "work-item/meta");
    const existing = await fixture.store.read({ reference: root });
    if (existing.status === "refused") success(await fixture.store.write({ action: "put", reference: root,
      content: fixture.content(root), expected: null, placement: { kind: "active" }, provenance: testProvenance }));
  }
  success(await fixture.store.write({ action: "put", reference, content: content ?? fixture.content(reference), expected: null,
    provenance: testProvenance, ...(primary ? { placement, ...(links === undefined ? {} : { links }) } : {}) }));
  return success(await fixture.store.read({ reference }));
}

/** Build a valid update using each record's own version, including primary placement.
 * @param fixture - Backend-neutral content hook.
 * @param record - Record whose version the caller observed.
 * @param content - Intended replacement bytes.
 * @returns A typed mutation suitable for a write or atomic batch.
 */
export function update(fixture: ConformanceFixture, record: StoreRecord, content = fixture.content(record.reference, "changed")) {
  const primary = record.reference.kind === "work-item/meta" || record.reference.kind === "work-item/record";
  const placement = record.placement?.kind === "completed" ? { kind: "completed" as const, quarter: record.placement.quarter } : record.placement;
  return { action: "put" as const, reference: record.reference, content, expected: record.version,
    provenance: testProvenance, ...(primary && placement ? { placement } : {}) };
}
