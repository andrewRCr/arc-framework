/** listing completeness, identity absence, format refusal and lifecycle filters. */

import { expect } from "vitest";
import { FAMILY_REGISTRY, KIND_REGISTRY, RecordReferenceSchema, type KindId, type ListingDiagnostic } from "../../../src/lib/store/index.js";
import { ArchiveQuarterSchema } from "../../../src/lib/kernel/index.js";
import { assertion, everyKind, seed, success, update, type SuiteContext } from "./suite-tools.js";

/** Register missing, unreadable and complete families without erasing bad entries.
 * @param context - item 9 context.
 */
export function registerListingAssertions(context: SuiteContext): void {
  for (const family of context.registration.declarations.families) {
    assertion(context, family, "empty-family-is-absent", async (fixture) => {
      expect(success(await fixture.store.list({ family, ...(family === "work-item" ? { kind: "work-item/meta" as const } : {}) }))).toMatchObject({ status: "absent" });
    });
    if (FAMILY_REGISTRY[family].scope === "identity") assertion(context, family, "no-identity-is-absent", async (fixture) => {
      const kind = (Object.keys(KIND_REGISTRY) as KindId[]).find((kind) => KIND_REGISTRY[kind].family === family);
      if (kind !== undefined) await seed(fixture, fixture.reference(kind));
      fixture.identity(undefined);
      expect(success(await fixture.store.list({ family, ...(family === "work-item" ? { kind: "work-item/meta" as const } : {}) }))).toMatchObject({ status: "absent" });
    });
  }
  everyKind(context, "unreadable-family", async (fixture, reference) => {
    await seed(fixture, reference);
    await fixture.plant(reference, "family-unreadable");
    expect(success(await fixture.store.list({ family: KIND_REGISTRY[reference.kind].family }))).toMatchObject({ status: "unreadable", condition: expect.any(String), remedy: { text: expect.any(String) } });
  });
  for (const kind of ["unreadable", "oversized", "malformed", "key-mismatch", "unknown-format-version"] as const) {
    everyKind(context, `diagnostic-${kind}`, async (fixture, reference) => {
      const record = await seed(fixture, reference);
      await fixture.plant(record.reference, kind);
      const listed = success(await fixture.store.list({ family: KIND_REGISTRY[reference.kind].family, kind: reference.kind }));
      expect(listed).toMatchObject({ status: "complete", records: [], missed: true,
        diagnostics: [{ kind, key: expect.any(String), condition: expect.any(String), remedy: { text: expect.any(String) } }] });
    });
  }
  assertion(context, "personal", "all-readable-records-and-one-diagnostic-per-bad-entry", async (fixture) => {
    const good = await seed(fixture, fixture.reference("personal/document"));
    const diagnostics: ListingDiagnostic["kind"][] = ["malformed", "oversized", "unreadable", "unknown-format-version", "key-mismatch"];
    for (const [index, kind] of diagnostics.entries()) {
      const reference = RecordReferenceSchema.parse({ ...good.reference, key: `scratch/bad-${index}.md` });
      await seed(fixture, reference);
      await fixture.plant(reference, kind);
    }
    const listed = success(await fixture.store.list({ family: "personal", kind: "personal/document" }));
    if (listed.status !== "complete") throw new Error("Expected completed enumeration");
    expect(listed.records).toEqual([good]);
    expect(listed.diagnostics.map((diagnostic) => diagnostic.kind).sort()).toEqual(diagnostics.sort());
    expect(new Set(listed.diagnostics.map((diagnostic) => diagnostic.key)).size).toBe(5);
    expect(listed.missed).toBe(true);
  });
  assertion(context, "work-item", "lifecycle-location-filter", async (fixture) => {
    const active = await seed(fixture, fixture.reference("work-item/meta"));
    const planned = await seed(fixture, fixture.reference("work-item/meta", "planned"), undefined, { kind: "backlog", commitment: "planned" });
    const provisional = await seed(fixture, fixture.reference("work-item/meta", "provisional"), undefined, { kind: "backlog", commitment: "provisional" });
    const completedRef = fixture.reference("work-item/meta", "completed");
    const placement = { kind: "completed" as const, quarter: ArchiveQuarterSchema.parse("2026-q4") };
    const completed = fixture.materialize ? await fixture.materialize(completedRef, placement) : await seed(fixture, completedRef, undefined, placement);
    for (const [location, record] of [["active", active], ["planned", planned], ["provisional", provisional], ["completed", completed]] as const) {
      const listed = success(await fixture.store.list({ family: "work-item", kind: "work-item/meta", filter: { locations: [location] } }));
      if (listed.status !== "complete") throw new Error("Expected lifecycle complete listing");
      expect(listed.records).toEqual([record]);
    }
  });
  assertion(context, "work-item", "listing-per-record-mutation-basis", async (fixture) => {
    const active = await seed(fixture, fixture.reference("work-item/meta"));
    const listed = success(await fixture.store.list({ family: "work-item", kind: "work-item/meta" }));
    if (listed.status !== "complete") throw new Error("Expected current listing");
    await seed(fixture, fixture.reference("work-item/meta", "unrelated"));
    const chosen = listed.records.find((record) => record.reference.owner.name === active.reference.owner.name);
    if (!chosen) throw new Error("Expected seeded active record");
    success(await fixture.store.write(update(fixture, chosen)));
    expect(success(await fixture.store.read({ reference: chosen.reference })).content).toBe(fixture.content(chosen.reference, "changed"));
  });
}

/** Register newer formats as per-record diagnostics and recoverable direct-read refusals.
 * @param context - item 10 context.
 */
export function registerFormatAssertions(context: SuiteContext): void {
  everyKind(context, "newer-format-refusal-with-remedy", async (fixture, reference) => {
    const record = await seed(fixture, reference);
    await fixture.plant(record.reference, "unknown-format-version");
    const listed = success(await fixture.store.list({ family: KIND_REGISTRY[reference.kind].family, kind: reference.kind }));
    expect(listed).toMatchObject({ status: "complete", missed: true, diagnostics: [{ kind: "unknown-format-version" }] });
    expect(await fixture.store.read({ reference: record.reference })).toMatchObject({ status: "refused", refusal: {
      code: "record-malformed", class: "recoverable", reference: record.reference,
      rule: expect.stringContaining("format"), remedy: { text: expect.stringMatching(/merge base|rebuild/u) },
    } });
  });
}
