/** Recovery coverage for the staged active-to-completed archive seam. */

import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderMetaFile } from "../../src/lib/active/meta-reader.js";
import {
  cleanupTempDir,
  createTempRepo,
  git,
  runArc,
} from "./helpers.js";

interface SessionEnvelope {
  compactionSeedWrite?: { status: string; reason?: string; message?: string };
}

interface RecoveryReport {
  recover: {
    recoveryFrame: {
      ok: boolean;
      value?: {
        kind: string;
        subject: { kind: string; key: string };
        workflow: string | null;
        sessionType: string | null;
      };
    };
    loadSet: {
      ok: boolean;
      value?: { entries: Array<{ path: string; readMode: { kind: string } }> };
    };
  };
  verdict: { status: string; ready: boolean; stopReasons: Array<{ kind: string }> };
}

function closedTaskList(): string {
  return [
    "# Task List: Staged Archive Recovery",
    "",
    "## **Phase 1:** Work",
    "",
    "### `[x]` **1.1 Complete verification**",
    "",
  ].join("\n");
}

describe("staged archive recovery", () => {
  let repository: string;
  let worktreeRoot: string;
  let worktree: string;

  beforeEach(async () => {
    repository = await createTempRepo("arc-staged-archive-recovery-");
    worktreeRoot = await mkdtemp(join(tmpdir(), "arc-staged-archive-recovery-wt-"));
    worktree = join(worktreeRoot, "worktree");

    const initialized = await runArc(["init", "--yes", "--name", "staged-archive-recovery"], repository);
    expect(initialized.exitCode, initialized.stderr || initialized.stdout).toBe(0);
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "--no-verify", "-m", "initialize fixture"]);

    await git(repository, ["switch", "-c", "feat/staged-archive-recovery"]);
    const activeDir = join(repository, ".arc", "active");
    await mkdir(activeDir, { recursive: true });
    await writeFile(
      join(activeDir, "meta-staged-archive-recovery.md"),
      renderMetaFile("staged-archive-recovery", {
        state: "Integrating",
        owner: "test-user",
        branch: "feat/staged-archive-recovery",
        workClass: "Light",
        priority: "P1",
        taskList: "tasks-staged-archive-recovery.md",
        currentWorkflow: "integrate-work-unit",
        lastCompleted: "Task 1.1 — Complete verification",
        nextAction: "Archive the shipped work unit",
      }),
    );
    await writeFile(join(activeDir, "tasks-staged-archive-recovery.md"), closedTaskList());
    await git(repository, ["add", "-A"]);
    await git(repository, ["commit", "--no-verify", "-m", "establish integrating work unit"]);
    await git(repository, ["switch", "main"]);
    await git(repository, ["worktree", "add", worktree, "feat/staged-archive-recovery"]);

    const markerDir = join(worktree, ".arc", "system", ".internal");
    await mkdir(markerDir, { recursive: true });
    await writeFile(join(markerDir, "worktree-marker.json"), `${JSON.stringify({
      spawnedByArc: true,
      wuName: "staged-archive-recovery",
      createdFor: { kind: "work-unit", name: "staged-archive-recovery" },
      spawningIdentity: "test-user",
      createdAt: "2026-09-10T00:00:00.000Z",
    })}\n`);
  });

  afterEach(async () => {
    await cleanupTempDir(repository);
    await cleanupTempDir(worktreeRoot);
  });

  it("writes and audits a compaction seed after archive staging but before its commit", async () => {
    const archived = await runArc([
      "archive",
      "staged-archive-recovery",
      "--pr-url",
      "https://github.com/example/project/pull/42",
      "--completed",
      "2026-09-10",
    ], worktree);
    expect(archived.exitCode, archived.stderr || archived.stdout).toBe(0);

    const stagedPaths = (await git(worktree, ["diff", "--cached", "--name-only"]))
      .split("\n")
      .filter(Boolean);
    expect(stagedPaths).toContain(".arc/active/meta-staged-archive-recovery.md");
    const archivedMeta = stagedPaths.find((path) =>
      /^\.arc\/completed\/[^/]+\/\d+_staged-archive-recovery\/meta-staged-archive-recovery\.md$/u.test(path));
    if (archivedMeta === undefined) {
      throw new Error("archive did not stage the completed work-unit meta");
    }

    const seeded = await runArc(
      ["status", "--session-init", "--write-compaction-seed", "--json"],
      worktree,
    );
    expect(seeded.exitCode, seeded.stderr || seeded.stdout).toBe(0);
    const session = JSON.parse(seeded.stdout) as SessionEnvelope;
    expect(session.compactionSeedWrite).toEqual(expect.objectContaining({ status: "written" }));

    const seed = JSON.parse(await readFile(
      join(worktree, ".arc", "user", "test-user", ".internal", "compaction-seed.json"),
      "utf8",
    )) as { metaPath: string | null; currentWorkflow: string | null; sessionType: string | null };
    expect(seed).toMatchObject({
      metaPath: archivedMeta,
      currentWorkflow: "integrate-work-unit",
      sessionType: "integration",
    });

    const audited = await runArc(["recover", "audit", "--json"], worktree);
    expect(audited.exitCode, audited.stderr || audited.stdout).toBe(0);
    const report = JSON.parse(audited.stdout) as RecoveryReport;
    expect(report.recover.recoveryFrame).toMatchObject({
      ok: true,
      value: {
        kind: "resolved",
        subject: { kind: "work-unit", key: "staged-archive-recovery" },
        workflow: "integrate-work-unit",
        sessionType: "integration",
      },
    });
    expect(report.recover.loadSet.value?.entries).toContainEqual({
      path: archivedMeta,
      readMode: { kind: "full" },
    });
    expect(report.verdict).toMatchObject({ status: "ready", ready: true, stopReasons: [] });
  });
});
