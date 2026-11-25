/** Commands run from the checkout they remove complete through the built CLI on the ref store. */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { access, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempRepo, removeGitBackedDir, runArc, runArcAnchoredSequence, runArcNoTty } from "./helpers.js";
import { completeCutMapFixture } from "../fixtures/decompose-v4.js";
import { CLI_PATH } from "../helpers/cli-spawn.js";
import { primaryReference } from "../helpers/store-errand-fixture.js";
import { readStoreRecord } from "../helpers/store/seed-store.js";
import { seededWorkUnitSubject, seedWorkUnit } from "../helpers/store/seed-work-unit.js";
import { CutMapMachineSchema } from "../../src/lib/decompose/cut-map-machine.js";
import { DecomposeFinishAppliedSchema, DecomposeRetirementPreviewSchema } from "../../src/lib/decompose/finish-report.js";
import { readWorktreeMarker, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";

const execFileAsync = promisify(execFile);
const SEQUENCE_TIMEOUT_MS = 90_000;

async function git(cwd: string, args: string[]): Promise<string> {
  return (await execFileAsync("git", args, { cwd })).stdout.trim();
}

describe("commands that remove the checkout they run in (ref store)", () => {
  let repo: string;
  let origin: string;
  let checkouts: string;

  beforeEach(async () => {
    repo = await createTempRepo("arc-checkout-removal-");
    const init = await runArc(["init", "--yes", "--name", "test-project"], repo);
    expect(init.exitCode, init.stdout + init.stderr).toBe(0);
    checkouts = await mkdtemp(join(tmpdir(), "arc-checkout-removal-wt-"));
    const configPath = join(repo, ".arc", "system", "arc-config.yml");
    const config = await readFile(configPath, "utf8");
    await writeFile(configPath, config.replace("branch.protection: partial", "branch.protection: full")
      .replace(/^worktree\.location_template:.*$/mu,
        `worktree.location_template: ../${basename(checkouts)}/{name}`));
    await git(repo, ["add", "-A"]);
    await git(repo, ["-c", "core.hooksPath=/dev/null", "commit", "-m", "chore: initialize ARC"]);
    origin = await mkdtemp(join(tmpdir(), "arc-checkout-removal-origin-"));
    await git(origin, ["init", "--bare", "--initial-branch=main"]);
    await git(repo, ["remote", "add", "origin", origin]);
    await git(repo, ["push", "-u", "origin", "main"]);
    const designated = await runArc(["store", "remote", "origin", "push"], repo);
    expect(designated.exitCode, designated.stdout + designated.stderr).toBe(0);
  });

  afterEach(async () => {
    await git(repo, ["worktree", "prune"]).catch(() => undefined);
    for (const path of [checkouts, origin]) await removeGitBackedDir(path);
    await cleanupTempDir(repo);
  });

  it("abandons a work unit from the linked checkout ARC spawned for it, reaping its branch locally and remotely", async () => {
    const { meta } = await seedWorkUnit(repo, "mono", { identity: "test-user", branch: "feat/mono",
      meta: { state: "Active", owner: "test-user", branch: "feat/mono" } });
    await writeFile(join(repo, ".git", "info", "exclude"), ".arc/system/.internal/worktree-marker.json\n", { flag: "a" });
    const worktree = join(checkouts, "mono");
    await git(repo, ["worktree", "add", "-b", "feat/mono", worktree, "main"]);
    await writeWorktreeMarker(worktree, { spawnedByArc: true, wuName: "mono", createdFor: seededWorkUnitSubject(meta),
      spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00.000Z" });
    await writeFile(join(worktree, "work.txt"), "unlanded\n");
    await git(worktree, ["add", "work.txt"]);
    await git(worktree, ["-c", "core.hooksPath=/dev/null", "commit", "-m", "feat: unlanded work"]);
    await git(worktree, ["push", "-u", "origin", "feat/mono"]);

    const abandon = await runArc(["abandon", "mono", "--yes"], worktree);

    expect(abandon.exitCode, abandon.stdout + abandon.stderr).toBe(0);
    await expect(access(worktree)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await git(repo, ["branch", "--list", "feat/mono"])).toBe("");
    expect(await git(repo, ["ls-remote", "--heads", "origin", "feat/mono"])).toBe("");
    await expect(readStoreRecord(repo, SlugSchema.parse("test-user"), meta.reference)).rejects.toThrow(/not-found/u);
  }, SEQUENCE_TIMEOUT_MS);

  it("reaps a shipped work unit's branch during remove-mode self-teardown", async () => {
    await git(repo, ["checkout", "-b", "feat/demo"]);
    await writeFile(join(repo, "demo.txt"), "demo\n");
    await git(repo, ["add", "demo.txt"]);
    await git(repo, ["-c", "core.hooksPath=/dev/null", "commit", "-m", "feat: demo"]);
    await git(repo, ["checkout", "main"]);
    await git(repo, ["-c", "core.hooksPath=/dev/null", "merge", "--no-ff", "feat/demo", "-m", "merge: demo"]);
    await git(repo, ["push", "origin", "main"]);
    const { meta } = await seedWorkUnit(repo, "demo", { identity: "test-user", branch: "feat/demo",
      meta: { state: "Shipped", owner: "test-user", branch: "feat/demo", currentWorkflow: null, completed: "2026-07-14",
        prUrl: "https://example.test/pull/1" },
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q3") } });
    await writeFile(join(repo, ".git", "info", "exclude"), ".arc/system/.internal/worktree-marker.json\n", { flag: "a" });
    const worktree = join(checkouts, "demo");
    await git(repo, ["worktree", "add", worktree, "feat/demo"]);
    await writeWorktreeMarker(worktree, { spawnedByArc: true, wuName: "demo", createdFor: seededWorkUnitSubject(meta),
      spawningIdentity: "test-user", createdAt: "2026-07-14T00:00:00.000Z" });
    await git(repo, ["config", "arc.selfTeardownMode", "remove"]);

    const teardown = await runArc(["teardown", "demo"], worktree);

    expect(teardown.exitCode, teardown.stdout + teardown.stderr).toBe(0);
    expect(await git(repo, ["branch", "--list", "feat/demo"])).toBe("");
    if (process.platform === "win32") {
      expect(teardown.stdout + teardown.stderr).toContain("Windows cannot remove the invoking shell's occupied directory");
      expect(await git(worktree, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("HEAD");
      expect(await readWorktreeMarker(worktree)).toMatchObject({
        kind: "present", marker: { husk: { branch: "feat/demo", subject: seededWorkUnitSubject(meta) } },
      });
    } else {
      await expect(access(worktree)).rejects.toMatchObject({ code: "ENOENT" });
    }
  }, SEQUENCE_TIMEOUT_MS);

  it("finishes decomposition from the origin's linked checkout and reaps its created branch", async () => {
    const branch = "plan/demo";
    const worktree = join(checkouts, "demo");
    const { meta } = await seedWorkUnit(repo, "demo", { identity: "test-user", branch,
      meta: { state: "Planning", owner: "test-user", workClass: "Light", branch,
        currentWorkflow: "draft-design", design: ["draft-demo.md"] },
      records: [{ kind: "work-item/draft", content: "# Demo\n\n## Scope\n\nSplit the work.\n" }] });
    await git(repo, ["config", "arc.selfTeardownMode", "remove"]);
    await writeFile(join(repo, ".git", "info", "exclude"), ".arc/system/.internal/worktree-marker.json\n", { flag: "a" });
    await git(repo, ["worktree", "add", "-b", branch, worktree, "main"]);
    await writeWorktreeMarker(worktree, { spawnedByArc: true, wuName: "demo", createdFor: seededWorkUnitSubject(meta),
      spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00.000Z" });

    async function decompose(...args: string[]): Promise<string> {
      const result = await runArcNoTty(["decompose", "demo", ...args], worktree);
      expect(result.exitCode, result.stdout + result.stderr).toBe(0);
      return result.stdout;
    }
    const starter = JSON.parse(await decompose("--preflight")) as { machine: unknown };
    const cutMap = completeCutMapFixture(CutMapMachineSchema.parse(starter.machine));
    const cutPath = join(checkouts, "cut.json");
    await writeFile(cutPath, JSON.stringify(cutMap));
    await decompose("--execute", cutPath);
    const preview = DecomposeRetirementPreviewSchema.parse(JSON.parse(await decompose("--finish")));

    const applied = DecomposeFinishAppliedSchema.parse(JSON.parse(
      await decompose("--finish", "--apply", preview.applyAuthority),
    ));

    expect(applied.continuation).toBeUndefined();
    await expect(readStoreRecord(repo, SlugSchema.parse("test-user"), meta.reference)).rejects.toThrow(/not-found/u);
    expect(await git(repo, ["branch", "--list", branch])).toBe("");
    await expect(access(worktree)).rejects.toMatchObject({ code: "ENOENT" });
  }, SEQUENCE_TIMEOUT_MS);

  it("records the initiating checkout's actor when errand abandon removes that checkout", async () => {
    const slug = "retire-actor";
    await git(repo, ["config", "extensions.worktreeConfig", "true"]);
    const sequence = await runArcAnchoredSequence([
      ["errand", "open", slug, "--isolate", "--json"],
      { command: ["git", "config", "--worktree", "arc.identity", "test-user"], cwdFromPreviousJson: "allocation.checkoutPath" },
      { command: ["git", "config", "--worktree", "arc.identity", "primary-user"], cwd: repo },
      { args: ["errand", "abandon", slug, "--json"], reuseResolvedCwd: true },
    ], repo, { timeout: SEQUENCE_TIMEOUT_MS });
    expect(sequence.exitCode, sequence.stdout + sequence.stderr).toBe(0);
    const [opened, ended] = sequence.results as [{ allocation: { checkoutPath: string } }, unknown];
    expect(ended).toMatchObject({ outcome: "applied", checkoutPath: opened.allocation.checkoutPath });
    await expect(access(opened.allocation.checkoutPath)).rejects.toMatchObject({ code: "ENOENT" });

    const message = await git(repo, ["log", "-1", "--format=%B", "refs/arc/project/registry"]);
    expect(message).toMatch(/^errand-abandon /u);
    expect(/^Arc-Actor: ([^@\n]+)@/mu.exec(message)?.[1]).toBe("test-user");
  }, SEQUENCE_TIMEOUT_MS);

  it("cleans up the isolated checkout after leave refuses an unpublished Errand", async ({ onTestFinished }) => {
    const slug = "unpublished";
    const sequence = await runArcAnchoredSequence([
      ["errand", "open", slug, "--isolate", "--json"],
      { args: ["errand", "leave", slug, "--state", "paused", "--json"], cwdFromPreviousJson: "allocation.checkoutPath" },
    ], repo, { timeout: SEQUENCE_TIMEOUT_MS });
    const [opened, left] = sequence.results;
    expect(opened, sequence.stdout + sequence.stderr).toMatchObject({
      outcome: "applied", allocation: { kind: "spawned", checkoutPath: expect.any(String) },
    });
    const { checkoutPath } = (opened as { allocation: { checkoutPath: string } }).allocation;
    onTestFinished(async () => {
      try {
        await expect(access(repo)).rejects.toMatchObject({ code: "ENOENT" });
        await expect(access(checkoutPath)).rejects.toMatchObject({ code: "ENOENT" });
      } finally {
        await removeGitBackedDir(checkoutPath);
      }
    });
    expect(sequence.exitCode, sequence.stdout + sequence.stderr).toBe(1);
    expect(left).toMatchObject({ operation: "errand-leave", outcome: "refused", reason: "preservation-unproven" });
    await access(checkoutPath);
  }, SEQUENCE_TIMEOUT_MS);

  // Pausing keeps the Errand's branch, so its work is published first.
  const errandExits = [
    { verb: "abandon", args: [] as string[], publish: false, keepsBranch: false },
    { verb: "close", args: [] as string[], publish: false, keepsBranch: false },
    { verb: "leave", args: ["--state", "paused"], publish: true, keepsBranch: true },
  ];
  const errandCases = errandExits.flatMap(exit => [
    { ...exit, label: "from its own isolated checkout", held: false },
    ...(process.platform === "win32" ? [{ ...exit, label: "while another process holds the checkout", held: true }] : []),
  ]);
  it.each(errandCases)("runs errand $verb $label", async ({ verb, args, publish, keepsBranch, held }) => {
    const slug = `own-${verb}`;
    const initialRoster = await git(repo, ["worktree", "list", "--porcelain"]);
    const terminalArgs = ["errand", verb, slug, ...args, "--json"];
    // This parent retains the checkout as its own cwd until ARC has exited.
    const terminal = held
      ? { command: [process.execPath, "-e", "const {spawnSync}=require('node:child_process');"
        + "const child=spawnSync(process.execPath,process.argv.slice(1),{stdio:'inherit'});"
        + "process.exitCode=child.status??1;", CLI_PATH, ...terminalArgs] }
      : { args: terminalArgs };
    const sequence = await runArcAnchoredSequence([
      ["errand", "open", slug, "--isolate", "--json"],
      ...publish
        ? [{ command: ["git", "push", "origin", "HEAD"], cwdFromPreviousJson: "allocation.checkoutPath" },
          { ...terminal, reuseResolvedCwd: true as const }]
        : [{ ...terminal, cwdFromPreviousJson: "allocation.checkoutPath" }],
    ], repo, { timeout: SEQUENCE_TIMEOUT_MS });
    const [opened, ended] = sequence.results as [
      { allocation?: { checkoutPath?: string }; identity?: { branch?: string } } | undefined, unknown];
    const checkout = opened?.allocation?.checkoutPath, branch = opened?.identity?.branch;
    expect(checkout, JSON.stringify(opened)).toEqual(expect.any(String));
    expect(branch, JSON.stringify(opened)).toEqual(expect.any(String));

    const record = await readStoreRecord(repo, SlugSchema.parse("test-user"), primaryReference(slug));
    if (verb === "leave") expect.soft(JSON.parse(record.content)).toMatchObject({ state: "paused", branch });
    expect({
      exitCode: sequence.exitCode,
      folderExists: existsSync(checkout!),
      roster: await git(repo, ["worktree", "list", "--porcelain"]),
      branchExists: (await git(repo, ["branch", "--list", branch!])) !== "",
      placement: record.placement?.kind,
    }, sequence.stdout + sequence.stderr).toEqual({
      exitCode: 0, folderExists: held, roster: initialRoster, branchExists: keepsBranch,
      placement: verb === "leave" ? "active" : "completed",
    });
    expect(ended).toMatchObject({ outcome: "applied", checkoutPath: checkout });
    if (held) {
      expect(ended).toMatchObject({ recommendedPromptText: expect.stringContaining(checkout!) });
      expect(ended).toMatchObject({ recommendedPromptText: expect.stringContaining("Remove-Item -LiteralPath") });
      await removeGitBackedDir(checkout!);
      expect(existsSync(checkout!)).toBe(false);
    }
  }, SEQUENCE_TIMEOUT_MS);
});
