/** Real CLI warm-Errand base freshness, policy, and resume contracts. */

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderMetaFile } from "../../src/lib/active/meta-reader.js";
import { cleanupTempDir, createTempRepo, git, runArc, runArcAnchoredSequence } from "./helpers.js";

const execFileAsync = promisify(execFile);

interface OpenResult {
  outcome: string;
  allocation?: { kind: string; checkoutPath: string };
  parentCheckoutPath?: string;
  error?: { message: string };
}

async function commitFixture(cwd: string, message: string): Promise<string> {
  await git(cwd, ["add", "-A"]);
  const tree = await git(cwd, ["write-tree"]);
  const parent = await git(cwd, ["rev-parse", "--verify", "HEAD"]).catch(() => null);
  const head = await git(cwd, ["commit-tree", tree, ...(parent === null ? [] : ["-p", parent]), "-m", message]);
  await git(cwd, ["update-ref", "HEAD", head, ...(parent === null ? [] : [parent])]);
  return head;
}

async function establishWorkUnit(cwd: string, name: string, owner: string): Promise<void> {
  await mkdir(join(cwd, ".arc", "active"), { recursive: true });
  await writeFile(join(cwd, ".arc", "active", `meta-${name}.md`), renderMetaFile(name, {
    state: "Active", owner, branch: `feat/${name}`, workClass: "Light",
  }));
  await commitFixture(cwd, `establish ${name}`);
}

async function setPolicy(cwd: string, policy: "always" | "prompt" | "disabled"): Promise<void> {
  const path = join(cwd, ".arc", "system", "arc-config.yml");
  let config = await readFile(path, "utf8");
  config = config.replace(/^branch.protection: .*$/m, "branch.protection: full")
    .replace(/^session.init_pull.base: .*$/m, `session.init_pull.base: ${policy === "prompt" ? "prompt" : "always"}`)
    .replace(/^session.remote_sync: .*$/m, `session.remote_sync: ${policy === "disabled" ? "disabled" : "enabled"}`);
  await writeFile(path, config);
}

describe("warm Errand base freshness", () => {
  let repository: string;
  let parent: string;
  let remote: string;
  let base: string;
  let parentHead: string;
  let foreignHead: string;
  let parentMeta: string;
  let foreignMeta: string;

  beforeEach(async () => {
    repository = await createTempRepo();
    parent = `${repository}-parent`;
    remote = `${repository}-remote.git`;
    const initialized = await runArc(["init", "--yes", "--name", "warm-freshness"], repository);
    expect(initialized.exitCode, initialized.stdout + initialized.stderr).toBe(0);
    await setPolicy(repository, "always");
    base = await commitFixture(repository, "initialize fixture");
    await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
    await git(repository, ["remote", "add", "origin", remote]);
    await git(repository, ["push", "-u", "origin", "main"]);
    await git(repository, ["worktree", "add", parent, "-b", "feat/parent", "main"]);
    await establishWorkUnit(parent, "parent", "test-user");
    await git(repository, ["switch", "-c", "feat/foreign"]);
    await establishWorkUnit(repository, "foreign", "test-user");
    parentHead = await git(parent, ["rev-parse", "HEAD"]);
    foreignHead = await git(repository, ["rev-parse", "HEAD"]);
    parentMeta = await readFile(join(parent, ".arc", "active", "meta-parent.md"), "utf8");
    foreignMeta = await readFile(join(repository, ".arc", "active", "meta-foreign.md"), "utf8");
    await writeFile(join(parent, "unfinished.txt"), "parent work in progress\n");
  });

  afterEach(async () => {
    const roster = await git(repository, ["worktree", "list", "--porcelain"]);
    const paths = roster.split("\n").filter((line) => line.startsWith("worktree "))
      .map((line) => line.slice("worktree ".length));
    for (const path of paths.filter((path) => path !== repository)) await cleanupTempDir(path);
    await cleanupTempDir(repository);
    await cleanupTempDir(remote);
  });

  async function advanceRemote(): Promise<string> {
    const head = await git(repository, ["commit-tree", "main^{tree}", "-p", base, "-m", "landed base change"]);
    await git(repository, ["push", "origin", `${head}:refs/heads/main`]);
    expect(await git(repository, ["rev-parse", "main"])).toBe(base);
    return head;
  }

  async function assertParentsPreserved(): Promise<void> {
    expect(await git(parent, ["rev-parse", "HEAD"])).toBe(parentHead);
    expect(await git(parent, ["branch", "--show-current"])).toBe("feat/parent");
    expect(await readFile(join(parent, ".arc", "active", "meta-parent.md"), "utf8")).toBe(parentMeta);
    expect(await readFile(join(parent, "unfinished.txt"), "utf8")).toBe("parent work in progress\n");
    expect(await git(repository, ["rev-parse", "HEAD"])).toBe(foreignHead);
    expect(await git(repository, ["branch", "--show-current"])).toBe("feat/foreign");
    expect(await readFile(join(repository, ".arc", "active", "meta-foreign.md"), "utf8")).toBe(foreignMeta);
  }

  async function open(slug: string): Promise<OpenResult> {
    const result = await runArcAnchoredSequence([["errand", "open", slug, "--json"]], parent);
    expect(result.results).toHaveLength(1);
    const opened = result.results[0] as OpenResult;
    return opened;
  }

  it.each(["stale", "current"] as const)("starts at the resolved %s base without changing other work units", async (state) => {
    const expected = state === "stale" ? await advanceRemote() : base;
    const opened = await open("fresh-start");
    expect(opened).toMatchObject({ outcome: "applied", allocation: { kind: "spawned" }, parentCheckoutPath: parent });
    if (opened.allocation === undefined) throw new Error("No allocated checkout");
    expect(await git(opened.allocation.checkoutPath, ["rev-parse", "HEAD"])).toBe(expected);
    expect(await git(repository, ["rev-parse", "main"])).toBe(expected);
    await assertParentsPreserved();
  });

  it("refuses unavailable base evidence, rolls back its claim, and succeeds after repair", async () => {
    const expected = await advanceRemote();
    await git(remote, ["config", "uploadpack.hideRefs", "refs/heads/main"]);
    const refused = await open("refresh-retry");
    expect(refused).toMatchObject({ outcome: "error", error: { message: expect.stringContaining("fetch-failed") } });
    expect(refused.allocation).toBeUndefined();
    expect(await git(repository, ["branch", "--list", "chore/refresh-retry"])).toBe("");
    const claims = await git(repository, ["ls-tree", "--name-only", "refs/arc/user/test-user/errands"]);
    expect(claims).not.toContain("refresh-retry");
    expect(await git(repository, ["rev-parse", "main"])).toBe(base);
    await assertParentsPreserved();
    await git(remote, ["config", "--unset", "uploadpack.hideRefs"]);
    const retried = await open("refresh-retry");
    expect(retried).toMatchObject({ outcome: "applied", allocation: { kind: "spawned" } });
    if (retried.allocation === undefined) throw new Error("No allocated checkout");
    expect(await git(retried.allocation.checkoutPath, ["rev-parse", "HEAD"])).toBe(expected);
    await assertParentsPreserved();
  });

  it("refuses a dirty checked-out base and retries without touching either work unit", async () => {
    const expected = await advanceRemote();
    const baseCheckout = `${repository}-base`;
    await git(repository, ["worktree", "add", baseCheckout, "main"]);
    const path = join(baseCheckout, ".gitignore");
    const original = await readFile(path, "utf8");
    await writeFile(path, original + "\nunfinished-base-edit\n");
    const refused = await open("dirty-base-retry");
    expect(refused).toMatchObject({ outcome: "error", error: { message: expect.stringContaining("dirty-base-worktree") } });
    expect(refused.error?.message).toContain("retry Errand open");
    expect(await readFile(path, "utf8")).toBe(original + "\nunfinished-base-edit\n");
    expect(await git(repository, ["branch", "--list", "chore/dirty-base-retry"])).toBe("");
    await assertParentsPreserved();
    await writeFile(path, original);
    const retried = await open("dirty-base-retry");
    expect(retried).toMatchObject({ outcome: "applied", allocation: { kind: "spawned" } });
    if (retried.allocation === undefined) throw new Error("No allocated checkout");
    expect(await git(retried.allocation.checkoutPath, ["rev-parse", "HEAD"])).toBe(expected);
    await assertParentsPreserved();
  });

  it("keeps the existing local-ahead policy when there is nothing to pull", async () => {
    const local = await git(repository, ["commit-tree", "main^{tree}", "-p", base, "-m", "local base work"]);
    await git(repository, ["update-ref", "refs/heads/main", local, base]);
    const opened = await open("local-ahead-start");
    expect(opened).toMatchObject({ outcome: "applied", allocation: { kind: "spawned" } });
    if (opened.allocation === undefined) throw new Error("No allocated checkout");
    expect(await git(opened.allocation.checkoutPath, ["rev-parse", "HEAD"])).toBe(local);
    expect(await git(remote, ["rev-parse", "main"])).toBe(base);
    await assertParentsPreserved();
  });

  it.each(["prompt", "disabled"] as const)("honors %s base-refresh policy", async (policy) => {
    await advanceRemote();
    await setPolicy(parent, policy);
    const opened = await open("policy-start");
    expect(opened).toMatchObject({ outcome: "applied", allocation: { kind: "spawned" } });
    if (opened.allocation === undefined) throw new Error("No allocated checkout");
    expect(await git(opened.allocation.checkoutPath, ["rev-parse", "HEAD"])).toBe(base);
    expect(await git(repository, ["rev-parse", "main"])).toBe(base);
    await assertParentsPreserved();
  });

  it("resumes the preserved head without refreshing a newer unavailable base", async () => {
    const nextBase = await advanceRemote();
    await git(remote, ["config", "uploadpack.hideRefs", "refs/heads/main"]);
    // Refresh is disabled only for the first creation; re-entry uses the parent's always policy.
    await setPolicy(parent, "prompt");
    const sequence = await runArcAnchoredSequence([
      ["errand", "open", "retained-head", "--json"],
      { command: ["git", "push", "-u", "origin", "chore/retained-head"], cwdFromPreviousJson: "allocation.checkoutPath" },
      { args: ["errand", "leave", "retained-head", "--state", "paused", "--json"], reuseResolvedCwd: true },
      { command: [process.execPath, "-e", "const fs=require('node:fs');const p=process.argv[1];fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('session.init_pull.base: prompt','session.init_pull.base: always'));", join(parent, ".arc", "system", "arc-config.yml")], cwd: parent },
      { args: ["errand", "open", "retained-head", "--json"], cwd: parent },
    ], parent, { timeout: 60_000 });
    expect(sequence.exitCode, sequence.stdout + sequence.stderr).toBe(0);
    const resumed = sequence.results.at(-1) as OpenResult;
    expect(resumed).toMatchObject({ outcome: "applied", allocation: { kind: "spawned" } });
    if (resumed.allocation === undefined) throw new Error("No allocated checkout");
    expect(await git(resumed.allocation.checkoutPath, ["rev-parse", "HEAD"])).toBe(base);
    expect(await git(remote, ["rev-parse", "main"])).toBe(nextBase);
    await assertParentsPreserved();
  });
});
