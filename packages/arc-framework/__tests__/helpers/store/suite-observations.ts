/** Shared atomic read-evidence behavior, including the interim backend's explicit refusal. */
import { expect } from "vitest";
import { BatchInputSchema } from "../../../src/lib/store/index.js";
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
  for (const basis of ["absent", "present"] as const) {
    assertion(context, "personal", `observation-identity-${basis}`, async fixture => {
      const observed = await seed(fixture, fixture.reference("personal/document"));
      const target = await seed(fixture, fixture.reference("project-registry/counter"));
      const input = BatchInputSchema.parse({ writes: [{ action: "put", reference: target.reference,
        expected: target.version, content: fixture.content(target.reference, "changed") }], provenance: testProvenance,
        observations: [{ reference: observed.reference, expected: basis === "absent" ? null
          : { version: observed.version, conflicts: observed.conflicts } }] });
      const before = await fixture.settle();
      const targetHistory = success(await fixture.store.history({ reference: target.reference }));
      fixture.identity(undefined);
      const unavailable = await fixture.store.read({ reference: observed.reference });
      expect(unavailable).toMatchObject({ status: "refused", refusal: { code: "not-found",
        remedy: { argv: ["git", "config", "arc.identity", observed.reference.owner.name] } } });
      expect(await fixture.store.batch(input)).toEqual(unavailable);
      expect(await fixture.settle()).toBe(before);
      expect(success(await fixture.store.read({ reference: target.reference }))).toEqual(target);
      expect(success(await fixture.store.history({ reference: target.reference }))).toEqual(targetHistory);
      fixture.identity(observed.reference.owner.name);
      expect(success(await fixture.store.read({ reference: observed.reference }))).toEqual(observed);
      if (basis === "absent") {
        expect(await fixture.store.batch(input)).toMatchObject({ status: "refused", refusal: {
          code: "version-conflict", records: [observed.reference],
        } });
        expect(await fixture.settle()).toBe(before);
        success(await fixture.store.write({ action: "remove", reference: observed.reference,
          expected: observed.version, provenance: testProvenance }));
      }
      success(await fixture.store.batch(input));
      expect(success(await fixture.store.read({ reference: target.reference })).content)
        .toBe(fixture.content(target.reference, "changed"));
      expect(await fixture.store.read({ reference: observed.reference })).toMatchObject(basis === "absent"
        ? { status: "refused", refusal: { code: "not-found" } } : { status: "ok", result: observed });
    }, context.registration.declarations.stateOffBranch ? undefined
      : "The interim backend refuses every nonempty observation set; it cannot admit observed identity evidence.");
  }
}
