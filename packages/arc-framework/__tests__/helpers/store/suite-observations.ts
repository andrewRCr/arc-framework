/** Shared atomic read-evidence behavior, including the interim backend's explicit refusal. */
import { expect } from "vitest";
import { assertion, seed, success, testProvenance, update, type SuiteContext } from "./suite-tools.js";

/** Register strict observations without writing or advancing the observed record's history. */
export function registerObservationAssertions(context: SuiteContext): void {
  assertion(context, "personal", "atomic-read-observations", async fixture => {
    const observed = await seed(fixture, fixture.reference("personal/document"));
    const target = await seed(fixture, fixture.reference("personal/document", "two"));
    success(await fixture.store.write(update(fixture, observed)));
    const before = await fixture.settle();
    const input = { writes: [update(fixture, target)], provenance: testProvenance,
      observations: [{ reference: observed.reference, expected: { version: observed.version, conflicts: observed.conflicts } }] };
    expect(await fixture.store.batch(input)).toMatchObject({ status: "refused", refusal: fixture.declarations.stateOffBranch
      ? { code: "version-conflict", records: [observed.reference] }
      : { code: "unsupported", case: "batch-observations" } });
    expect(await fixture.settle()).toBe(before);
    expect(success(await fixture.store.read({ reference: target.reference }))).toEqual(target);
    if (!fixture.declarations.stateOffBranch) return;
    const fresh = success(await fixture.store.read({ reference: observed.reference }));
    const history = success(await fixture.store.history({ reference: observed.reference }));
    input.observations = [{ reference: fresh.reference, expected: { version: fresh.version, conflicts: fresh.conflicts } }];
    const applied = success(await fixture.store.batch(input));
    expect(applied.writes).toHaveLength(1);
    expect(success(await fixture.store.read({ reference: target.reference })).content).toBe(fixture.content(target.reference, "changed"));
    expect(success(await fixture.store.read({ reference: observed.reference }))).toEqual(fresh);
    expect(success(await fixture.store.history({ reference: observed.reference }))).toEqual(history);
  });
}
