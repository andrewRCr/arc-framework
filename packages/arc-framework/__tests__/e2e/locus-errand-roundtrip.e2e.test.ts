/** Real CLI ordinary-Errand lifecycle and promotion coverage. */

import { execFile } from "node:child_process";
import { chmod, copyFile, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
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
  await copyFile("/bin/bash", executable);
  await chmod(executable, 0o755);
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

async function readMaterializedMarker(checkoutPath: string): Promise<unknown> {
  return JSON.parse(await readFile(
    join(checkoutPath, ".arc", "system", ".internal", "worktree-marker.json"),
    "utf8",
  ));
}

async function readLocusRecord(repository: string, recordId: string): Promise<unknown> {
  const root = join(repository, ".arc", "user", "test-user", ".internal", "loci");
  for (const name of await readdir(root)) {
    if (!name.endsWith(".json")) continue;
    const record = JSON.parse(await readFile(join(root, name), "utf8")) as { recordId?: string };
    if (record.recordId === recordId) return record;
  }
  throw new Error(`Could not find locus record ${recordId}`);
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
          cwdFromPreviousJson: "activeLocusPath",
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
        identity: { state: "awaiting-merge" },
      });
      expect(materialized).toMatchObject({
        outcome: "applied",
        operation: "errand-materialize",
        allocation: { kind: "spawned" },
        identity: { state: "open", changeRequest: null },
      });
      const result = materialized as {
        activeLocusPath: string;
        recordId: string;
        identity: { claimId: string };
      };
      expect(await readMaterializedMarker(result.activeLocusPath)).toMatchObject({
        spawnedByArc: true,
        createdFor: { kind: "errand", slug, claimId: result.identity.claimId },
        provisioning: "ready",
      });
      expect(await readLocusRecord(repository, result.recordId)).toMatchObject({
        checkoutPath: result.activeLocusPath,
        role: {
          kind: "errand",
          subject: { kind: "errand", key: slug, claimId: result.identity.claimId },
        },
      });
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
          cwdFromPreviousJson: "activeLocusPath",
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
        { outcome: "applied", operation: "errand-leave", identity: { state: "awaiting-merge" } },
        { outcome: "applied", operation: "errand-open", identity: { state: "open", changeRequest: null } },
      ]);
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
          cwdFromPreviousJson: "activeLocusPath",
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
        allocation: { kind: "primary", checkoutPath: repository },
        identity: null,
        activeLocusPath: repository,
        sessionHomePath: repository,
      });
      expect(await git(repository, ["branch", "--show-current"])).toBe(branch);
      const meta = await readFile(join(repository, ".arc", "active", "meta-growth-unit.md"), "utf8");
      expect(meta).toContain(`# Metadata: growth-unit`);
      expect(meta).toContain(`\`${state}\``);
      expect(meta).toContain(`\`${branch}\``);
      if (floor === "derivation") expect(meta).toContain("draft-design");
      await expect(
        git(repository, ["cat-file", "-p", "refs/arc/user/test-user/errands:growing"]),
      ).rejects.toThrow();
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
          cwdFromPreviousJson: "activeLocusPath",
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
        originEntry: "Grow this concern",
        originEntrySourceDigest: expect.stringMatching(/^sha256:/u),
      });
      expect(sequence.results[2]).toMatchObject({
        outcome: "applied",
        operation: "errand-promote",
        originEntry: null,
        originEntrySourceDigest: null,
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
          cwdFromPreviousJson: "activeLocusPath",
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
