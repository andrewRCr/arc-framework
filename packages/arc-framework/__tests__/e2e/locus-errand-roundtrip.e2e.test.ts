/** Real CLI ordinary-Errand lifecycle and promotion coverage. */

import { execFile } from "node:child_process";
import { chmod, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
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

async function setFullProtection(repository: string): Promise<void> {
  const path = join(repository, ".arc", "system", "arc-config.yml");
  const config = await readFile(path, "utf8");
  const protectedConfig = config.replace("branch.protection: partial", "branch.protection: full");
  if (protectedConfig === config) throw new Error("Expected the fixture to use partial branch protection.");
  await writeFile(path, protectedConfig);
}

async function createBareRemote(repository: string): Promise<string> {
  const remote = await mkdtemp(join(tmpdir(), "arc-locus-promotion-remote-"));
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
  await git(repository, ["remote", "add", "origin", remote]);
  await git(repository, ["push", "-u", "origin", "main"]);
  return remote;
}

async function createCodexHarness(): Promise<{ directory: string; executable: string }> {
  const directory = await mkdtemp(join(tmpdir(), "arc-locus-promotion-codex-"));
  const executable = join(directory, "codex");
  await symlink("/bin/bash", executable);
  return { directory, executable };
}

async function createOpenChangeRequestHarness(): Promise<{ directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), "arc-locus-roundtrip-gh-"));
  const executable = join(directory, "gh");
  await writeFile(
    executable,
    [
      "#!/bin/sh",
      "head=$(git rev-parse \"refs/remotes/origin/$ARC_TEST_BRANCH\") || exit 1",
      "printf '[{\"number\":1,\"state\":\"OPEN\",\"baseRefName\":\"main\",'",
      "printf '\"headRefName\":\"%s\",\"headRefOid\":\"%s\",' \"$ARC_TEST_BRANCH\" \"$head\"",
      "printf '\"reviewDecision\":\"\"}]\\n'",
    ].join("\n"),
  );
  await chmod(executable, 0o755);
  return { directory };
}

async function createForkOnlyChangeRequestHarness(): Promise<{ directory: string }> {
  const directory = await mkdtemp(join(tmpdir(), "arc-locus-fork-only-gh-"));
  const executable = join(directory, "gh");
  await writeFile(
    executable,
    [
      "#!/bin/sh",
      "head=$(git rev-parse HEAD) || exit 1",
      "printf '[{\"number\":1,\"state\":\"OPEN\",\"baseRefName\":\"main\",'",
      "printf '\"headRefName\":\"%s\",\"headRefOid\":\"%s\",' \"$ARC_TEST_BRANCH\" \"$head\"",
      "printf '\"reviewDecision\":\"\"}]\\n'",
    ].join("\n"),
  );
  await chmod(executable, 0o755);
  return { directory };
}

async function readMaterializedMarker(checkoutPath: string): Promise<unknown> {
  return JSON.parse(await readFile(
    join(checkoutPath, ".arc", "system", ".internal", "worktree-marker.json"),
    "utf8",
  ));
}

describe("ordinary Errand promotion", () => {
  let repository: string;

  beforeEach(async () => {
    repository = await createTempRepo();
    const initialized = await runArc(["init", "--yes", "--name", "locus-promotion"], repository);
    expect(initialized.exitCode).toBe(0);
    await setFullProtection(repository);
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "--no-verify", "-m", "initialize fixture"]);
  });

  afterEach(async () => {
    await cleanupTempDir(repository);
  });

  it("materializes the exact awaiting-merge tail produced by leave", async () => {
    const remote = await createBareRemote(repository);
    const harness = await createCodexHarness();
    const hostHarness = await createOpenChangeRequestHarness();
    const slug = "review-roundtrip";
    const errandBranch = `chore/${slug}`;
    try {
      const hostUrl = "https://github.com/owner/repo.git";
      await git(repository, ["remote", "set-url", "origin", hostUrl]);
      await git(repository, ["config", `url.${pathToFileURL(remote).href}.insteadOf`, hostUrl]);
      const sequence = await runArcAnchoredSequence([
        ["errand", "open", slug, "--json"],
        {
          command: ["git", "commit", "--allow-empty", "--no-verify", "-m", "prepare requested work"],
          cwdFromPreviousJson: "allocation.checkoutPath",
        },
        { command: ["git", "push", "-u", "origin", errandBranch], reuseResolvedCwd: true },
        { args: ["errand", "leave", slug, "--state", "awaiting-merge", "--json"], reuseResolvedCwd: true },
        { command: ["git", "branch", "-D", errandBranch], cwd: repository },
        { command: ["git", "update-ref", "-d", "refs/arc/user/test-user/errands"], cwd: repository },
        { args: ["errand", "materialize", slug, "--json"], cwd: repository },
      ], repository, {
        timeout: 90_000,
        anchorShellPath: harness.executable,
        env: {
          PATH: `${hostHarness.directory}:${process.env.PATH ?? ""}`,
          ARC_TEST_BRANCH: errandBranch,
        },
      });

      expect(sequence.exitCode, sequence.stderr || sequence.stdout).toBe(0);
      const [opened, left, materialized] = sequence.results as [
        Record<string, unknown>,
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      expect(opened).toMatchObject({ outcome: "applied", operation: "errand-open" });
      expect(left).toMatchObject({
        outcome: "applied",
        operation: "errand-leave",
        subject: { kind: "errand", slug, claimId: expect.any(String) },
        generation: expect.any(String),
        settlement: {
          kind: "identity-tail",
          state: "awaiting-merge",
          changeRequest: expect.any(Object),
        },
      });
      expect(left).not.toHaveProperty("identity");
      expect(left).not.toHaveProperty("recordId");
      expect(left).not.toHaveProperty("leaseId");
      expect(left).not.toHaveProperty("sessionHomePath");
      expect(materialized).toMatchObject({
        outcome: "applied",
        operation: "errand-materialize",
        allocation: { kind: "spawned" },
        identity: { state: "open", changeRequest: null },
      });
      const result = materialized as {
        allocation: { checkoutPath: string };
        identity: { claimId: string };
      };
      expect(await readMaterializedMarker(result.allocation.checkoutPath)).toMatchObject({
        spawnedByArc: true,
        createdFor: { kind: "errand", slug, claimId: result.identity.claimId },
        provisioning: "ready",
      });
    } finally {
      await removeGitBackedDir(remote);
      await removeGitBackedDir(harness.directory);
      await removeGitBackedDir(hostHarness.directory);
    }
  });

  it("refuses an awaiting-merge tail whose head is not preserved on origin", async () => {
    const remote = await createBareRemote(repository);
    const harness = await createCodexHarness();
    const hostHarness = await createForkOnlyChangeRequestHarness();
    const slug = "fork-only-review";
    const errandBranch = `chore/${slug}`;
    try {
      const hostUrl = "https://github.com/owner/repo.git";
      await git(repository, ["remote", "set-url", "origin", hostUrl]);
      await git(repository, ["config", `url.${pathToFileURL(remote).href}.insteadOf`, hostUrl]);
      const sequence = await runArcAnchoredSequence([
        ["errand", "open", slug, "--json"],
        {
          command: ["git", "commit", "--allow-empty", "--no-verify", "-m", "prepare fork-only work"],
          cwdFromPreviousJson: "allocation.checkoutPath",
        },
        { args: ["errand", "leave", slug, "--state", "awaiting-merge", "--json"], reuseResolvedCwd: true },
      ], repository, {
        timeout: 90_000,
        anchorShellPath: harness.executable,
        env: {
          PATH: `${hostHarness.directory}:${process.env.PATH ?? ""}`,
          ARC_TEST_BRANCH: errandBranch,
        },
      });

      expect(sequence.exitCode, sequence.stderr || sequence.stdout).toBe(1);
      expect(sequence.results).toMatchObject([
        { outcome: "applied", operation: "errand-open", identity: { state: "open" } },
        { outcome: "refused", operation: "errand-leave", reason: "preservation-unproven" },
      ]);
      const opened = sequence.results[0] as {
        allocation: { checkoutPath: string };
        identity: { claimId: string };
      };
      expect(await readMaterializedMarker(opened.allocation.checkoutPath)).toMatchObject({
        spawnedByArc: false,
        createdFor: { kind: "errand", slug, claimId: opened.identity.claimId },
        provisioning: "ready",
      });
      expect(JSON.parse(await git(repository, ["show", `refs/arc/user/test-user/errands:${slug}`])))
        .toMatchObject({ state: "open", branch: errandBranch });
    } finally {
      await removeGitBackedDir(remote);
      await removeGitBackedDir(harness.directory);
      await removeGitBackedDir(hostHarness.directory);
    }
  });

  it("resumes an awaiting-merge tail through open without durable plan artifacts", async () => {
    const remote = await createBareRemote(repository);
    const harness = await createCodexHarness();
    const hostHarness = await createOpenChangeRequestHarness();
    const slug = "direct-resume";
    const errandBranch = `chore/${slug}`;
    try {
      const hostUrl = "https://github.com/owner/repo.git";
      await git(repository, ["remote", "set-url", "origin", hostUrl]);
      await git(repository, ["config", `url.${pathToFileURL(remote).href}.insteadOf`, hostUrl]);
      const sequence = await runArcAnchoredSequence([
        ["errand", "open", slug, "--json"],
        {
          command: ["git", "commit", "--allow-empty", "--no-verify", "-m", "prepare requested work"],
          cwdFromPreviousJson: "allocation.checkoutPath",
        },
        { command: ["git", "push", "-u", "origin", errandBranch], reuseResolvedCwd: true },
        { args: ["errand", "leave", slug, "--state", "awaiting-merge", "--json"], reuseResolvedCwd: true },
        { args: ["errand", "open", slug, "--json"], cwd: repository },
      ], repository, {
        timeout: 90_000,
        anchorShellPath: harness.executable,
        env: {
          PATH: `${hostHarness.directory}:${process.env.PATH ?? ""}`,
          ARC_TEST_BRANCH: errandBranch,
        },
      });

      expect(sequence.exitCode, sequence.stderr || sequence.stdout).toBe(0);
      expect(sequence.results).toMatchObject([
        { outcome: "applied", operation: "errand-open", identity: { state: "open" } },
        {
          outcome: "applied",
          operation: "errand-leave",
          subject: { kind: "errand", slug, claimId: expect.any(String) },
          generation: expect.any(String),
          settlement: {
            kind: "identity-tail",
            state: "awaiting-merge",
            changeRequest: expect.any(Object),
          },
        },
        { outcome: "applied", operation: "errand-open", identity: { state: "open", changeRequest: null } },
      ]);
      expect(sequence.results[1]).not.toHaveProperty("identity");
      await expect(readFile(join(repository, ".arc", "active", `meta-${slug}.md`))).rejects.toThrow();
      await expect(readFile(join(repository, ".arc", "active", `tasks-${slug}.md`))).rejects.toThrow();
      await expect(readFile(
        join(repository, ".arc", "user", "test-user", slug, "SESSION-NOTES.md"),
      )).rejects.toThrow();
    } finally {
      await removeGitBackedDir(remote);
      await removeGitBackedDir(harness.directory);
      await removeGitBackedDir(hostHarness.directory);
    }
  });

  it.each([
    { floor: "scale", branch: "feat/growth-unit", state: "Active" },
    { floor: "derivation", branch: "plan/growth-unit", state: "Planning" },
  ] as const)("promotes a cold v3 Errand at the $floor floor", async ({ floor, branch, state }) => {
    const remote = await createBareRemote(repository);
    const harness = await createCodexHarness();
    try {
      const sequence = await runArcAnchoredSequence([
        ["errand", "open", "growing", "--json"],
        {
          args: ["errand", "promote", "growing", "--name", "growth-unit", "--type", "feat", "--floor", floor,
            "--json"],
          cwdFromPreviousJson: "allocation.checkoutPath",
        },
      ], repository, { timeout: 60_000, anchorShellPath: harness.executable });

      expect(sequence.exitCode, sequence.stderr || sequence.stdout).toBe(0);
      expect(sequence.results[0]).toMatchObject({
        outcome: "applied",
        operation: "errand-open",
        identity: { kind: "errand", key: "growing", claimId: expect.any(String), state: "open" },
      });
      expect(sequence.results[1]).toMatchObject({
        outcome: "applied",
        operation: "errand-promote",
        allocation: "primary",
        checkoutPath: repository,
        parentCheckoutPath: null,
        subject: { kind: "errand", slug: "growing", claimId: expect.any(String) },
        settlement: {
          state: "commit-required",
          identity: "retained",
          originEntry: null,
          originEntrySourceDigest: null,
        },
      });
      expect(await git(repository, ["branch", "--show-current"])).toBe(branch);
      const meta = await readFile(join(repository, ".arc", "active", "meta-growth-unit.md"), "utf8");
      expect(meta).toContain(`# Metadata: growth-unit`);
      expect(meta).toContain(`\`${state}\``);
      expect(meta).toContain(`\`${branch}\``);
      if (floor === "derivation") expect(meta).toContain("draft-design");
      expect(JSON.parse(await git(
        repository,
        ["cat-file", "-p", "refs/arc/user/test-user/errands:growing"],
      ))).toMatchObject({ state: "open" });
    } finally {
      await removeGitBackedDir(remote);
      await removeGitBackedDir(harness.directory);
    }
  });

  it("settles the exact retained capture when promotion replays after the meta commit", async () => {
    const remote = await createBareRemote(repository);
    const harness = await createCodexHarness();
    const inboxDir = join(repository, ".arc", "user", "test-user");
    const inboxPath = join(inboxDir, "USER-INBOX.md");
    await writeFile(
      inboxPath,
      "# User Inbox\n\n## Work Unit\n\n### `[ ]` **Grow this concern**\n\n- _Observation:_ promote me.\n\n---\n",
    );
    try {
      const sequence = await runArcAnchoredSequence([
        ["errand", "open", "growing", "--from-inbox", "Grow this concern", "--json"],
        {
          args: ["errand", "promote", "growing", "--name", "growth-unit", "--type", "feat", "--floor", "scale",
            "--json"],
          cwdFromPreviousJson: "allocation.checkoutPath",
        },
        {
          command: ["git", "-c", "core.hooksPath=/dev/null", "add", ".arc/active/meta-growth-unit.md"],
          reuseResolvedCwd: true,
        },
        {
          command: ["git", "-c", "core.hooksPath=/dev/null", "commit", "-m", "promote errand"],
          reuseResolvedCwd: true,
        },
        {
          args: ["errand", "promote", "growing", "--name", "growth-unit", "--type", "feat", "--floor", "scale",
            "--json"],
          reuseResolvedCwd: true,
        },
      ], repository, { timeout: 60_000, anchorShellPath: harness.executable });

      expect(sequence.exitCode, sequence.stderr || sequence.stdout).toBe(0);
      expect(sequence.results[1]).toMatchObject({
        outcome: "applied",
        settlement: {
          state: "commit-required",
          identity: "retained",
          originEntry: "Grow this concern",
          originEntrySourceDigest: expect.stringMatching(/^sha256:/u),
        },
      });
      expect(sequence.results[2]).toMatchObject({
        outcome: "applied",
        operation: "errand-promote",
        settlement: {
          state: "settled",
          identity: "retired",
          originEntry: null,
          originEntrySourceDigest: null,
        },
      });
      expect(await readFile(inboxPath, "utf8")).not.toContain("**Grow this concern**");
    } finally {
      await removeGitBackedDir(remote);
      await removeGitBackedDir(harness.directory);
    }
  });

  it("refuses capture settlement without removing a same-title replacement", async () => {
    const remote = await createBareRemote(repository);
    const harness = await createCodexHarness();
    const inboxDir = join(repository, ".arc", "user", "test-user");
    const inboxPath = join(inboxDir, "USER-INBOX.md");
    const replacement = "# User Inbox\n\n## Work Unit\n\n### `[ ]` **Grow this concern**\n\n"
      + "- _Observation:_ replacement generation.\n\n---\n";
    await writeFile(
      inboxPath,
      "# User Inbox\n\n## Work Unit\n\n### `[ ]` **Grow this concern**\n\n- _Observation:_ original generation.\n\n---\n",
    );
    try {
      const sequence = await runArcAnchoredSequence([
        ["errand", "open", "growing", "--from-inbox", "Grow this concern", "--json"],
        {
          args: ["errand", "promote", "growing", "--name", "growth-unit", "--type", "feat", "--floor", "scale",
            "--json"],
          cwdFromPreviousJson: "allocation.checkoutPath",
        },
        {
          command: [process.execPath, "-e", "require('node:fs').writeFileSync(process.argv[1], process.argv[2])",
            inboxPath, replacement],
          reuseResolvedCwd: true,
        },
        {
          command: ["git", "-c", "core.hooksPath=/dev/null", "add", ".arc/active/meta-growth-unit.md"],
          reuseResolvedCwd: true,
        },
        {
          command: ["git", "-c", "core.hooksPath=/dev/null", "commit", "-m", "promote errand"],
          reuseResolvedCwd: true,
        },
        {
          args: ["errand", "promote", "growing", "--name", "growth-unit", "--type", "feat", "--floor", "scale",
            "--json"],
          reuseResolvedCwd: true,
        },
      ], repository, { timeout: 60_000, anchorShellPath: harness.executable });

      expect(sequence.exitCode).toBe(1);
      expect(sequence.results.at(-1)).toMatchObject({
        outcome: "refused",
        operation: "errand-promote",
        reason: "inbox-link-conflict",
      });
      expect(await readFile(inboxPath, "utf8")).toBe(replacement);
    } finally {
      await removeGitBackedDir(remote);
      await removeGitBackedDir(harness.directory);
    }
  });
});
