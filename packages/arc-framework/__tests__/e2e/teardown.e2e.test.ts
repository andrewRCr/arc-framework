/**
 * E2E smoke for `arc teardown` — confirms the command is registered and the
 * handler wiring reaches the verb's refusal paths through the built CLI. The
 * merge-strategy-independent reaping mechanics are covered at the integration tier
 * (against the verb directly with real git); this asserts only the user-facing
 * command surface.
 */

import { describe, it, expect, afterEach } from "vitest";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runArc, createTempRepo, cleanupTempDir, git } from "./helpers.js";

async function prepareSelfTeardown(
  repo: string,
  worktreeParent: string,
  options: { marked: boolean },
): Promise<string> {
  const init = await runArc(["init", "--yes", "--name", "test-project"], repo);
  expect(init.exitCode).toBe(0);
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "--allow-empty", "-m", "chore: initialize ARC"]);
  await git(repo, ["checkout", "-b", "feat/demo"]);
  await writeFile(join(repo, "demo.txt"), "demo\n");
  await git(repo, ["add", "demo.txt"]);
  await git(repo, ["commit", "-m", "feat: demo"]);
  await git(repo, ["checkout", "main"]);
  await git(repo, ["merge", "--no-ff", "feat/demo", "-m", "merge: demo"]);
  const completedRelative = ".arc/completed/2026-q3/01_demo/meta-demo.md";
  const completed = join(repo, ".arc", "completed", "2026-q3", "01_demo");
  await mkdir(completed, { recursive: true });
  await writeFile(join(completed, "meta-demo.md"), "# Metadata: demo\n\n- **State:** Shipped\n");
  await git(repo, ["add", "-f", "--", completedRelative]);
  await git(repo, ["commit", "-m", "chore: archive demo"]);
  await writeFile(
    join(repo, ".git", "info", "exclude"),
    ".arc/completed/\n.arc/system/.internal/worktree-marker.json\n",
    { flag: "a" },
  );

  const worktree = join(worktreeParent, "wt");
  await git(repo, ["worktree", "add", worktree, "feat/demo"]);
  const worktreeCompleted = join(worktree, ".arc", "completed", "2026-q3", "01_demo");
  await mkdir(worktreeCompleted, { recursive: true });
  await writeFile(join(worktreeCompleted, "meta-demo.md"), "# Metadata: demo\n\n- **State:** Shipped\n");
  if (options.marked) {
    const markerDir = join(worktree, ".arc", "system", ".internal");
    await mkdir(markerDir, { recursive: true });
    await writeFile(join(markerDir, "worktree-marker.json"), JSON.stringify({
      spawnedByArc: true,
      wuName: "demo",
      createdFor: { kind: "work-unit", name: "demo" },
      spawningIdentity: "test-user",
      createdAt: "2026-07-14T00:00:00.000Z",
    }));
  }
  expect(await git(worktree, ["status", "--porcelain"])).toBe("");
  return worktree;
}

describe("arc teardown (CLI surface)", () => {
  let tmpDir: string | undefined;
  let worktreeParent: string | undefined;

  afterEach(async () => {
    // Guard the assignment: a setup throw before `tmpDir` is set must not have its
    // original error masked by a cleanup on `undefined`.
    if (tmpDir !== undefined) await cleanupTempDir(tmpDir);
    if (worktreeParent !== undefined) await cleanupTempDir(worktreeParent);
    tmpDir = undefined;
    worktreeParent = undefined;
  });

  it("refuses without a work-unit name", async () => {
    tmpDir = await createTempRepo();
    await runArc(["init", "--yes", "--name", "test-project"], tmpDir);

    const result = await runArc(["teardown"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/requires the work-unit name/i);
  });

  it("refuses a work unit that has not shipped (no completed/ presence)", async () => {
    tmpDir = await createTempRepo();
    await runArc(["init", "--yes", "--name", "test-project"], tmpDir);

    const result = await runArc(["teardown", "ghost"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/not shipped|completed/i);
  });

  it("refuses branch-scoped teardown for non-chore branches", async () => {
    tmpDir = await createTempRepo();
    await runArc(["init", "--yes", "--name", "test-project"], tmpDir);

    const result = await runArc(["teardown", "--branch", "feat/demo"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/chore\/<slug>|cheap branches/i);
  });

  it("refuses malformed branch-scoped chore values before treating them as absent", async () => {
    tmpDir = await createTempRepo();
    await runArc(["init", "--yes", "--name", "test-project"], tmpDir);

    const result = await runArc(["teardown", "--branch", "chore/groom demo"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/slug-safe/i);
    expect(result.stdout + result.stderr).not.toMatch(/already reaped/i);
  });

  it("accepts an already-absent recordless chore branch as an idempotent no-op", async () => {
    tmpDir = await createTempRepo();
    await runArc(["init", "--yes", "--name", "test-project"], tmpDir);

    const result = await runArc(["teardown", "--branch", "chore/missing"], tmpDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout + result.stderr).toMatch(/already reaped/i);
  });

  it.each([
    ["marked", true, /Marker:\s+stamped/iu],
    ["markerless", false, /Marker:\s+externally managed/iu],
  ] as const)("reports %s self-teardown as a live husk", async (_label, marked, markerLine) => {
    tmpDir = await createTempRepo();
    worktreeParent = await mkdtemp(join(tmpdir(), "arc-teardown-e2e-wt-"));
    const worktree = await prepareSelfTeardown(tmpDir, worktreeParent, { marked });

    const result = await runArc(["teardown", "demo"], worktree);
    const output = result.stdout + result.stderr;

    expect(result.exitCode).toBe(0);
    expect(output).toMatch(/Worktree husked/iu);
    expect(output).toMatch(/physical removal deferred/iu);
    expect(output).toMatch(markerLine);
    expect(await git(worktree, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("HEAD");
    if (marked) expect(output).toMatch(/stale-worktree sweep/iu);
    else expect(output).not.toMatch(/stale-worktree sweep/iu);
  });

  it("reports outside husk replay as physical removal, not another deferred husk", async () => {
    tmpDir = await createTempRepo();
    worktreeParent = await mkdtemp(join(tmpdir(), "arc-teardown-e2e-wt-"));
    const worktree = await prepareSelfTeardown(tmpDir, worktreeParent, { marked: true });
    const created = await runArc(["teardown", "demo"], worktree);
    expect(created.exitCode).toBe(0);

    const replay = await runArc(["teardown", "demo"], tmpDir);
    const output = replay.stdout + replay.stderr;
    const unwrappedOutput = output.replace(/\s*│\n│\s*/gu, "");

    expect(replay.exitCode).toBe(0);
    expect(unwrappedOutput).toContain(worktree);
    expect(output).not.toMatch(/physical removal deferred|stale-worktree sweep|Worktree husked/iu);
    expect(await git(tmpDir, ["worktree", "list"])).not.toContain(worktree);
  });

  it("does not let an old husk delete a restarted same-slug projection", async () => {
    tmpDir = await createTempRepo();
    worktreeParent = await mkdtemp(join(tmpdir(), "arc-teardown-e2e-wt-"));
    const worktree = await prepareSelfTeardown(tmpDir, worktreeParent, { marked: true });
    const created = await runArc(["teardown", "demo"], worktree);
    expect(created.exitCode).toBe(0);
    await git(tmpDir, ["checkout", "-b", "feat/demo"]);

    const replay = await runArc(["teardown", "demo", "--husk", worktree], tmpDir);

    expect(replay.exitCode).toBe(0);
    expect(replay.stdout + replay.stderr).toMatch(/competing registered projection/iu);
    expect(await git(tmpDir, ["branch", "--list", "feat/demo"])).toContain("feat/demo");
    expect(await git(tmpDir, ["worktree", "list"])).toContain(worktree);
  });

  it("reports a surviving local ref and retry guidance after detach", async () => {
    tmpDir = await createTempRepo();
    worktreeParent = await mkdtemp(join(tmpdir(), "arc-teardown-e2e-wt-"));
    const worktree = await prepareSelfTeardown(tmpDir, worktreeParent, { marked: true });
    const lock = join(tmpDir, ".git", "refs", "heads", "feat", "demo.lock");
    await mkdir(join(tmpDir, ".git", "refs", "heads", "feat"), { recursive: true });
    await writeFile(lock, "locked\n");

    const result = await runArc(["teardown", "demo"], worktree);
    const output = result.stdout + result.stderr;

    expect(result.exitCode).toBe(0);
    expect(output).toMatch(/Could not compare-and-delete local branch `feat\/demo`/iu);
    expect(output).not.toMatch(/not contained on its upstream/iu);
    expect(await git(worktree, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("HEAD");
    expect(await git(tmpDir, ["branch", "--list", "feat/demo"])).toContain("feat/demo");
  });

  it("reports a dirty preflight refusal as still branched and unchanged", async () => {
    tmpDir = await createTempRepo();
    worktreeParent = await mkdtemp(join(tmpdir(), "arc-teardown-e2e-wt-"));
    const worktree = await prepareSelfTeardown(tmpDir, worktreeParent, { marked: true });
    await writeFile(join(worktree, "dirty.txt"), "dirty\n");

    const result = await runArc(["teardown", "demo"], worktree);
    const output = result.stdout + result.stderr;

    expect(result.exitCode).toBe(1);
    expect(output).toMatch(/Cannot husk:.*dirty worktree/isu);
    expect(output).toMatch(/remains branched and unchanged/iu);
    expect(await git(worktree, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("feat/demo");
  });
});
