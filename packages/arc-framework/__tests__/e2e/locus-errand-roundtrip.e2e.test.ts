/** Real CLI round trips between work-unit, transient, and record-free locus frames. */

import { execFile } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
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

async function setProtection(repository: string, protection: "full" | "partial"): Promise<void> {
  const path = join(repository, ".arc", "system", "arc-config.yml");
  const config = await readFile(path, "utf8");
  await writeFile(path, config.replace(/branch\.protection: (?:full|partial)/u, `branch.protection: ${protection}`));
}

async function createBareRemote(repository: string): Promise<string> {
  const remote = await mkdtemp(join(tmpdir(), "arc-locus-roundtrip-remote-"));
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
  await git(repository, ["remote", "add", "origin", remote]);
  return remote;
}

async function createCodexHarness(): Promise<{ directory: string; executable: string }> {
  const directory = await mkdtemp(join(tmpdir(), "arc-locus-roundtrip-codex-"));
  const executable = join(directory, "codex");
  await copyFile("/bin/bash", executable);
  await chmod(executable, 0o755);
  return { directory, executable };
}

async function prepareWorkUnit(repository: string, mode: "planning" | "execution"): Promise<string> {
  await setProtection(repository, "full");
  await git(repository, ["config", "arc.identity", "test-user"]);
  await git(repository, ["add", "-A"]);
  await git(repository, ["commit", "--no-verify", "-m", "initialize fixture"]);
  const branch = mode === "planning" ? "plan/locus-parent" : "feat/locus-parent";
  await git(repository, ["switch", "-c", branch]);
  await mkdir(join(repository, ".arc", "active"), { recursive: true });
  const taskList = mode === "planning" ? "[none]" : "tasks-locus-parent.md";
  const design = mode === "planning" ? "draft-locus-parent.md" : "[none]";
  await writeFile(
    join(repository, ".arc", "active", "meta-locus-parent.md"),
    [
      "# Metadata: locus-parent",
      "",
      `- **State:** ${mode === "planning" ? "Planning" : "Active"}`,
      "- **Owner:** test-user",
      `- **Branch:** ${branch}`,
      "- **Class:** Light",
      "- **Cohort:** [none]",
      `- **Design:** ${design}`,
      `- **Task List:** ${taskList}`,
      "- **Current Workflow:** [none]",
      "- **Last Completed:** [none]",
      "- **Next Task:** Task 1.1 — Exercise the parent frame",
      "- **Blockers:** [none]",
      "- **Next Action:** Continue the parent frame",
      "",
    ].join("\n"),
  );
  if (mode === "planning") {
    await writeFile(join(repository, ".arc", "active", "draft-locus-parent.md"), "# Draft: locus-parent\n");
  } else {
    await writeFile(
      join(repository, ".arc", "active", "tasks-locus-parent.md"),
      [
        "# Tasks: locus-parent",
        "",
        "## **Phase 1:** Exercise",
        "",
        "### `[ ]` **1.1 Exercise the parent frame**",
        "",
        "    - `[ ]` **1.1.a Keep the cursor live**",
        "",
      ].join("\n"),
    );
  }
  await git(repository, ["add", "-A"]);
  await git(repository, ["commit", "--no-verify", "-m", `add ${mode} work unit`]);
  return branch;
}

describe("work-unit and Errand locus round trips", () => {
  let repository: string;

  beforeEach(async () => {
    repository = await createTempRepo();
    const initialized = await runArc(["init", "--yes", "--name", "locus-roundtrip"], repository);
    expect(initialized.exitCode).toBe(0);
  });

  afterEach(async () => {
    await cleanupTempDir(repository);
  });

  it.each(["planning", "execution"] as const)(
    "restores the exact %s WU after a spawned Errand pause and resume",
    async (mode) => {
      const branch = await prepareWorkUnit(repository, mode);
      const remote = await createBareRemote(repository);
      const harness = await createCodexHarness();
      try {
        await git(repository, ["push", "origin", "main"]);
        await git(repository, ["push", "-u", "origin", branch]);
        const slug = `${mode}-roundtrip`;
        const sequence = await runArcAnchoredSequence([
          ["locus", "attach", "--json"],
          ["errand", "open", slug, "--json"],
          {
            command: ["git", "push", "-u", "origin", `chore/${slug}`],
            cwdFromPreviousJson: "activeLocusPath",
          },
          { args: ["errand", "leave", slug, "--state", "paused", "--json"], reuseResolvedCwd: true },
          { args: ["errand", "open", slug, "--json"], cwdFromPreviousJson: "sessionHomePath" },
          {
            command: ["git", "push", "-u", "origin", `chore/${slug}`],
            cwdFromPreviousJson: "activeLocusPath",
          },
          { args: ["errand", "leave", slug, "--state", "paused", "--json"], reuseResolvedCwd: true },
          { args: ["status", "--session-init", "--json"], cwdFromPreviousJson: "sessionHomePath" },
        ], repository, { timeout: 90_000, anchorShellPath: harness.executable });

        expect(sequence.exitCode, sequence.stderr || sequence.stdout).toBe(0);
        const [, opened, left, resumed, leftAgain, state] = sequence.results as Record<string, unknown>[];
        expect(opened).toMatchObject({
          outcome: "applied",
          operation: "errand-open",
          allocation: { kind: "spawned" },
          restoredParent: null,
        });
        expect(left).toMatchObject({
          outcome: "applied",
          operation: "errand-leave",
          identity: { state: "paused" },
          restoredParent: { checkoutPath: repository },
        });
        expect(resumed).toMatchObject({
          outcome: "applied",
          operation: "errand-open",
          allocation: { kind: "spawned" },
          identity: { state: "open" },
        });
        expect(leftAgain).toMatchObject({
          outcome: "applied",
          restoredParent: { checkoutPath: repository },
        });
        expect(state).toMatchObject({
          locusState: {
            ok: true,
            value: {
              current: { kind: "resolved", parentRecordId: null },
              recovery: { kind: "resume", parentRecordId: null },
            },
          },
        });
      } finally {
        await removeGitBackedDir(remote);
        await removeGitBackedDir(harness.directory);
      }
    },
  );

  it("completes a cold partial Errand without releasing a WU lease", async () => {
    await setProtection(repository, "partial");
    await git(repository, ["config", "arc.identity", "test-user"]);
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "--no-verify", "-m", "initialize fixture"]);
    const remote = await createBareRemote(repository);
    const harness = await createCodexHarness();
    try {
      await git(repository, ["push", "-u", "origin", "main"]);
      const sequence = await runArcAnchoredSequence([
        ["errand", "open", "direct-roundtrip", "--json"],
        { command: ["git", "commit", "--allow-empty", "--no-verify", "-m", "complete direct errand"], cwdFromPreviousJson: "activeLocusPath" },
        { command: ["git", "push", "origin", "main"], reuseResolvedCwd: true },
        { args: ["errand", "close", "direct-roundtrip", "--json"], reuseResolvedCwd: true },
        { args: ["locus", "--json"], cwd: repository },
      ], repository, { timeout: 60_000, anchorShellPath: harness.executable });

      expect(sequence.exitCode, sequence.stderr || sequence.stdout).toBe(0);
      const [opened, closed, state] = sequence.results as Record<string, unknown>[];
      expect(opened).toMatchObject({
        outcome: "applied",
        operation: "errand-open",
        allocation: { kind: "primary", checkoutPath: repository },
        identity: null,
      });
      expect(closed).toMatchObject({
        outcome: "applied",
        operation: "errand-close",
        recordId: expect.any(String),
        leaseId: null,
        identity: null,
        restoredParent: null,
      });
      expect(state).toMatchObject({
        rows: [{ kind: "free-primary", checkoutPath: repository, recordId: null, lease: null }],
      });
    } finally {
      await removeGitBackedDir(remote);
      await removeGitBackedDir(harness.directory);
    }
  });

  it.each(["cold", "warm"] as const)(
    "promotes a %s Errand in place and makes the promoted checkout the session home",
    async (entry) => {
      let branch = "main";
      if (entry === "warm") branch = await prepareWorkUnit(repository, "execution");
      else {
        await setProtection(repository, "full");
        await git(repository, ["config", "arc.identity", "test-user"]);
        await git(repository, ["add", "-A"]);
        await git(repository, ["commit", "--no-verify", "-m", "initialize fixture"]);
      }
      const remote = await createBareRemote(repository);
      const harness = await createCodexHarness();
      try {
        await git(repository, ["push", "origin", "main"]);
        if (branch !== "main") await git(repository, ["push", "-u", "origin", branch]);
        const slug = `${entry}-growth`;
        const commands = entry === "warm"
          ? [["locus", "attach", "--json"] as const, ["errand", "open", slug, "--json"] as const]
          : [["errand", "open", slug, "--json"] as const];
        const sequence = await runArcAnchoredSequence([
          ...commands,
          {
            args: [
              "errand", "promote", slug, "--name", `${entry}-promoted`, "--type", "feat",
              "--floor", "scale", "--json",
            ],
            cwdFromPreviousJson: "activeLocusPath",
          },
          { args: ["locus", "--json"], reuseResolvedCwd: true },
        ], repository, { timeout: 60_000, anchorShellPath: harness.executable });

        expect(sequence.exitCode, sequence.stderr || sequence.stdout).toBe(0);
        const promoted = sequence.results.at(-2) as Record<string, unknown>;
        const roster = sequence.results.at(-1) as { rows: Array<Record<string, unknown>> };
        expect(promoted, JSON.stringify(promoted)).toMatchObject({
          outcome: "applied",
          operation: "errand-promote",
          allocation: { kind: entry === "warm" ? "spawned" : "primary" },
          identity: null,
          activeLocusPath: expect.any(String),
          sessionHomePath: expect.any(String),
        });
        const promotedPath = (promoted.activeLocusPath as string);
        expect(promoted.sessionHomePath).toBe(promotedPath);
        expect(roster.rows).toEqual(expect.arrayContaining([
          expect.objectContaining({
            checkoutPath: promotedPath,
            frame: "active",
            role: expect.objectContaining({
              kind: "work-unit",
              subject: { kind: "work-unit", key: `${entry}-promoted`, claimId: null },
              parentCheckoutPath: null,
            }),
            lease: expect.objectContaining({ sessionHomePath: promotedPath, state: "live" }),
          }),
        ]));
        if (entry === "warm") {
          expect(roster.rows).toEqual(expect.arrayContaining([
            expect.objectContaining({ checkoutPath: repository, lease: null }),
          ]));
        }
      } finally {
        await removeGitBackedDir(remote);
        await removeGitBackedDir(harness.directory);
      }
    },
  );

  it("resumes an awaiting-merge tail from an ordinary open change request", async () => {
    const branch = await prepareWorkUnit(repository, "execution");
    const remote = await createBareRemote(repository);
    const harness = await createCodexHarness();
    const hostHarness = await mkdtemp(join(tmpdir(), "arc-locus-roundtrip-gh-"));
    const fakeGh = join(hostHarness, "gh");
    const slug = "review-roundtrip";
    const errandBranch = `chore/${slug}`;
    await writeFile(
      fakeGh,
      [
        "#!/bin/sh",
        "head=$(git rev-parse \"$ARC_TEST_BRANCH\") || exit 1",
        "printf '[{\"number\":1,\"state\":\"OPEN\",\"baseRefName\":\"main\",'",
        "printf '\"headRefName\":\"%s\",\"headRefOid\":\"%s\",' \"$ARC_TEST_BRANCH\" \"$head\"",
        "printf '\"reviewDecision\":\"\"}]\\n'",
      ].join("\n"),
    );
    await chmod(fakeGh, 0o755);
    try {
      await git(repository, ["push", "origin", "main"]);
      await git(repository, ["push", "-u", "origin", branch]);
      const hostUrl = "https://github.com/owner/repo.git";
      await git(repository, ["remote", "set-url", "origin", hostUrl]);
      await git(repository, ["config", `url.${pathToFileURL(remote).href}.insteadOf`, hostUrl]);
      const sequence = await runArcAnchoredSequence([
        ["locus", "attach", "--json"],
        ["errand", "open", slug, "--json"],
        {
          command: ["git", "commit", "--allow-empty", "--no-verify", "-m", "prepare requested work"],
          cwdFromPreviousJson: "activeLocusPath",
        },
        { command: ["git", "push", "-u", "origin", errandBranch], reuseResolvedCwd: true },
        { args: ["errand", "leave", slug, "--state", "awaiting-merge", "--json"], reuseResolvedCwd: true },
        { args: ["errand", "open", slug, "--json"], cwdFromPreviousJson: "sessionHomePath" },
      ], repository, {
        timeout: 90_000,
        anchorShellPath: harness.executable,
        env: {
          PATH: `${hostHarness}:${process.env.PATH ?? ""}`,
          ARC_TEST_BRANCH: errandBranch,
        },
      });

      expect(sequence.exitCode, sequence.stderr || sequence.stdout).toBe(0);
      const [, opened, left, resumed] = sequence.results as Record<string, unknown>[];
      expect(opened).toMatchObject({ outcome: "applied", allocation: { kind: "spawned" } });
      expect(left).toMatchObject({
        outcome: "applied",
        operation: "errand-leave",
        identity: {
          state: "awaiting-merge",
          changeRequest: {
            repositoryRef: "owner/repo",
            hostRef: "github.com",
            baseRef: "main",
            headRef: errandBranch,
            headSha: expect.any(String),
          },
        },
        restoredParent: { checkoutPath: repository },
      });
      expect(resumed, JSON.stringify(resumed)).toMatchObject({
        outcome: "applied",
        operation: "errand-open",
        allocation: { kind: "spawned" },
        identity: { state: "open", changeRequest: null },
      });
    } finally {
      await removeGitBackedDir(remote);
      await removeGitBackedDir(harness.directory);
      await removeGitBackedDir(hostHarness);
    }
  });
});
