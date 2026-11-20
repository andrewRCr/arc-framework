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
} from "./store-default.js";
import { assertEditorDocumentsProvisioned, resetEditorDocumentsProvisioning } from "./editor-document-helpers.js";
import { SlugSchema } from "../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { IN_REPO_STORE_OVERRIDE } from "../../src/lib/store/selection.js";
import { useInRepoStoreForEach } from "../helpers/in-repo-store-override.js";
import { readStoreRecord } from "../helpers/store/seed-store.js";

const execFileAsync = promisify(execFile);
const IDENTITY = SlugSchema.parse("test-user");

/** A work item's record of one kind, selected by its name. */
function workItemReference(kind: "work-item/record" | "work-item/meta" | "work-item/task-list", name: string) {
  return recordReferences[kind](OwnerIdentitySchema.parse({ type: "work-item", name }));
}

/** The branch an applied Errand open reports, which the store suffixes with the generation it mints. */
function openedBranch(result: unknown): string {
  const branch = (result as { identity?: { branch?: unknown } } | undefined)?.identity?.branch;
  if (typeof branch !== "string") throw new Error("The open reported no branch");
  return branch;
}

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
  // Only the store keeps a state remote.
  if (process.env[IN_REPO_STORE_OVERRIDE] === undefined) {
    const designated = await runArc(["store", "remote", "origin", "push"], repository);
    expect(designated.exitCode, designated.stderr).toBe(0);
  }
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
      // The store suffixes the Errand's branch, so the host answers for the branch the query names.
      "branch=''; previous=''",
      "for argument in \"$@\"; do",
      "  if [ \"$previous\" = --head ]; then branch=\"$argument\"; fi",
      "  previous=\"$argument\"",
      "done",
      "head=$(git rev-parse \"refs/remotes/origin/$branch\") || exit 1",
      "printf '[{\"number\":1,\"state\":\"OPEN\",\"baseRefName\":\"main\",'",
      "printf '\"headRefName\":\"%s\",\"headRefOid\":\"%s\",' \"$branch\" \"$head\"",
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
      // The store suffixes the Errand's branch, so the host answers for the branch the query names.
      "branch=''; previous=''",
      "for argument in \"$@\"; do",
      "  if [ \"$previous\" = --head ]; then branch=\"$argument\"; fi",
      "  previous=\"$argument\"",
      "done",
      "head=$(git rev-parse HEAD) || exit 1",
      "printf '[{\"number\":1,\"state\":\"OPEN\",\"baseRefName\":\"main\",'",
      "printf '\"headRefName\":\"%s\",\"headRefOid\":\"%s\",' \"$branch\" \"$head\"",
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

let repository: string;

/** Initialize a full-protection repository for each case, on whichever store the case runs. */
function useFixtureRepository(): void {
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
}

describe("ordinary Errand promotion", () => {
  useFixtureRepository();

  it("materializes the exact awaiting-merge tail produced by leave", async () => {
    const remote = await createBareRemote(repository);
    const harness = await createCodexHarness();
    const hostHarness = await createOpenChangeRequestHarness();
    const slug = "review-roundtrip";
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
        { command: ["git", "push", "-u", "origin", "HEAD"], reuseResolvedCwd: true },
        { args: ["errand", "leave", slug, "--state", "awaiting-merge", "--json"], reuseResolvedCwd: true },
      ], repository, {
        timeout: 90_000,
        anchorShellPath: harness.executable,
        env: { PATH: `${hostHarness.directory}:${process.env.PATH ?? ""}` },
      });

      expect(sequence.exitCode, sequence.stderr || sequence.stdout).toBe(0);
      const [opened, left] = sequence.results as [
        Record<string, unknown>,
        Record<string, unknown>,
      ];
      // The store keeps the Errand's record, so only its local branch goes; materializing takes the code from origin.
      await git(repository, ["branch", "-D", openedBranch(opened)]);
      await resetEditorDocumentsProvisioning(repository);
      const materialization = await runArcAnchoredSequence([["errand", "materialize", slug, "--json"]], repository, {
        timeout: 90_000, anchorShellPath: harness.executable,
        env: { PATH: `${hostHarness.directory}:${process.env.PATH ?? ""}` },
      });
      expect(materialization.exitCode, materialization.stderr || materialization.stdout).toBe(0);
      const materialized = materialization.results[0] as Record<string, unknown>;
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
      await assertEditorDocumentsProvisioned(result.allocation.checkoutPath);
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
        env: { PATH: `${hostHarness.directory}:${process.env.PATH ?? ""}` },
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
      const errand = await readStoreRecord(repository, IDENTITY, workItemReference("work-item/record", slug));
      expect(JSON.parse(errand.content)).toMatchObject({ state: "open", branch: openedBranch(sequence.results[0]) });
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
        { command: ["git", "push", "-u", "origin", "HEAD"], reuseResolvedCwd: true },
        { args: ["errand", "leave", slug, "--state", "awaiting-merge", "--json"], reuseResolvedCwd: true },
        { args: ["errand", "open", slug, "--json"], cwd: repository },
      ], repository, {
        timeout: 90_000,
        anchorShellPath: harness.executable,
        env: { PATH: `${hostHarness.directory}:${process.env.PATH ?? ""}` },
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
      // A work unit's plan is its meta, which carries its session context, and its task list. The Errand's primary
      // record stays an Errand's rather than a meta, and no task list is held for it.
      const primary = await readStoreRecord(repository, IDENTITY, workItemReference("work-item/record", slug));
      expect(primary.reference.kind).toBe("work-item/record");
      await expect(readStoreRecord(repository, IDENTITY, workItemReference("work-item/task-list", slug))).rejects.toThrow();
    } finally {
      await removeGitBackedDir(remote);
      await removeGitBackedDir(harness.directory);
      await removeGitBackedDir(hostHarness.directory);
    }
  });

  it.each([
    // The store cuts the work branch at either floor; a derivation-floor unit plans on it until activation.
    { floor: "scale", branch: "feat/growth-unit", state: "Active" },
    { floor: "derivation", branch: "feat/growth-unit", state: "Planning" },
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
        metaPath: ".arc/active/current/meta-growth-unit.md",
        // The store promotes in one write, retiring the Errand's identity there.
        settlement: {
          state: "settled",
          identity: "retired",
          originEntry: null,
          originEntrySourceDigest: null,
        },
      });
      expect(await git(repository, ["branch", "--show-current"])).toBe(branch);
      // The store holds the meta, and links the work branch to it rather than naming it there.
      const meta = await readStoreRecord(repository, IDENTITY, workItemReference("work-item/meta", "growth-unit"));
      expect(meta.content).toContain(`# Metadata: growth-unit`);
      expect(meta.content).toContain(`\`${state}\``);
      if (floor === "derivation") expect(meta.content).toContain("draft-design");
      expect(meta.links?.branches).toContainEqual(expect.objectContaining({ ref: branch, linkedAs: "created" }));
    } finally {
      await removeGitBackedDir(remote);
      await removeGitBackedDir(harness.directory);
    }
  });
});

describe("ordinary Errand promotion over the in-repo store", () => {
  // Replaying a promotion after its meta commit to settle a capture matched by title is the in-repo store's; the store
  // promotes in one write and links captures by qualified ID.
  useInRepoStoreForEach();
  useFixtureRepository();

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
