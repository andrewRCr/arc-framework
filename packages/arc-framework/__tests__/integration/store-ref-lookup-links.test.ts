import { describe, expect, it } from "vitest";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";

describe("ref lookup through code links", () => {
  it("resolves only the repository-qualified linked branch", async () => {
    const f = await createRefFixture();
    const record = await seed(f, f.reference("work-item/meta"), undefined, { kind: "active" }, {
      branches: [{ repository: "repo", ref: "feat/example", linkedAs: "created", excluded: [] }],
    });
    expect(success(await f.store.lookup({ kind: "ref", repository: "repo", ref: "feat/example" }))).toEqual({ reference: record.reference });
    expect(await f.store.lookup({ kind: "ref", repository: "other", ref: "feat/example" })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });
  it("prefers exact repository SHAs over copy keys across all records and returns every captured task", async () => {
    const f = await createRefFixture(), repository = "repo", sha = "a".repeat(40), copied = "b".repeat(40), landing = "d".repeat(40);
    const copyKey = `v1:${"c".repeat(64)}:${"f".repeat(64)}`;
    const exact = await seed(f, f.reference("work-item/meta"), undefined, { kind: "active" }, {
      taskCaptures: { "1.1": [{ repository, sha }], "1.2": [{ repository, sha }], "2.1": [{ repository: "other", sha }] },
      landingCommit: { repository, sha: landing },
    });
    const copy = await seed(f, f.reference("work-item/meta", "two"), undefined, { kind: "active" }, {
      taskCaptures: { "3.1": [{ repository, sha: copied, copyKey }] },
    });
    expect(success(await f.store.lookup({ kind: "commit", repository, sha, copyKey }))).toEqual({ reference: exact.reference, taskIds: ["1.1", "1.2"] });
    expect(success(await f.store.lookup({ kind: "commit", repository: "other", sha, copyKey }))).toEqual({ reference: exact.reference, taskIds: ["2.1"] });
    expect(success(await f.store.lookup({ kind: "commit", repository, sha: "e".repeat(40), copyKey }))).toEqual({ reference: copy.reference, taskIds: ["3.1"] });
    expect(success(await f.store.lookup({ kind: "commit", repository, sha: landing, copyKey }))).toEqual({ reference: exact.reference, taskIds: [] });
    expect(await f.store.lookup({ kind: "commit", repository: "wrong", sha, copyKey })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
    expect(await f.store.lookup({ kind: "commit", repository, sha: "e".repeat(40) })).toMatchObject({ status: "refused", refusal: { code: "not-found" } });
  });

  it("ranks a live branch holder above completed holders and names a live tie", async () => {
    const f = await createRefFixture(), repository = "repo", ref = "feat/reused";
    const links = { branches: [{ repository, ref, linkedAs: "created" as const, excluded: [] }] };
    const old = await seed(f, f.reference("work-item/meta", "shared"), undefined, { kind: "active" }, links);
    success(await f.store.write({ ...update(f, old, old.content), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
    const live = await seed(f, f.reference("work-item/meta", "shared"), undefined, { kind: "active" }, links);
    const input = { kind: "ref" as const, repository, ref };
    expect(success(await f.store.lookup(input)).reference).toEqual(live.reference);
    const other = await seed(f, f.reference("work-item/meta", "other"), undefined, { kind: "active" }, links);
    const result = await f.store.lookup(input);
    expect(result).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match",
      tie: { liveness: "live" }, candidates: expect.arrayContaining([live.reference, other.reference]) } });
    if (result.status === "refused" && result.refusal.code === "ambiguous-match") {
      expect(result.refusal.candidates).toHaveLength(2);
      expect(result.refusal.tie).not.toHaveProperty("name");
    }
  });

  it.each(["work units", "Errands"] as const)("ranks completed branch holders among %s", async (holders) => {
    const f = await createRefFixture(), repository = "repo", ref = "feat/completed";
    const links = { branches: [{ repository, ref, linkedAs: "created" as const, excluded: [] }] };
    const references = [];
    for (const name of ["first", "second"]) {
      const record = await seed(f, f.reference(holders === "work units" ? "work-item/meta" : "work-item/record", name), undefined, { kind: "active" }, links);
      success(await f.store.write({ ...update(f, record, record.content), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") } }));
      references.push(record.reference);
    }
    const input = { kind: "ref" as const, repository, ref };
    if (holders === "work units") {
      const errand = await seed(f, f.reference("work-item/record", "newer"), undefined, { kind: "active" }, links);
      success(await f.store.write({ ...update(f, errand, errand.content), placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2027-q1") } }));
      expect(success(await f.store.lookup(input)).reference).toEqual(references[1]);
    } else {
      const result = await f.store.lookup(input);
      expect(result).toMatchObject({ status: "refused", refusal: { code: "ambiguous-match", tie: { liveness: "completed" }, candidates: expect.arrayContaining(references) } });
      if (result.status === "refused" && result.refusal.code === "ambiguous-match") expect(result.refusal.tie).not.toHaveProperty("name");
    }
  });

});
