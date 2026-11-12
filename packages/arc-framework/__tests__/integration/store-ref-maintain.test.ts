import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { makeGitExec } from "../helpers/integration.js";
import { seed, success } from "../helpers/store/suite-tools.js";
import { readGitDirectories } from "../../src/lib/git/directories.js";
import { RecordReferenceSchema } from "../../src/lib/store/index.js";

describe.each(["default", "separate"] as const)("ref maintenance (%s)", (layout) => {
  async function fixture() {
    const f = await createRefFixture(), git = makeGitExec(f.root);
    if (layout === "separate") await git("git", ["config", "remote.origin.arc-state", "off"]);
    const { commonDir } = await readGitDirectories(f.root, f.ports.fs);
    return { ...f, git, args: layout === "separate" ? [`--git-dir=${join(commonDir, "arc", "store")}`] : [] };
  }
  it("measures only the person's and project's permanent refs", async () => {
    const f = await fixture();
    for (const kind of ["personal/document", "claims/groom", "project-inbox/inbox", "project-registry/identity", "work-item/meta"] as const) {
      await seed(f, f.reference(kind));
    }
    f.identity("other");
    await seed(f, RecordReferenceSchema.parse({ ...f.reference("personal/document"), owner: { type: "person", name: "other" } }));
    f.identity("test-user");
    const refs = ["refs/arc/user/test-user/personal", "refs/arc/user/test-user/claims", "refs/arc/project/inbox", "refs/arc/project/registry"];
    const result = success(await f.store.maintain());
    expect(result.measurements?.map(({ ref }) => ref).sort()).toEqual([...refs].sort());
    for (const ref of refs) {
      const commits = Number((await f.git("git", [...f.args, "rev-list", "--count", ref])).stdout);
      const diskBytes = Number((await f.git("git", [...f.args, "rev-list", "--disk-usage", "--objects", ref])).stdout);
      expect(commits).toBeGreaterThan(0);
      expect(diskBytes).toBeGreaterThan(0);
      expect(result.measurements).toContainEqual({ ref, commits, diskBytes });
    }
  });
  it("leaves absent refs out and measures project refs without an identity", async () => {
    const f = await fixture();
    await seed(f, f.reference("project-inbox/inbox"));
    await seed(f, f.reference("personal/document"));
    f.identity(undefined);
    expect(success(await f.store.maintain()).measurements).toEqual([
      { ref: "refs/arc/project/inbox", commits: expect.any(Number), diskBytes: expect.any(Number) },
    ]);
  });
  it("reports a Git maintenance failure and succeeds after configuration is repaired", async () => {
    const f = await fixture();
    await seed(f, f.reference("personal/document"));
    await f.git("git", [...f.args, "config", "maintenance.strategy", "invalid"]);
    try { await expect(f.store.maintain()).rejects.toThrow(/unknown maintenance strategy/u); }
    finally { await f.git("git", [...f.args, "config", "--unset", "maintenance.strategy"]); }
    expect(success(await f.store.maintain()).measurements).toEqual([
      { ref: "refs/arc/user/test-user/personal", commits: 1, diskBytes: expect.any(Number) },
    ]);
  });
});
