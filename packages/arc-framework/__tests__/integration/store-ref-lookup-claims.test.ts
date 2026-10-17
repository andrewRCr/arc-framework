import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { update } from "../helpers/store/suite-tools.js";
import type { LookupInput } from "../../src/lib/store/index.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";

const claimId = "1".repeat(32);

describe("ref lookup of checkout claims", () => {
  it("resolves a work-unit claim by slug", async () => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference("work-item/meta"));
    expect(success(await f.store.lookup({ kind: "claim", claim: { kind: "work-unit", slug: record.reference.owner.name } }))).toEqual({ reference: record.reference });
  });

  it("resolves an Errand claim by both slug and claim ID", async () => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference("work-item/record"));
    const claim = { kind: "errand" as const, slug: record.reference.owner.name, claimId };
    expect(success(await f.store.lookup({ kind: "claim", claim }))).toEqual({ reference: record.reference });
    expect(await f.store.lookup({ kind: "claim", claim: { ...claim, claimId: "2".repeat(32) } })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });

  it.each(["groom", "housekeep"] as const)("resolves a %s claim only from the configured identity", async (kind) => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference(`claims/${kind}`));
    const other = RecordReferenceSchema.parse({ ...record.reference, owner: { type: "person", name: "other" } });
    f.identity("other");
    await seed(f, other);
    f.identity("test-user");
    const claim = { kind, slug: SlugSchema.parse(String(record.reference.key)), claimId };
    expect(success(await f.store.lookup({ kind: "claim", claim }))).toEqual({ reference: record.reference });
    f.identity(undefined);
    expect(await f.store.lookup({ kind: "claim", claim })).toMatchObject({ status: "refused", refusal: { code: "not-found", condition: expect.stringContaining("identity") } });
    f.identity("other");
    expect(success(await f.store.lookup({ kind: "claim", claim }))).toEqual({ reference: other });
  });

  it("names a partial Errand claim as keeping no stored record", async () => {
    const f = await createRefFixture();
    expect(await f.store.lookup({ kind: "claim", claim: { kind: "partial-errand", slug: SlugSchema.parse("partial"), claimId: null } }))
      .toMatchObject({ status: "refused", refusal: { code: "not-found", condition: expect.stringMatching(/no stored record|keeps no record/iu) } });
  });
  it("refuses held-here listings with an actionable supported retry", async () => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference("work-item/meta"));
    const asOf = await f.settle();
    for (const snapshot of [undefined, asOf]) {
      expect(await f.store.list({ family: "work-item", filter: { heldHere: true }, asOf: snapshot }))
        .toMatchObject({ status: "refused", refusal: { code: "unsupported", case: "held-here", class: "recoverable", remedy: { text: expect.stringMatching(/lookup|without/u) } } });
      const listing = success(await f.store.list({ family: "work-item", asOf: snapshot }));
      expect(listing).toMatchObject({ status: "complete", records: expect.arrayContaining([expect.objectContaining({ reference: record.reference })]) });
    }
  });

  it.each(["ended", "branch", "errand", "groom"] as const)("gives write checks the same %s lookup in both captured views", async (kind) => {
    const observed: unknown[] = [];
    const f = await createRefFixture({ "personal/document": { check: async ({ before, after }) => {
      observed.push(await before.lookup(lookup), await after.lookup(lookup));
      return [];
    } } });
    const primary = await seed(f, f.reference("work-item/meta"), undefined, { kind: "active" }, {
      branches: [{ repository: "repo", ref: "feat/example", linkedAs: "created", excluded: [] }],
    });
    success(await f.store.write({ ...update(f, primary, primary.content), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    const record = kind === "groom" ? await seed(f, f.reference("claims/groom"))
      : kind === "errand" ? await seed(f, f.reference("work-item/record")) : primary;
    const lookup: LookupInput = kind === "ended" ? { kind: "slug", slug: record.reference.owner.name }
      : kind === "branch" ? { kind: "ref", repository: "repo", ref: "feat/example" }
      : { kind: "claim", claim: { kind, slug: kind === "groom" ? SlugSchema.parse(String(record.reference.key)) : record.reference.owner.name, claimId } };
    await seed(f, f.reference("personal/document"));
    expect(observed).toEqual([{ status: "ok", result: { reference: record.reference } }, { status: "ok", result: { reference: record.reference } }]);
  });

});
