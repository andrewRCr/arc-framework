/** Real CLI fixed-set grooming and one-sweep housekeeping round trips. */

import { execFile } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  TransientIdentityRecordV3Schema,
  housekeepClaimTransform,
  transactTransientIdentities,
  type HousekeepIdentityRecord,
} from "../../src/lib/errand/index.js";
import { makeGitExec, makeGitExecInput } from "../helpers/integration.js";
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

  it("resumes an awaiting-merge grooming set from an ordinary open change request", async () => {
    const stub = await runArc(["stub", "alpha", "--commitment", "provisional", "--priority", "P2"], repository);
    expect(stub.exitCode, stub.stderr || stub.stdout).toBe(0);
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "--no-verify", "-m", "add grooming stub"]);
    await git(repository, ["push", "origin", "main"]);

    const hostHarness = await mkdtemp(join(tmpdir(), "arc-locus-routing-gh-"));
    const fakeGh = join(hostHarness, "gh");
    const branch = "chore/groom-alpha";
    await writeFile(fakeGh, [
      "#!/bin/sh",
      "head=$(git rev-parse \"$ARC_TEST_BRANCH\") || exit 1",
      "printf '[{\"number\":1,\"state\":\"OPEN\",\"baseRefName\":\"main\",'",
      "printf '\"headRefName\":\"%s\",\"headRefOid\":\"%s\",' \"$ARC_TEST_BRANCH\" \"$head\"",
      "printf '\"reviewDecision\":\"\"}]\\n'",
    ].join("\n"));
    await chmod(fakeGh, 0o755);
    const hostUrl = "https://github.com/owner/repo.git";
    await git(repository, ["remote", "set-url", "origin", hostUrl]);
    await git(repository, ["config", `url.${pathToFileURL(remote).href}.insteadOf`, hostUrl]);

    try {
      const sequence = await runArcAnchoredSequence([
        ["plan", "open", "alpha", "--json"],
        {
          command: ["git", "commit", "--allow-empty", "--no-verify", "-m", "groom alpha"],
          cwdFromPreviousJson: "activeLocusPath",
        },
        { command: ["git", "push", "-u", "origin", branch], reuseResolvedCwd: true },
        { args: ["plan", "close", "alpha", "--json"], reuseResolvedCwd: true },
        { args: ["plan", "open", "alpha", "--json"], cwd: repository },
      ], repository, {
        timeout: 120_000,
        anchorShellPath: harness.executable,
        env: {
          PATH: `${hostHarness}:${process.env.PATH ?? ""}`,
          ARC_TEST_BRANCH: branch,
        },
      });

      expect(sequence.exitCode, sequence.stderr || sequence.stdout).toBe(0);
      const [opened, closed, resumed] = sequence.results as Record<string, unknown>[];
      expect(opened).toMatchObject({ outcome: "applied", operation: "plan-open" });
      expect(closed).toMatchObject({
        outcome: "applied",
        operation: "plan-close",
        identity: { state: "awaiting-merge" },
      });
      expect(resumed).toMatchObject({
        outcome: "applied",
        operation: "plan-open",
        identity: { state: "open", changeRequest: null },
      });
    } finally {
      await removeGitBackedDir(hostHarness);
    }
  });

  it("preserves the execute-bound queue across recovery, abandonment, and branch reuse", async () => {
    await writeInbox(repository);

    const sequence = await runArcAnchoredSequence([
      ["housekeep", "open", "inbox-drain", "--json"],
      {
        args: ["housekeep", "mark-execute", "Run sibling", "Keep routed", "--json"],
        cwdFromPreviousJson: "activeLocusPath",
      },
      {
        args: ["housekeep", "open", "second-name", "--json"],
        reuseResolvedCwd: true,
      },
      { args: ["status", "--session-init", "--write-compaction-seed", "--json"], reuseResolvedCwd: true },
      { args: ["recover", "audit", "--json"], reuseResolvedCwd: true },
      { args: ["housekeep", "open", "inbox-drain", "--json"], reuseResolvedCwd: true },
      { command: ["git", "push", "-u", "origin", "chore/inbox-drain"], reuseResolvedCwd: true },
      { args: ["housekeep", "abandon", "inbox-drain", "--json"], reuseResolvedCwd: true },
      { args: ["status", "--session-init", "--json"], cwd: repository },
      { args: ["housekeep", "open", "inbox-drain", "--json"], cwd: repository },
      { command: ["git", "push", "-u", "origin", "chore/inbox-drain"], cwdFromPreviousJson: "activeLocusPath" },
      { args: ["housekeep", "abandon", "inbox-drain", "--json"], reuseResolvedCwd: true },
    ], repository, { timeout: 120_000, anchorShellPath: harness.executable });

    expect(sequence.exitCode, sequence.stderr || sequence.stdout).toBe(0);
    const [opened, marked, conflict, , audit, replayed, abandoned, postAbandon, reopened, abandonedAgain]
      = sequence.results as [
        Record<string, unknown>, Record<string, unknown>, Record<string, unknown>, Record<string, unknown>,
        Record<string, unknown>, Record<string, unknown>, Record<string, unknown>, Record<string, unknown>,
        Record<string, unknown>, Record<string, unknown>,
    ];
    expect(marked).toMatchObject({
      mode: "housekeep-mark-execute",
      outcome: "applied",
      entries: [
        { title: "Run sibling", state: "applied" },
        { title: "Keep routed", state: "applied" },
      ],
    });
    expect(opened).toMatchObject({
      outcome: "applied",
      operation: "housekeep-open",
      identity: { purpose: "housekeep-routing" },
    });
    expect(conflict).toMatchObject({
      outcome: "refused",
      operation: "housekeep-open",
      reason: "identity-conflict",
    });
    expect(audit).toMatchObject({
      verdict: { status: "ready", ready: true, locusHint: { match: true } },
      recover: { recoveryFrame: { ok: true, value: { workflow: "drain-inbox" } } },
    });
    expect(replayed).toMatchObject({
      outcome: "idempotent",
      operation: "housekeep-open",
      identity: { claimId: (opened.identity as { claimId: string }).claimId },
    });
    expect(abandoned).toMatchObject({ outcome: "applied", operation: "housekeep-abandon" });
    expect(postAbandon).toMatchObject({
      inboxState: {
        ok: true,
        value: { pendingExecuteBound: ["Run sibling", "Keep routed"] },
      },
    });
    expect(reopened).toMatchObject({
      outcome: "applied",
      operation: "housekeep-open",
      identity: { purpose: "housekeep-routing" },
    });
    expect((reopened.identity as { claimId: string }).claimId)
      .not.toBe((opened.identity as { claimId: string }).claimId);
    expect(abandonedAgain).toMatchObject({ outcome: "applied", operation: "housekeep-abandon" });
  });

  it("rebuilds occupancy for an interrupted open housekeeping claim", async () => {
    const now = "2026-07-22T00:00:00.000Z";
    const record = TransientIdentityRecordV3Schema.parse({
      version: 3,
      kind: "errand",
      purpose: "housekeep-routing",
      slug: "interrupted-drain",
      claimId: "7".repeat(32),
      createdAt: now,
      updatedAt: now,
      branch: "chore/interrupted-drain",
      state: "open",
      savedHead: null,
      changeRequest: null,
    }) as HousekeepIdentityRecord;
    await expect(transactTransientIdentities({
      identity: "test-user",
      exec: makeGitExec(repository),
      execInput: makeGitExecInput(repository),
    }, {
      remote: "origin",
      message: "seed interrupted housekeep claim",
      transform: housekeepClaimTransform(record),
    })).resolves.toMatchObject({ kind: "applied" });

    const sequence = await runArcAnchoredSequence([
      ["housekeep", "open", record.slug, "--json"],
      { command: ["git", "push", "-u", "origin", record.branch], cwdFromPreviousJson: "activeLocusPath" },
      { args: ["housekeep", "abandon", record.slug, "--json"], reuseResolvedCwd: true },
    ], repository, { timeout: 120_000, anchorShellPath: harness.executable });

    expect(sequence.exitCode, sequence.stderr || sequence.stdout).toBe(0);
    const [opened, abandoned] = sequence.results as Record<string, unknown>[];
    expect(opened).toMatchObject({
      outcome: "idempotent",
      operation: "housekeep-open",
      identity: { claimId: record.claimId, state: "open" },
      activeLocusPath: expect.any(String),
      recordId: expect.any(String),
      leaseId: expect.any(String),
    });
    expect(abandoned).toMatchObject({ outcome: "applied", operation: "housekeep-abandon" });
  });
});
