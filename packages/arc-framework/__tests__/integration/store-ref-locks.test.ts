import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { acquireAdvisoryLock, releaseAdvisoryLock, AdvisoryLockTimeoutError } from "../../src/lib/advisory-lock.js";
import { createDefaultStorePorts, createRefLockFactory } from "../../src/lib/store/default-ports.js";
import { createRefReadFixture } from "../helpers/store/ref-read.js";

describe.each(["default", "separate"])("shared ref locks (%s layout)", (layout) => {
  it("nests full ref names under the code common Git directory and contends across worktrees", async () => {
    const f = await createRefReadFixture();
    const linked = join(f.root, "linked");
    await f.exec("git", ["worktree", "add", "--detach", linked, "HEAD"]);
    if (layout === "separate") await f.exec("git", ["init", "--bare", join(f.root, ".git", "arc", "store")]);
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

it("releases a zero-wait ref lock past a live busy break lock and permits reacquisition", async () => {
  const f = await createRefReadFixture(), ref = "refs/arc/work/12345678-1234-4234-8234-123456789abc";
  const path = join(f.root, ".git", "arc", "locks", `${ref}.lock`), breakPath = `${path}.break`;
  let sawRetry: () => void = () => {}, resume: () => void = () => {}, attempts = 0;
  const retried = new Promise<void>(resolve => { sawRetry = resolve; });
  const continuing = new Promise<void>(resolve => { resume = resolve; });
  const lock = createRefLockFactory({ ...f.ports, fs: { ...f.ports.fs, exclusiveCreate: async (target, content) => {
    try { await f.ports.fs.exclusiveCreate(target, content); }
    catch (error) {
      if (target === breakPath && typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST") {
        attempts += 1;
        if (attempts === 2) { sawRetry(); await continuing; }
      }
      throw error;
    }
  } } });
  const release = await lock(ref, 0), blocker = await acquireAdvisoryLock(breakPath);
  let cleared = false;
  const clear = async () => { if (!cleared) { cleared = true; await releaseAdvisoryLock(blocker); } };
  const pending = release();
  void pending.catch(() => undefined);
  try {
    await Promise.race([retried, pending.then(() => { throw new Error("Release passed a live break holder"); })]);
    expect(JSON.parse(await readFile(path, "utf8"))).toMatchObject({ pid: process.pid });
    expect(JSON.parse(await readFile(breakPath, "utf8"))).toMatchObject({ pid: blocker.pid, token: blocker.token });
    await clear(); resume(); await pending;
    await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(breakPath)).rejects.toMatchObject({ code: "ENOENT" });
    const next = await lock(ref, 0); await next();
    await expect(readFile(path)).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await clear(); resume(); await pending.catch(() => undefined); await release(); }
}, 15_000);
