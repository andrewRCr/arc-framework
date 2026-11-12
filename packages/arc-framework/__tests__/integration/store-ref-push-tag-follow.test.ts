import { describe, expect, it } from "vitest";
import { refCarryFixture, carriedBranch } from "../helpers/store/ref-carry.js";
import { success } from "../helpers/store/suite-tools.js";

describe.each(["default", "separate"] as const)("explicit carried refs in %s", layout => {
  it.each([false, true])("keeps a reachable annotated tag local with push.followTags=%s", async followTags => {
    const h = await refCarryFixture(layout);
    await h.a.exec("git", ["config", "push.followTags", String(followTags)]);
    await h.a.exec("git", ["tag", "-a", "private-release", "-m", "Local annotated release", h.code.tip]);
    const before = (await h.remote("git", ["for-each-ref", "--format=%(refname)"])).stdout.trim().split("\n").filter(Boolean);
    const result = success(await h.a.store.push({ carry: { ref: carriedBranch } }));
    expect(result.carry).toEqual({ ref: carriedBranch, status: "pushed" });
    const after = (await h.remote("git", ["for-each-ref", "--format=%(refname)"])).stdout.trim().split("\n").filter(Boolean);
    expect(after.filter(ref => !before.includes(ref)).sort()).toEqual([carriedBranch, "refs/arc/user/andrew/personal"].sort());
    expect((await h.remote("git", ["rev-parse", carriedBranch])).stdout.trim()).toBe(h.code.tip);
  }, 45_000);
});
