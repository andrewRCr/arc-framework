/** exhaustive refusal validation followed by actual successful continuation. */

import { expect, it } from "vitest";
import { StoreRefusalSchema, SyncResultSchema, sameReference, type StoreRefusal, type StoreResult } from "../../../src/lib/store/index.js";
import { refusalRecoveryTable } from "./recovery.js";
import { assertion, recordAssertion, success, type SuiteContext } from "./suite-tools.js";

function observedRefusal(result: StoreResult<unknown>): StoreRefusal {
  if (result.status === "refused") return StoreRefusalSchema.parse(result.refusal);
  const sync = SyncResultSchema.parse(result.result);
  const failed = sync.publishes.find((publish) => publish.status === "failed");
  expect(failed?.status).toBe("failed");
  if (failed?.status !== "failed") throw new Error("Expected a classified failed publish");
  return StoreRefusalSchema.parse(failed.failure);
}

/** Register every refusal code and every named unsupported/not-found case, reporting all exclusions.
 * @param context - item 14 and its fresh fixture registration.
 */
export function registerRecoveryAssertions(context: SuiteContext): void {
  for (const [code, cases] of Object.entries(refusalRecoveryTable)) for (const scenario of cases) {
    const reason = context.registration.declarations.refusalExclusions[scenario.id];
    const name = `${scenario.id}: ${scenario.produce} Remedy: ${scenario.repair}`;
    let eligible = false;
    for (const family of context.registration.declarations.families) {
      recordAssertion(context, family, scenario.id);
      const exclusion = context.registration.declarations.familyExclusions[family];
      const familyReason = exclusion?.items?.[context.item] ?? exclusion?.assertions?.[scenario.id];
      if (familyReason) it.skip(`${family}: ${name} — ${familyReason}`, () => {});
      else eligible = true;
    }
    if (reason) { it.skip(`${name} — ${reason}`, () => {}); continue; }
    if (!eligible) continue;
    it(name, async () => {
      const fixture = await context.registration.create();
      const operation = await fixture.produce(scenario.id);
      const failure = observedRefusal(await operation.run());
      expect(failure.code).toBe(code);
      expect(failure.class).toBe(scenario.class);
      if (scenario.id.startsWith("unsupported:")) expect(failure).toMatchObject({ case: scenario.id.slice("unsupported:".length) });
      if (scenario.id === "not-found:identity") {
        expect(failure.condition).toContain("arc.identity");
        expect(failure.remedy.text).toContain("arc.identity");
      }
      if (scenario.id === "not-found:name") expect(failure).toMatchObject({ lookup: { kind: "slug" } });
      if (failure.code === "identity-mismatch") expect(sameReference(failure.expected, failure.actual)).toBe(false);
      if (scenario.id === "record-malformed") expect(failure.remedy.text).toMatch(/content|validation|rule/u);
      expect(failure.condition.trim().length).toBeGreaterThan(0);
      expect(failure.remedy.text.trim().length).toBeGreaterThan(0);
      await fixture.repair(scenario.id);
      const continued = success(await operation.run());
      const synced = SyncResultSchema.safeParse(continued);
      if (synced.success) expect(synced.data.publishes.every((publish) => ["pushed", "noop", "reconciled"].includes(publish.status))).toBe(true);
    });
  }
}

/** Register the interim backend's cross-substrate refusal, before any operation applies.
 * @param context - item 5 context.
 */
export function registerCrossSubstrateAssertions(context: SuiteContext): void {
  for (const family of context.registration.declarations.families) {
    assertion(context, family, "atomic-cross-substrate-batch", async (fixture) => {
      const operation = await fixture.produce("unsupported:cross-substrate-batch");
      const before = success(await fixture.store.version());
      expect(observedRefusal(await operation.run())).toMatchObject({ code: "unsupported", case: "cross-substrate-batch", class: "recoverable" });
      expect(success(await fixture.store.version())).toBe(before);
      await fixture.repair("unsupported:cross-substrate-batch");
      success(await operation.run());
    });
  }
}

/** Register reads outside the interim backend's saved-state coverage with their reachable remedy.
 * @param context - item 8 context.
 */
export function registerCoverageAssertions(context: SuiteContext): void {
  for (const family of context.registration.declarations.families) {
    assertion(context, family, "uncovered-record-state-version", async (fixture) => {
      const operation = await fixture.produce("unsupported:uncovered-state-version");
      expect(observedRefusal(await operation.run())).toMatchObject({ code: "unsupported", case: "uncovered-state-version", class: "recoverable" });
      await fixture.repair("unsupported:uncovered-state-version");
      success(await operation.run());
    });
  }
}
