import { describe, expect, it } from "vitest";
import { join } from "node:path";
import { createRefFixture } from "../helpers/store/ref-fixture.js";
import { seed, success, update } from "../helpers/store/suite-tools.js";
import { readGitDirectories } from "../../src/lib/git/directories.js";
import { makeGitExec } from "../helpers/integration.js";

describe.each(["default", "separate"] as const)("conformance fixture hooks (%s)", (layout) => {
  it("holds a real ref lock, releases it, and plants faults in the selected repository", async () => {
    const f = await createRefFixture({}, layout);
    const record = await seed(f, f.reference("personal/document"));
    await f.hold(record.reference, true);
    try { expect(await f.store.write(update(f, record))).toMatchObject({ status: "refused", refusal: { code: "lock-held" } }); }
    finally { await f.hold(record.reference, false); }
    success(await f.store.write(update(f, record)));
    await f.plant(record.reference, "oversized");
    expect(success(await f.store.list({ family: "personal" }))).toMatchObject({ status: "complete", missed: true,
      diagnostics: [{ kind: "oversized" }] });
    const { commonDir } = await readGitDirectories(f.root, f.ports.fs), directory = join(commonDir, "arc", "store");
    const git = makeGitExec(f.root);
    if (layout === "separate") {
      expect((await f.ports.fs.lstat(directory)).isDirectory()).toBe(true);
      expect((await git("git", [`--git-dir=${directory}`, "rev-parse", "--show-ref-format"])).stdout).toBe("reftable");
      expect((await git("git", ["for-each-ref", "--format=%(refname)", "refs/arc/"])).stdout).toBe("");
      await expect(git("git", ["config", "--get", "remote.origin.arc-state"])).rejects.toThrow();
    } else expect((await git("git", ["config", "--get", "remote.origin.arc-state"])).stdout).toBe("push");
  });
  it.each(["namespace-corrupt", "unsupported:held-here", "state-unresolvable"] as const)("produces and repairs %s through public operations", async (id) => {
    const f = await createRefFixture({}, layout);
    const operation = await f.produce(id);
    expect(await operation.run()).toMatchObject({ status: "refused", refusal: { code: id === "unsupported:held-here" ? "unsupported" : id } });
    await f.repair(id);
    expect(await operation.run()).toMatchObject({ status: "ok" });
  });
});
