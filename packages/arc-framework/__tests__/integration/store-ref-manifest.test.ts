import { describe, expect, it } from "vitest";
import { createRefReadFixture } from "../helpers/store/ref-read.js";
import { plantRef } from "../helpers/store/ref-plant.js";

const uid = "12345678-1234-4234-8234-123456789abc";
const stored = [`refs/arc/work/${uid}`, `refs/arc/cohort/${uid}`, "refs/arc/archive/2026-Q4",
  "refs/arc/project/inbox", "refs/arc/project/registry", "refs/arc/user/andrew/personal", "refs/arc/user/zoe/claims"];
const ignored = ["refs/arc/user/andrew/errands", "refs/arc/user/andrew/sync-state", "refs/arc/bootstrap/old",
  "refs/arc/tmp/other", "refs/arc/tmp/version", "refs/arc/project/moved", `refs/arc/history/work/${uid}`];

describe.each(["files", "reftable"] as const)("ref manifest (%s)", (format) => {
  it.each(["sha1", "sha256"] as const)("matches Git's own tree and excludes control and legacy refs (%s)", async (objectFormat) => {
    const f = await createRefReadFixture(format, undefined, objectFormat);
    const tips = new Map<string, string>();
    for (const [index, ref] of stored.entries()) {
      const planted = await plantRef(f.root, ref, [{ path: "seed", content: `state-${index}` }]);
      tips.set(ref, planted.tip);
    }
    const expected = await plantRef(f.root, "refs/test/manifest", [...tips].map(([ref, oid]) => ({ path: ref.slice("refs/arc/".length), oid, mode: "160000" })));
    const before = await f.store.version();
    expect(before).toEqual({ status: "ok", result: expected.tree });
    for (const [index, ref] of ignored.entries()) await plantRef(f.root, ref, [{ path: "seed", content: `ignored-${index}` }]);
    expect(await f.store.version()).toEqual(before);
  });
  it("uses Git's empty SHA-256 tree for an empty state store", async () => {
    const f = await createRefReadFixture(format, undefined, "sha256");
    const empty = await plantRef(f.root, "refs/test/empty", []);
    expect(await f.store.version()).toEqual({ status: "ok", result: empty.tree });
    expect(empty.tree).toHaveLength(64);
  });
});
