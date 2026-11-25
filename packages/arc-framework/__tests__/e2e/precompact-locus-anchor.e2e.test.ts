/** Real PreCompact seed emission beneath an attached Codex session locus. */

import { execFile } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CLI_PATH } from "../helpers/cli-spawn.js";
import { renderMetaFile } from "../../src/lib/active/meta-reader.js";
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
  if (protectedConfig === config) throw new Error("Expected partial branch protection in the fixture.");
  await writeFile(path, protectedConfig);
}

async function createBareRemote(repository: string): Promise<string> {
  const remote = await mkdtemp(join(tmpdir(), "arc-precompact-anchor-remote-"));
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
  await git(repository, ["remote", "add", "origin", remote]);
  await git(repository, ["push", "-u", "origin", "main"]);
  return remote;
}

async function createCodexHarness(): Promise<{ directory: string; executable: string }> {
  const directory = await mkdtemp(join(tmpdir(), "arc-precompact-anchor-codex-"));
  const executable = join(directory, "codex");
  await copyFile("/bin/bash", executable);
  await chmod(executable, 0o755);
  return { directory, executable };
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

describe("PreCompact locus anchor", () => {
  let repository: string;

  beforeEach(async () => {
    repository = await createTempRepo("arc-precompact-anchor-");
    const initialized = await runArc(["init", "--yes", "--name", "precompact-anchor"], repository);
    expect(initialized.exitCode, initialized.stderr || initialized.stdout).toBe(0);
    await setFullProtection(repository);
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "--no-verify", "-m", "initialize fixture"]);
  });

  afterEach(async () => {
    await cleanupTempDir(repository);
  });

  it.runIf(process.platform === "linux")("recovers the exact locus seeded by the shipped Codex hook", async () => {
    const remote = await createBareRemote(repository);
    const harness = await createCodexHarness();
    const hookPath = join(
      repository,
      ".arc",
      "system",
      ".internal",
      "harness-hooks",
      "common",
      "pre-compact-seed.mjs",
    );
    const arcCommand = `${process.execPath} ${CLI_PATH}`;
    const hookCommand = [
      "ARC_HOOK_HARNESS=codex-cli",
      `ARC_HOOK_ARC_COMMAND=${shellQuote(arcCommand)}`,
      shellQuote(process.execPath),
      shellQuote(hookPath),
      "< /dev/null",
    ].join(" ");

    try {
      const sequence = await runArcAnchoredSequence([
        ["errand", "open", "seed-probe", "--intent", "prove PreCompact locus recovery", "--json"],
        { command: ["bash", "-lc", hookCommand] },
        ["recover", "audit", "--json"],
      ], repository, { timeout: 60_000, anchorShellPath: harness.executable });

      expect(sequence.exitCode, sequence.stderr || sequence.stdout).toBe(0);
      const opened = sequence.results[0] as Record<string, unknown>;
      expect(opened).toMatchObject({
        outcome: "applied",
        operation: "errand-open",
        allocation: { checkoutPath: repository },
        subject: { kind: "errand", key: "seed-probe", claimId: expect.any(String) },
      });
      expect(opened).not.toHaveProperty("recordId");
      expect(opened).not.toHaveProperty("leaseId");
      expect(opened).not.toHaveProperty("activeLocusPath");
      expect(opened).not.toHaveProperty("sessionHomePath");
      expect(sequence.results[1]).toMatchObject({
        mode: "recover-audit",
        verdict: {
          status: "ready",
          locusHint: {
            expected: {
              checkoutPath: repository,
              parentCheckoutPath: null,
            },
            actual: {
              checkoutPath: repository,
              parentCheckoutPath: null,
            },
            match: true,
          },
        },
      });

      const seed = JSON.parse(await readFile(
        join(repository, ".arc", "user", "test-user", ".internal", "compaction-seed.json"),
        "utf8",
      )) as Record<string, unknown>;
      expect(seed).toMatchObject({
        locus: {
          checkoutPath: repository,
          parentCheckoutPath: null,
        },
      });
      expect(seed).not.toHaveProperty("locusAbsence");
      expect(JSON.stringify(seed.locus)).not.toMatch(/recordId|leaseId|sessionHomePath/u);
    } finally {
      await removeGitBackedDir(remote);
      await removeGitBackedDir(harness.directory);
    }
  });

  it.runIf(process.platform === "linux")(
    "recovers a spawned transient when Codex keeps the hook anchored to primary",
    async () => {
      const remote = await createBareRemote(repository);
      const harness = await createCodexHarness();
      const transcriptPath = join(repository, "codex-transcript.jsonl");
      const hookInputPath = join(repository, "precompact-hook-input.json");
      const sessionId = "019f2f00-aaaa-7000-8000-000000000001";
      let spawnedPath: string | null = null;
      const hookPath = join(
        repository,
        ".arc",
        "system",
        ".internal",
        "harness-hooks",
        "common",
        "pre-compact-seed.mjs",
      );
      const arcCommand = `${process.execPath} ${CLI_PATH}`;
      const hookCommand = [
        "ARC_HOOK_HARNESS=codex-cli",
        `ARC_HOOK_ARC_COMMAND=${shellQuote(arcCommand)}`,
        shellQuote(process.execPath),
        shellQuote(hookPath),
        `< ${shellQuote(hookInputPath)}`,
      ].join(" ");
      const transcriptCommand = [
        process.execPath,
        "--input-type=module",
        "-e",
        [
          "import { writeFileSync } from 'node:fs';",
          "import { pathToFileURL } from 'node:url';",
          "const event = { type: 'event_msg', payload: { type: 'item_completed', item: {",
          "  type: 'CommandExecution', cwd: pathToFileURL(process.cwd()).href,",
          "} } };",
          "writeFileSync(process.argv[1], `${JSON.stringify(event)}\\n`);",
        ].join("\n"),
        transcriptPath,
      ];

      try {
        await git(repository, ["switch", "-c", "feat/recovery-parent"]);
        await mkdir(join(repository, ".arc", "active"), { recursive: true });
        await writeFile(
          join(repository, ".arc", "active", "meta-recovery-parent.md"),
          renderMetaFile("recovery-parent", {
            state: "Active",
            owner: "test-user",
            branch: "feat/recovery-parent",
            workClass: "Light",
          }),
        );
        await writeFile(hookInputPath, `${JSON.stringify({
          hook_event_name: "PreCompact",
          session_id: sessionId,
          transcript_path: transcriptPath,
        })}\n`);
        await git(repository, ["add", "-A"]);
        await git(repository, ["commit", "--no-verify", "-m", "establish parent locus"]);

        const sequence = await runArcAnchoredSequence([
          ["errand", "open", "spawned-seed-probe", "--intent", "prove linked recovery", "--json"],
          { command: transcriptCommand, cwdFromPreviousJson: "allocation.checkoutPath" },
          { command: ["bash", "-lc", hookCommand], cwd: repository },
        ], repository, {
          timeout: 90_000,
          anchorShellPath: harness.executable,
        });

        expect(sequence.exitCode, sequence.stderr || sequence.stdout).toBe(0);
        const opened = sequence.results[0] as {
          allocation?: { checkoutPath?: unknown };
        };
        expect(opened, JSON.stringify(opened)).toMatchObject({
          operation: "errand-open",
          allocation: {
            kind: "spawned",
            checkoutPath: expect.any(String),
          },
          parentCheckoutPath: repository,
        });
        spawnedPath = typeof opened.allocation?.checkoutPath === "string"
          ? opened.allocation.checkoutPath
          : null;
        if (spawnedPath === null) throw new Error("Errand open returned no spawned checkout path.");
        const seedPath = join(
          spawnedPath,
          ".arc",
          "user",
          "test-user",
          ".internal",
          "compaction-seed.json",
        );
        const markerPath = join(
          repository,
          ".arc",
          "user",
          "test-user",
          ".internal",
          `codex-compaction-recovery-pending-${sessionId}.json`,
        );
        const fallbackPath = join(
          repository,
          ".arc",
          "user",
          ".internal",
          `codex-compaction-recovery-pending-${sessionId}.json`,
        );
        const markerText = await readFile(markerPath, "utf8").catch(async () => {
          const fallback = await readFile(fallbackPath, "utf8").catch(() => "missing fallback marker");
          throw new Error(`Recovery marker missing; fallback: ${fallback}`);
        });
        const marker = JSON.parse(markerText) as Record<string, unknown>;
        expect(marker).toMatchObject({ seedPath });

        const audit = await runArc([
          "recover",
          "audit",
          "--seed-path",
          seedPath,
          "--json",
        ], repository, { timeout: 90_000 });
        expect(audit.exitCode, audit.stderr || audit.stdout).toBe(0);
        const report = JSON.parse(audit.stdout) as Record<string, unknown>;

        expect(report).toMatchObject({
          mode: "recover-audit",
          seedPath,
          recover: {
            recoveryFrame: {
              ok: true,
              value: {
                kind: "resolved",
                subject: { kind: "errand", key: "spawned-seed-probe" },
                checkoutPath: spawnedPath,
                parentCheckoutPath: repository,
                workflow: "run-errand",
              },
            },
          },
          verdict: {
            status: "ready",
            locusHint: {
              expected: { checkoutPath: spawnedPath, parentCheckoutPath: repository },
              actual: { checkoutPath: spawnedPath, parentCheckoutPath: repository },
              match: true,
            },
          },
        });

        const seed = JSON.parse(await readFile(
          seedPath,
          "utf8",
        )) as Record<string, unknown>;
        expect(seed).toMatchObject({
          repoRoot: spawnedPath,
          locus: { checkoutPath: spawnedPath, parentCheckoutPath: repository },
        });
      } finally {
        if (spawnedPath !== null) {
          await git(repository, ["worktree", "remove", "--force", spawnedPath]).catch(() => undefined);
          await removeGitBackedDir(spawnedPath);
        }
        await removeGitBackedDir(remote);
        await removeGitBackedDir(harness.directory);
      }
    },
  );

  it.runIf(process.platform === "linux")(
    "keeps unresolved work-unit recovery anchored to the marker-owned origin",
    async () => {
      const remote = await createBareRemote(repository);
      const harness = await createCodexHarness();
      const worktreeParent = await mkdtemp(join(tmpdir(), "arc-precompact-work-unit-transfer-"));
      const original = join(worktreeParent, "original");
      const replacement = join(worktreeParent, "replacement");
      const transcriptPath = join(original, "codex-transcript.jsonl");
      const hookInputPath = join(original, "precompact-hook-input.json");
      const sessionId = "019f2f00-aaaa-7000-8000-000000000002";
      const hookPath = join(
        original,
        ".arc",
        "system",
        ".internal",
        "harness-hooks",
        "common",
        "pre-compact-seed.mjs",
      );
      const arcCommand = `${process.execPath} ${CLI_PATH}`;
      const hookCommand = [
        "ARC_HOOK_HARNESS=codex-cli",
        `ARC_HOOK_ARC_COMMAND=${shellQuote(arcCommand)}`,
        shellQuote(process.execPath),
        shellQuote(hookPath),
        `< ${shellQuote(hookInputPath)}`,
      ].join(" ");

      try {
        await git(repository, ["switch", "-c", "plan/recovery-transfer"]);
        await mkdir(join(repository, ".arc", "active"), { recursive: true });
        await writeFile(
          join(repository, ".arc", "active", "meta-recovery-transfer.md"),
          renderMetaFile("recovery-transfer", {
            state: "Planning",
            owner: "test-user",
            branch: "plan/recovery-transfer",
            workClass: "Light",
            currentWorkflow: "draft-design",
          }),
        );
        await git(repository, ["add", "-A"]);
        await git(repository, ["commit", "--no-verify", "-m", "establish work-unit locus"]);
        await git(repository, ["switch", "main"]);
        await git(repository, ["worktree", "add", original, "plan/recovery-transfer"]);

        const markerDir = join(original, ".arc", "system", ".internal");
        await mkdir(markerDir, { recursive: true });
        await writeFile(join(markerDir, "worktree-marker.json"), `${JSON.stringify({
          spawnedByArc: true,
          wuName: "recovery-transfer",
          createdFor: { kind: "work-unit", name: "recovery-transfer" },
          spawningIdentity: "test-user",
          createdAt: "2026-08-29T00:00:00.000Z",
        })}\n`);

        await git(original, ["switch", "--detach"]);
        await git(repository, ["worktree", "add", replacement, "plan/recovery-transfer"]);
        await writeFile(transcriptPath, `${JSON.stringify({
          type: "event_msg",
          payload: {
            type: "item_completed",
            item: {
              type: "CommandExecution",
              cwd: new URL(`file://${replacement}`).href,
            },
          },
        })}\n`);
        await writeFile(hookInputPath, `${JSON.stringify({
          hook_event_name: "PreCompact",
          session_id: sessionId,
          transcript_path: transcriptPath,
        })}\n`);

        const locusResult = await runArc(["locus", "--json"], original);
        expect(locusResult.exitCode, locusResult.stderr || locusResult.stdout).toBe(0);
        expect(JSON.parse(locusResult.stdout)).toMatchObject({
          mode: "locus",
          ok: true,
          roster: expect.arrayContaining([
            expect.objectContaining({
              kind: "unresolved-checkout",
              checkout: expect.objectContaining({ path: original }),
              subject: expect.objectContaining({ kind: "work-unit", key: "recovery-transfer" }),
            }),
            expect.objectContaining({
              kind: "unresolved-checkout",
              checkout: expect.objectContaining({ path: replacement }),
              subject: expect.objectContaining({ kind: "work-unit", key: "recovery-transfer" }),
              context: null,
              diagnostics: expect.arrayContaining([
                expect.objectContaining({ code: "work-unit-locus-conflict" }),
              ]),
            }),
          ]),
          entering: {
            kind: "selected",
            row: {
              kind: "unresolved-checkout",
              checkout: { path: original },
            },
          },
        });

        await execFileAsync("bash", ["-lc", hookCommand], { cwd: original, timeout: 60_000 });

        const originalSeedPath = join(
          original,
          ".arc",
          "user",
          "test-user",
          ".internal",
          "compaction-seed.json",
        );
        const markerPath = join(
          repository,
          ".arc",
          "user",
          "test-user",
          ".internal",
          `codex-compaction-recovery-pending-${sessionId}.json`,
        );
        const replacementSeedPath = join(
          replacement,
          ".arc",
          "user",
          "test-user",
          ".internal",
          "compaction-seed.json",
        );
        const marker = JSON.parse(await readFile(markerPath, "utf8")) as Record<string, unknown>;
        expect(marker).toMatchObject({
          fallback: false,
          seedPath: originalSeedPath,
        });

        const seed = JSON.parse(await readFile(originalSeedPath, "utf8")) as Record<string, unknown>;
        expect(seed).toMatchObject({
          repoRoot: original,
          activeWorkUnit: null,
          metaPath: null,
          sessionType: null,
          currentWorkflow: null,
          taskCursor: null,
          locus: { checkoutPath: original, parentCheckoutPath: null },
        });

        const audit = await runArc([
          "recover",
          "audit",
          "--seed-path",
          originalSeedPath,
          "--json",
        ], repository, { timeout: 90_000 });
        expect(audit.exitCode, audit.stderr || audit.stdout).toBe(0);
        expect(JSON.parse(audit.stdout)).toMatchObject({
          mode: "recover-audit",
          seedPath: originalSeedPath,
          verdict: {
            status: "stop",
            locusHint: {
              expected: { checkoutPath: original, parentCheckoutPath: null },
              actual: { checkoutPath: original, parentCheckoutPath: null },
              match: false,
            },
          },
        });
        await expect(readFile(replacementSeedPath, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
      } finally {
        await git(repository, ["worktree", "remove", "--force", replacement]).catch(() => undefined);
        await git(repository, ["worktree", "remove", "--force", original]).catch(() => undefined);
        await removeGitBackedDir(worktreeParent);
        await removeGitBackedDir(harness.directory);
        await removeGitBackedDir(remote);
      }
    },
  );
});
