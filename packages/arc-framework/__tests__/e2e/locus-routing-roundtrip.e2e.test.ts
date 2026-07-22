/** Real CLI fixed-set grooming and one-sweep housekeeping round trips. */

import { execFile } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempRepo,
  git,
  removeGitBackedDir,
  runArc,
  runArcAnchoredSequence,
} from "./helpers.js";

const execFileAsync = promisify(execFile);

async function setFullProtection(repository: string): Promise<void> {
  const path = join(repository, ".arc", "system", "arc-config.yml");
  const config = await readFile(path, "utf8");
  await writeFile(path, config.replace("branch.protection: partial", "branch.protection: full"));
}

async function createBareRemote(repository: string): Promise<string> {
  const remote = await mkdtemp(join(tmpdir(), "arc-locus-routing-remote-"));
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
  await git(repository, ["remote", "add", "origin", remote]);
  return remote;
}

async function createCodexHarness(): Promise<{ directory: string; executable: string }> {
  const directory = await mkdtemp(join(tmpdir(), "arc-locus-routing-codex-"));
  const executable = join(directory, "codex");
  await copyFile("/bin/bash", executable);
  await chmod(executable, 0o755);
  return { directory, executable };
}

async function writeInbox(repository: string): Promise<void> {
  const userDir = join(repository, ".arc", "user", "test-user");
  await mkdir(userDir, { recursive: true });
  await writeFile(join(userDir, "USER-INBOX.md"), [
    "# User Inbox",
    "",
    "## Errand",
    "",
    "### `[ ]` **Run sibling**",
    "",
    "- _Observation:_ Execute after routing.",
    "",
    "## Work Unit",
    "",
    "### `[ ]` **Keep routed**",
    "",
    "- _Observation:_ Retain this reviewed item.",
    "",
    "---",
    "",
  ].join("\n"));
}

async function compilePlan(
  repository: string,
  name: string,
  secondDisposition: "retain" | "defer",
): Promise<string> {
  const userDir = join(repository, ".arc", "user", "test-user");
  await mkdir(userDir, { recursive: true });
  const intent = join(userDir, `${name}-intent.json`);
  const plan = join(userDir, `${name}-plan.json`);
  await writeFile(intent, JSON.stringify({
    version: 1,
    entries: [
      { title: "Run sibling", disposition: "execute-now" },
      { title: "Keep routed", disposition: secondDisposition },
    ],
  }));
  const result = await runArc([
    "housekeep", "plan", "--intent-file", intent, "--output", plan, "--json",
  ], repository);
  expect(result.exitCode, result.stderr || result.stdout).toBe(0);
  return plan;
}

describe("grooming and housekeeping locus round trips", () => {
  let repository: string;
  let remote: string;
  let harness: { directory: string; executable: string };

  beforeEach(async () => {
    repository = await createTempRepo();
    const initialized = await runArc([
      "init", "--yes", "--name", "locus-routing", "--pm-mode", "arc-in-git",
    ], repository);
    expect(initialized.exitCode).toBe(0);
    await setFullProtection(repository);
    await git(repository, ["config", "arc.identity", "test-user"]);
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "--no-verify", "-m", "initialize fixture"]);
    remote = await createBareRemote(repository);
    await git(repository, ["push", "-u", "origin", "main"]);
    harness = await createCodexHarness();
  });

  afterEach(async () => {
    await cleanupTempDir(repository);
    await removeGitBackedDir(remote);
    await removeGitBackedDir(harness.directory);
  });

  it("keeps a grooming set immutable across exact retry and overlapping refusal", async () => {
    for (const slug of ["alpha", "beta", "gamma"]) {
      const stub = await runArc([
        "stub", slug, "--commitment", "provisional", "--priority", "P2",
      ], repository);
      expect(stub.exitCode, stub.stderr || stub.stdout).toBe(0);
    }
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "--no-verify", "-m", "add grooming stubs"]);
    await git(repository, ["push", "origin", "main"]);

    const sequence = await runArcAnchoredSequence([
      ["plan", "open", "alpha", "--include", "beta", "--json"],
      { args: ["plan", "open", "alpha", "--include", "beta", "--json"], cwdFromPreviousJson: "activeLocusPath" },
      { args: ["plan", "open", "beta", "--include", "gamma", "--json"], reuseResolvedCwd: true },
      { command: ["git", "push", "-u", "origin", "chore/groom-alpha"], reuseResolvedCwd: true },
      { args: ["plan", "abandon", "alpha", "--json"], reuseResolvedCwd: true },
      { args: ["plan", "open", "gamma", "--json"], cwd: repository },
      { command: ["git", "push", "-u", "origin", "chore/groom-gamma"], cwdFromPreviousJson: "activeLocusPath" },
      { args: ["plan", "abandon", "gamma", "--json"], reuseResolvedCwd: true },
    ], repository, { timeout: 90_000, anchorShellPath: harness.executable });

    expect(sequence.exitCode, sequence.stderr || sequence.stdout).toBe(0);
    const [opened, replayed, overlap, abandoned, disjoint, disjointAbandoned] = sequence.results as [
      Record<string, unknown>, Record<string, unknown>, Record<string, unknown>,
      Record<string, unknown>, Record<string, unknown>, Record<string, unknown>,
    ];
    expect(opened).toMatchObject({
      outcome: "applied",
      operation: "plan-open",
      identity: { kind: "groom", anchorStub: "alpha", members: ["alpha", "beta"] },
    });
    expect(replayed, JSON.stringify(replayed)).toMatchObject({
      outcome: "idempotent",
      operation: "plan-open",
      recordId: opened.recordId,
      identity: { claimId: (opened.identity as { claimId: string }).claimId, members: ["alpha", "beta"] },
    });
    expect(overlap).toMatchObject({
      outcome: "refused",
      operation: "plan-open",
      reason: "identity-conflict",
    });
    expect(abandoned, JSON.stringify(abandoned)).toMatchObject({ outcome: "applied", operation: "plan-abandon" });
    expect(disjoint, JSON.stringify(sequence.results)).toMatchObject({
      outcome: "applied",
      operation: "plan-open",
      identity: { anchorStub: "gamma", members: ["gamma"] },
    });
    expect(disjointAbandoned).toMatchObject({ outcome: "applied", operation: "plan-abandon" });
  });

  it("replays one routing generation across lane escalation, recovery, and branch reuse", async () => {
    await writeInbox(repository);
    const exactPlan = await compilePlan(repository, "exact", "retain");
    const changedPlan = await compilePlan(repository, "changed", "defer");

    const sequence = await runArcAnchoredSequence([
      ["housekeep", "open", "inbox-drain", "--plan-file", exactPlan, "--lane", "auto", "--json"],
      {
        args: ["housekeep", "open", "second-name", "--plan-file", exactPlan, "--lane", "reviewed", "--json"],
        cwdFromPreviousJson: "activeLocusPath",
      },
      { args: ["status", "--session-init", "--write-compaction-seed", "--json"], reuseResolvedCwd: true },
      { args: ["recover", "audit", "--json"], reuseResolvedCwd: true },
      {
        args: ["housekeep", "open", "other-plan", "--plan-file", changedPlan, "--lane", "reviewed", "--json"],
        reuseResolvedCwd: true,
      },
      { command: ["git", "push", "-u", "origin", "chore/inbox-drain"], reuseResolvedCwd: true },
      { args: ["housekeep", "abandon", "inbox-drain", "--json"], reuseResolvedCwd: true },
      {
        args: ["housekeep", "open", "inbox-drain", "--plan-file", exactPlan, "--lane", "reviewed", "--json"],
        cwd: repository,
      },
      { command: ["git", "push", "-u", "origin", "chore/inbox-drain"], cwdFromPreviousJson: "activeLocusPath" },
      { args: ["housekeep", "abandon", "inbox-drain", "--json"], reuseResolvedCwd: true },
    ], repository, { timeout: 120_000, anchorShellPath: harness.executable });

    expect(sequence.exitCode, sequence.stderr || sequence.stdout).toBe(0);
    const [opened, escalated, , audit, mismatch, abandoned, reopened, abandonedAgain] = sequence.results as [
      Record<string, unknown>, Record<string, unknown>, Record<string, unknown>, Record<string, unknown>,
      Record<string, unknown>, Record<string, unknown>, Record<string, unknown>, Record<string, unknown>,
    ];
    expect(opened).toMatchObject({
      outcome: "applied",
      operation: "housekeep-open",
      identity: { purpose: "housekeep-routing", routingLane: "auto" },
      dispatchId: expect.any(String),
      routingPlanDigest: expect.stringMatching(/^sha256:/u),
    });
    expect(escalated).toMatchObject({
      outcome: "idempotent",
      operation: "housekeep-open",
      identity: {
        claimId: (opened.identity as { claimId: string }).claimId,
        routingLane: "reviewed",
        dispatchId: opened.dispatchId,
      },
      routingPlanDigest: opened.routingPlanDigest,
    });
    expect(audit).toMatchObject({
      verdict: { status: "ready", ready: true, locusHint: { match: true } },
      recover: { recoveryFrame: { ok: true, value: { workflow: "drain-inbox" } } },
    });
    expect(mismatch).toMatchObject({
      outcome: "refused",
      operation: "housekeep-open",
      reason: "routing-plan-mismatch",
    });
    expect(abandoned).toMatchObject({ outcome: "applied", operation: "housekeep-abandon" });
    expect(reopened).toMatchObject({
      outcome: "applied",
      operation: "housekeep-open",
      identity: { routingLane: "reviewed" },
    });
    expect((reopened.identity as { claimId: string }).claimId)
      .not.toBe((opened.identity as { claimId: string }).claimId);
    expect(abandonedAgain).toMatchObject({ outcome: "applied", operation: "housekeep-abandon" });
  });
});
