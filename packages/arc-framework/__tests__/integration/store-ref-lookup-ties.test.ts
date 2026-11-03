import { clashRepair } from "../../src/lib/store/clash-repair.js";
import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { plantRef } from "../helpers/store/ref-plant.js";
import { SlugSchema } from "../../src/lib/kernel/schema/slug.js";
import type { LookupInput } from "../../src/lib/store/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";

const quarter = ArchiveQuarterSchema.parse("2026-q4");

describe("ref lookup refusal tiers", () => {
  it.each(["cohort", "Errands", "former Errands"] as const)("keeps a completed tie with %s ambiguous", async (holders) => {
    const f = await createRefFixture();
    const references = [];
    const target = f.reference("work-item/meta", "shared").owner.name;
    for (let index = 0; index < 2; index++) {
      const kind = holders === "cohort" ? index === 0 ? "work-item/meta" : "cohort/document" : "work-item/record";
      const reference = RecordReferenceSchema.parse({ ...f.reference(kind), owner: { type: kind === "cohort/document" ? "cohort" : "work-item", name: target } });
      let record = await seed(f, reference);
      if (holders === "former Errands") {
        const renamed = RecordReferenceSchema.parse({ ...record.reference, owner: { ...record.reference.owner, name: `holder-${index}` } });
        success(await f.store.write({ ...update(f, record, record.content), reference: renamed }));
        record = success(await f.store.read({ reference: renamed }));
      }
      success(await f.store.write({ ...update(f, record, record.content), placement: { kind: "completed", quarter } }));
      references.push(record.reference);
    }
    expect(await f.store.lookup({ kind: "slug", slug: target })).toMatchObject({ status: "refused", refusal: {
      code: "ambiguous-match", tie: { liveness: "completed", name: holders === "former Errands" ? "former" : "current" },
      candidates: expect.arrayContaining(references),
      remedy: { text: expect.stringContaining("No lifecycle repair is available for completed holders:"), argv: ["arc", "status", "--json"] },
    } });
  });
  it.each(["claim", "commit", "lineage"] as const)("leaves %s ambiguity without ranked tier facts", async (kind) => {
    const f = await createRefFixture(), sha = "a".repeat(40);
    let input: LookupInput;
    if (kind === "lineage") {
      const owners = [["00000000-0000-4000-8000-000000000001", "one"], ["00000000-0000-4000-8000-000000000002", "two"]];
      await plantRef(f.root, "refs/arc/project/registry", [
        { path: "metadata-registry.json", content: JSON.stringify({ formatVersion: 1, formats: {},
          lineage: Object.fromEntries(owners), lineageFormerSlugs: Object.fromEntries(owners.map(([uid]) => [uid, ["shared"]])) }) },
        ...owners.map(([uid, name]) => ({ path: `lineage/${uid}.json`, content: JSON.stringify({ schemaVersion: 2,
          origin: { uid, name }, kind: "abandon", successors: [], incoming: [] }) })),
      ]);
      input = { kind: "lineage", origin: "shared" };
    } else {
      let name = SlugSchema.parse("shared");
      for (const suffix of ["one", "two"]) {
        const record = await seed(f, f.reference(kind === "claim" ? "work-item/record" : "work-item/meta", kind === "claim" ? "shared" : suffix),
          undefined, { kind: "active" }, { landingCommit: { repository: "repo", sha } });
        name = record.reference.owner.name;
        if (kind === "claim") success(await f.store.write({ ...update(f, record, record.content), placement: { kind: "completed", quarter } }));
      }
      input = kind === "claim" ? { kind: "claim", claim: { kind: "errand", slug: name, claimId: "1".repeat(32) } }
        : { kind: "commit", repository: "repo", sha };
    }
    const result = await f.store.lookup(input);
    expect(result).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match" } });
    if (result.status === "refused") {
      expect(result.refusal).not.toHaveProperty("tie");
      expect(result.refusal.remedy.text).toBe("Name the intended owner by UID, then repeat the lookup.");
    }
  });

});

it.each([
  ["work-item/meta", "work-item/meta"], ["work-item/meta", "cohort/document"],
  ["work-item/meta", "work-item/record"], ["work-item/record", "work-item/record"],
  ["cohort/document", "cohort/document"],
] as const)("repairs a live slug clash between %s and %s", async (left, right) => {
  const f = await createRefFixture();
  const references = [];
  for (const [index, kind] of [left, right].entries()) {
    const uid = `00000000-0000-4000-8000-00000000000${index + 1}`;
    const cohort = kind === "cohort/document";
    const reference = RecordReferenceSchema.parse({ kind, owner: { type: cohort ? "cohort" : "work-item", name: "shared", uid } });
    await plantRef(f.root, `refs/arc/${cohort ? "cohort" : "work"}/${uid}`, [
      { path: `metadata-${uid}.json`, content: JSON.stringify({ formatVersion: 1, formats: {}, slug: "shared", formerSlugs: [],
        ...(cohort ? {} : { primary: { role: kind, placement: { kind: "active" } } }) }) },
      { path: kind === "work-item/record" ? `errand-${uid}.json` : `${cohort ? "cohort" : "meta"}-shared.md`, content: f.content(reference) },
    ]);
    references.push(reference);
  }
  const result = await f.store.lookup({ kind: "slug", slug: SlugSchema.parse("shared") });
  expect(result).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match", candidates: expect.arrayContaining(references) } });
  if (result.status !== "refused" || result.refusal.code !== "ambiguous-match") throw new Error("Expected clash");
  expect(result.refusal.remedy).toEqual(clashRepair(result.refusal.candidates, { liveness: "live", name: "current" }));
});
