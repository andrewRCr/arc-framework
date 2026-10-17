import { describe, expect, it } from "vitest";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success } from "../helpers/store/suite-tools.js";

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

});
