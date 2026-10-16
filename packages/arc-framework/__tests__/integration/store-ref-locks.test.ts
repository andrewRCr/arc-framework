import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AdvisoryLockTimeoutError } from "../../src/lib/advisory-lock.js";
import { createDefaultStorePorts, createRefLockFactory } from "../../src/lib/store/default-ports.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";

describe.each(["default", "separate"])("shared ref locks (%s layout)", (layout) => {
  it("nests full ref names under the code common Git directory and contends across worktrees", async () => {
    const f = await createRefReadFixture();
    const linked = join(f.root, "linked");
    await f.exec("git", ["worktree", "add", "--detach", linked, "HEAD"]);
    if (layout === "separate") await mkdir(join(f.root, ".git", "arc", "store.git"), { recursive: true });
    const lock = createRefLockFactory(f.ports);
    const other = createRefLockFactory(createDefaultStorePorts({ checkoutRoot: linked }));
    const ref = "refs/arc/work/12345678-1234-4234-8234-123456789abc";
    const path = join(f.root, ".git", "arc", "locks", `${ref}.lock`);
    const release = await lock(ref, 100);
    try {
      expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ pid: process.pid, token: expect.any(String) });
      await expect(other(ref, 20)).rejects.toBeInstanceOf(AdvisoryLockTimeoutError);
      await expect(other(ref, 20)).rejects.toMatchObject({ lockPath: path });
    } finally { await release(); }
    const releaseOther = await other(ref, 100);
    await releaseOther();
    await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
