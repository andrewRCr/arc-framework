/** Shared selection rules for lifecycle holders reached through names, links, and claims. */
import { expect } from "vitest";
import { ArchiveQuarterSchema, SlugSchema } from "../../../src/lib/kernel/index.js";
import { RecordReferenceSchema, type StoreRecord } from "../../../src/lib/store/index.js";
import type { ConformanceFixture } from "./fixture-contract.js";
import { assertion, caseSkip, recordAssertion, seed, success, update, type SuiteContext } from "./suite-tools.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4");

function primary(kind: "work-item/meta" | "work-item/record" | "cohort/document", name: string) {
  return RecordReferenceSchema.parse({ kind, owner: { type: kind === "cohort/document" ? "cohort" : "work-item", name } });
}

async function archive(fixture: ConformanceFixture, record: StoreRecord, target = quarter) {
  success(await fixture.store.write({ ...update(fixture, record, record.content), placement: { kind: "completed", quarter: target } }));
  return success(await fixture.store.read({ reference: record.reference }));
}

/** Register selection contracts whose states are constructible through both store-arm write ports. */
export function registerRankedLookupAssertions(context: SuiteContext): void {
  for (const tier of ["current", "former"] as const) assertion(context, "work-item", `ranked-slug-completed-reuse:${tier}`, async fixture => {
    const slug = SlugSchema.parse("ranked-shared"), references = [];
    for (let generation = 0; generation < 3; generation++) {
      let record = await seed(fixture, primary("work-item/meta", slug));
      if (tier === "former") {
        const renamed = RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner, name: `ranked-holder-${generation}` } });
        success(await fixture.store.write({ ...update(fixture, record, record.content), reference: renamed }));
        record = success(await fixture.store.read({ reference: renamed }));
      }
      const closed = await archive(fixture, record, generation === 1 ? ArchiveQuarterSchema.parse("2026-q3") : quarter);
      references.push(closed.reference);
      expect(success(await fixture.store.lookup({ kind: "slug", slug })).reference).toEqual(references[generation === 2 ? 2 : 0]);
    }
  });
  assertion(context, "work-item", "ranked-slug-work-unit-over-errand", async fixture => {
    const meta = await archive(fixture, await seed(fixture, primary("work-item/meta", "ranked-shared")));
    await archive(fixture, await seed(fixture, primary("work-item/record", "ranked-shared")), ArchiveQuarterSchema.parse("2027-q1"));
    expect(success(await fixture.store.lookup({ kind: "slug", slug: meta.reference.owner.name })).reference).toEqual(meta.reference);
  });
  for (const holders of ["cohort", "errands-current", "errands-former"] as const) assertion(context, "work-item", `ranked-slug-refusing-tie:${holders}`, async fixture => {
    const slug = SlugSchema.parse("ranked-tie"), references = [];
    for (let index = 0; index < 2; index++) {
      const kind = holders === "cohort" ? index === 0 ? "work-item/meta" : "cohort/document" : "work-item/record";
      let record = await seed(fixture, primary(kind, slug));
      if (holders === "errands-former") {
        const reference = RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner, name: `ranked-errand-${index}` } });
        success(await fixture.store.write({ ...update(fixture, record, record.content), reference }));
        record = success(await fixture.store.read({ reference }));
      }
      references.push((await archive(fixture, record)).reference);
    }
    const result = await fixture.store.lookup({ kind: "slug", slug });
    expect(result).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match",
      tie: { liveness: "completed", name: holders === "errands-former" ? "former" : "current" }, candidates: expect.arrayContaining(references) } });
    if (result.status === "refused" && result.refusal.code === "ambiguous-match") expect(result.refusal.candidates).toHaveLength(2);
  }, holders === "cohort" && !context.registration.declarations.families.includes("cohort") ? "No cohort is served to form the tie." : undefined);

  assertion(context, "work-item", "ranked-ref-live-ranking-and-tie", async fixture => {
    const input = { kind: "ref" as const, repository: "repo", ref: "feat/ranked" };
    const links = { branches: [{ repository: input.repository, ref: input.ref, linkedAs: "created" as const, excluded: [] }] };
    await archive(fixture, await seed(fixture, primary("work-item/meta", "ranked-branch"), undefined, { kind: "active" }, links));
    const live = await seed(fixture, primary("work-item/meta", "ranked-branch"), undefined, { kind: "active" }, links);
    expect(success(await fixture.store.lookup(input)).reference).toEqual(live.reference);
    const other = await seed(fixture, primary("work-item/meta", "ranked-other"), undefined, { kind: "active" }, links);
    const result = await fixture.store.lookup(input);
    expect(result).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match", tie: { liveness: "live" },
      candidates: expect.arrayContaining([live.reference, other.reference]) } });
    if (result.status === "refused" && result.refusal.code === "ambiguous-match") {
      expect(result.refusal.candidates).toHaveLength(2);
      expect(result.refusal.tie).not.toHaveProperty("name");
    }
  });
  assertion(context, "work-item", "ranked-ref-completed-work-unit", async fixture => {
    const input = { kind: "ref" as const, repository: "repo", ref: "feat/ranked" };
    const links = { branches: [{ repository: input.repository, ref: input.ref, linkedAs: "created" as const, excluded: [] }] };
    await archive(fixture, await seed(fixture, primary("work-item/meta", "ranked-branch"), undefined, { kind: "active" }, links));
    const latest = await archive(fixture, await seed(fixture, primary("work-item/meta", "ranked-branch"), undefined, { kind: "active" }, links));
    await archive(fixture, await seed(fixture, primary("work-item/record", "ranked-errand"), undefined, { kind: "active" }, links), ArchiveQuarterSchema.parse("2027-q1"));
    expect(success(await fixture.store.lookup(input)).reference).toEqual(latest.reference);
  });
  assertion(context, "work-item", "ranked-ref-completed-errand-tie", async fixture => {
    const input = { kind: "ref" as const, repository: "repo", ref: "feat/ranked" };
    const links = { branches: [{ repository: input.repository, ref: input.ref, linkedAs: "created" as const, excluded: [] }] };
    const references = [];
    for (const name of ["first", "second"]) references.push((await archive(fixture,
      await seed(fixture, primary("work-item/record", `ranked-${name}`), undefined, { kind: "active" }, links))).reference);
    const result = await fixture.store.lookup(input);
    expect(result).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match", tie: { liveness: "completed" }, candidates: expect.arrayContaining(references) } });
    if (result.status === "refused" && result.refusal.code === "ambiguous-match") {
      expect(result.refusal.candidates).toHaveLength(2);
      expect(result.refusal.tie).not.toHaveProperty("name");
    }
  });

  assertion(context, "work-item", "ranked-claim-uid-generations", async fixture => {
    const old = await archive(fixture, await seed(fixture, primary("work-item/meta", "ranked-claim")));
    const live = await seed(fixture, primary("work-item/meta", "ranked-claim"));
    for (const record of [old, live]) {
      if (record.reference.owner.type !== "work-item" || !record.reference.owner.uid) throw new Error("Expected an allocated work-unit UID");
      for (const slug of [record.reference.owner.name, SlugSchema.parse("ranked-stale-marker")]) {
        expect(success(await fixture.store.lookup({ kind: "claim", claim: { kind: "work-unit", slug, uid: record.reference.owner.uid } })).reference)
          .toEqual(record.reference);
      }
    }
    expect(await fixture.store.lookup({ kind: "claim", claim: { kind: "work-unit", slug: live.reference.owner.name,
      uid: "00000000-0000-4000-8000-000000000099" } })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });
  assertion(context, "work-item", "ranked-claim-without-uid", async fixture => {
    const record = await seed(fixture, primary("work-item/meta", "ranked-claim"));
    const claim = { kind: "work-unit" as const, slug: record.reference.owner.name };
    expect(await fixture.store.lookup({ kind: "claim", claim })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    if (record.reference.owner.type !== "work-item" || !record.reference.owner.uid) throw new Error("Expected an allocated work-unit UID");
    expect(success(await fixture.store.lookup({ kind: "claim", claim: { ...claim, uid: record.reference.owner.uid } })).reference).toEqual(record.reference);
  });

  if (context.registration.declarations.families.includes("work-item")) for (const [name, reason] of [
    ["live-slug-tier-facts-backend-local", "Ref backend writes refuse live slug clashes; each backend's lookup tests cover their tier facts."],
    ["cohort-former-slug-ranking-backend-local", "Reference backend writes do not retain cohort former names; each backend's lookup tests cover their ranking."],
  ] as const) {
    recordAssertion(context, "work-item", name);
    const exclusions = context.registration.declarations.familyExclusions["work-item"];
    const excluded = exclusions?.items?.[context.item] ?? exclusions?.assertions?.[name] ?? reason;
    caseSkip(context, `work-item: ${name}`, `work-item: ${name} — ${excluded}`);
  }

}
