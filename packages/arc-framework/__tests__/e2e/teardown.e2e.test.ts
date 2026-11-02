/** Real CLI teardown refusals, self-teardown, and exact husk replay over temporary Git repositories. */

import { describe, it, expect, afterEach } from "vitest";
import { mkdir, mkdtemp, rm, writeFile, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runArc, cleanupTempDir, git, unwrapPresentationOutput } from "./helpers.js";
import { initializedRepository } from "../helpers/initialized-repository.js";

/** Build the linked teardown fixture from an initialized repository. */
async function prepareSelfTeardown(
  repo: string,
  worktreeParent: string,
  options: { marked: boolean },
): Promise<string> {
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
  await writeFile(join(completed, "meta-demo.md"), [
    "# Metadata: demo",
    "",
    "| **State** | **Owner** | **Branch** | **Class** | **Priority** |",
    "| --------- | --------- | ---------- | --------- | ------------ |",
    "| Shipped | — | — | — | — |",
    "",
    "",
    "---",
    "",
  ].join("\n"));
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
  await writeFile(join(worktreeCompleted, "meta-demo.md"), [
    "# Metadata: demo",
    "",
    "| **State** | **Owner** | **Branch** | **Class** | **Priority** |",
    "| --------- | --------- | ---------- | --------- | ------------ |",
    "| Shipped | — | — | — | — |",
    "",
    "",
    "---",
    "",
  ].join("\n"));
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

it.each((["│", "|"] as const).flatMap(border => ["\n", "\r\n"].map(newline => ({ border, newline }))))(
  "joins $border presentation continuations with newline $newline and preserves literal bars", ({ border, newline }) => {
  const wrapped = `${border} /tmp/literal|│/   ${border}${newline}${border} name.md ${border}`;
  expect(unwrapPresentationOutput(wrapped)).toBe(`${border} /tmp/literal|│/name.md ${border}`);
});

it("keeps literal presentation bars inside an unwrapped value", () => {
  const value = "/tmp/literal|│/name.md";
  expect(unwrapPresentationOutput(value)).toBe(value);
});

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

  it("removes a detached branch husk through branch-scoped CLI replay", async () => {
    tmpDir = await initializedRepository("initialized");
    worktreeParent = await mkdtemp(join(tmpdir(), "arc-branch-husk-e2e-"));
    await git(tmpDir, ["add", "."]);
    await git(tmpDir, ["commit", "--allow-empty", "-m", "chore: initialize ARC"]);
    const branch = "chore/leftover", worktree = join(worktreeParent, "wt");
    await git(tmpDir, ["worktree", "add", "-b", branch, worktree, "main"]);
    await writeFile(join(tmpDir, ".git/info/exclude"), "\n.arc/system/.internal/worktree-marker.json\n", { flag: "a" });
    const markerPath = join(worktree, ".arc/system/.internal/worktree-marker.json");
    await mkdir(join(worktree, ".arc/system/.internal"), { recursive: true });
    await writeFile(markerPath, JSON.stringify({ spawnedByArc: true, createdFor: { kind: "branch", ref: branch },
      spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00Z" }));
    expect(await git(worktree, ["status", "--porcelain"])).toBe("");
    const husked = await runArc(["teardown", "--branch", branch], worktree);
    expect(husked.exitCode, husked.stdout + husked.stderr).toBe(0);
    expect(await git(worktree, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("HEAD");
    expect(JSON.parse(await readFile(markerPath, "utf8"))).toMatchObject({ husk: { subject: { kind: "branch", ref: branch } } });
    expect(await git(tmpDir, ["worktree", "list", "--porcelain"])).toContain(`worktree ${worktree}\n`);
    const replay = await runArc(["teardown", "--branch", branch], tmpDir);
    expect(replay.exitCode, replay.stdout + replay.stderr).toBe(0);
    await expect(stat(worktree)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await git(tmpDir, ["worktree", "list", "--porcelain"])).not.toContain(`worktree ${worktree}\n`);
    expect(await git(tmpDir, ["branch", "--list", branch])).toBe("");
  });

  it("refuses without a work-unit name", async () => {
    tmpDir = await initializedRepository("initialized");

    const result = await runArc(["teardown"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/requires the work-unit name/i);
  });

  it("refuses a nonexistent receipt-backed target without a branch or detached husk", async () => {
    tmpDir = await initializedRepository("initialized");
    await git(tmpDir, ["add", "."]);
    await git(tmpDir, ["commit", "-m", "chore: initialize ARC"]);

    const result = await runArc(["teardown", "ghost"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/no branch or detached husk remains/i);
  });

  it("refuses branch-scoped teardown for non-chore branches", async () => {
    tmpDir = await initializedRepository("initialized");

    const result = await runArc(["teardown", "--branch", "feat/demo"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/chore\/<slug>|cheap branches/i);
  });

  it("refuses malformed branch-scoped chore values before treating them as absent", async () => {
    tmpDir = await initializedRepository("initialized");

    const result = await runArc(["teardown", "--branch", "chore/groom demo"], tmpDir);

    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/slug-safe/i);
    expect(result.stdout + result.stderr).not.toMatch(/already reaped/i);
  });

  it("accepts an already-absent recordless chore branch as an idempotent no-op", async () => {
    tmpDir = await initializedRepository("initialized");

    const result = await runArc(["teardown", "--branch", "chore/missing"], tmpDir);

    expect(result.exitCode).toBe(0);
    expect(result.stdout + result.stderr).toMatch(/already reaped/i);
  });

  it("removes one missing shipped checkout registration while preserving other stale registrations", async () => {
    tmpDir = await initializedRepository("initialized");
    worktreeParent = await mkdtemp(join(tmpdir(), "arc-teardown-e2e-wt-"));
    const worktree = await prepareSelfTeardown(tmpDir, worktreeParent, { marked: true });
    const other = join(worktreeParent, "other");
    await git(tmpDir, ["worktree", "add", "--detach", other, "main"]);
    await rm(worktree, { recursive: true, force: true });
    await rm(other, { recursive: true, force: true });
    const result = await runArc(["teardown", "demo"], tmpDir);
    expect(result.exitCode).toBe(0);
    const registrations = await git(tmpDir, ["worktree", "list", "--porcelain"]);
    expect(registrations).not.toContain(`worktree ${worktree}\n`);
    expect(registrations).toContain(`worktree ${other}\n`);
  });

  it("refuses a missing checkout held by an operator lock with the unlock remedy", async () => {
    tmpDir = await initializedRepository("initialized");
    worktreeParent = await mkdtemp(join(tmpdir(), "arc-teardown-e2e-wt-"));
    const worktree = await prepareSelfTeardown(tmpDir, worktreeParent, { marked: true });
    await git(tmpDir, ["worktree", "lock", "--reason", "operator", worktree]);
    await rm(worktree, { recursive: true, force: true });
    const result = await runArc(["teardown", "demo"], tmpDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain(`git worktree unlock ${worktree}`);
    expect(await git(tmpDir, ["worktree", "list", "--porcelain"])).toContain(`worktree ${worktree}\n`);
  });

  it("names dirty paths before removing a shipped checkout", async () => {
    tmpDir = await initializedRepository("initialized");
    worktreeParent = await mkdtemp(join(tmpdir(), "arc-teardown-e2e-wt-"));
    const worktree = await prepareSelfTeardown(tmpDir, worktreeParent, { marked: true });
    await writeFile(join(worktree, "dirty-file"), "keep me\n");
    const result = await runArc(["teardown", "demo"], tmpDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout + result.stderr).toContain("dirty-file");
    expect(await git(worktree, ["status", "--porcelain"])).toContain("dirty-file");
  });

  it("reports marked self-teardown as a live husk", async () => {
    tmpDir = await initializedRepository("initialized");
    worktreeParent = await mkdtemp(join(tmpdir(), "arc-teardown-e2e-wt-"));
    const worktree = await prepareSelfTeardown(tmpDir, worktreeParent, { marked: true });

    const result = await runArc(["teardown", "demo"], worktree);
    const output = result.stdout + result.stderr;

    expect(result.exitCode).toBe(0);
    expect(output).toMatch(/Worktree husked/iu);
    expect(output).toMatch(/physical removal deferred/iu);
    expect(output).toMatch(/Marker:\s+stamped/iu);
    expect(await git(worktree, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("HEAD");
    expect(output).toMatch(/stale-worktree sweep/iu);
  });

  it("refuses markerless linked self-teardown as externally managed", async () => {
    tmpDir = await initializedRepository("initialized");
    worktreeParent = await mkdtemp(join(tmpdir(), "arc-teardown-e2e-wt-"));
    const worktree = await prepareSelfTeardown(tmpDir, worktreeParent, { marked: false });

    const result = await runArc(["teardown", "demo"], worktree);
    const output = result.stdout + result.stderr;

    expect(result.exitCode).toBe(1);
    expect(output).toMatch(/no ARC ownership marker/iu);
    expect(await git(worktree, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("feat/demo");
  });

  it.each(["linux", "xterm-256color"])("reports outside husk replay as physical removal under %s", async term => {
    tmpDir = await initializedRepository("initialized");
    worktreeParent = await mkdtemp(join(tmpdir(), `arc-teardown-e2e-wt-${process.platform === "win32" ? "│" : "|│"}-${"long-".repeat(24)}`));
    const worktree = await prepareSelfTeardown(tmpDir, worktreeParent, { marked: true });
    const created = await runArc(["teardown", "demo"], worktree);
    expect(created.exitCode).toBe(0);

    const replay = await runArc(["teardown", "demo"], tmpDir, { env: { TERM: term, CI: "true", FORCE_COLOR: "0", NO_COLOR: "1" } });
    const output = replay.stdout + replay.stderr;
    expect(output).toMatch(process.platform !== "win32" && term === "linux" ? /\|\r?\n\|/u : /│\r?\n│/u);
    expect(output).not.toContain(worktree);
    const unwrappedOutput = unwrapPresentationOutput(output);

    expect(replay.exitCode).toBe(0);
    expect(unwrappedOutput).toContain(worktree);
    expect(output).not.toMatch(/physical removal deferred|stale-worktree sweep|Worktree husked/iu);
    expect(await git(tmpDir, ["worktree", "list"])).not.toContain(worktree);
  });

  it("does not let an old husk delete a restarted same-slug projection", async () => {
    tmpDir = await initializedRepository("initialized");
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
    tmpDir = await initializedRepository("initialized");
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
    tmpDir = await initializedRepository("initialized");
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
