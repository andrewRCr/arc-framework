/** Completed subject fixtures retain actual Git merge topology and production record formats. */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { onTestFinished, expect } from "vitest";
import { createTempRepo, cleanupTempDir, makeGitExec } from "./integration.js";
import { runArc } from "../e2e/helpers.js";
import { createLifecycleHarness } from "./store/lifecycle-harness.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";
import { ArchiveQuarterSchema } from "../../src/lib/kernel/index.js";
import { ensureWorktreeMarkerIgnored, nodeWorktreeMarkerIgnoreFs, writeWorktreeMarker } from "../../src/lib/git/worktree-marker.js";

export async function completedSubjectFixture(cadence: "manual" | "with-integration") {
  const cwd = await createTempRepo();
  onTestFinished(() => cleanupTempDir(cwd));
  expect((await runArc(["init", "--yes", "--name", "test-project"], cwd)).exitCode).toBe(0);
  const exec = makeGitExec(cwd);
  await mkdir(join(cwd, ".git", "matrix-hooks"));
  await exec("git", ["config", "core.hooksPath", join(cwd, ".git", "matrix-hooks")]);
  await exec("git", ["config", "arc.identity", "test-user"]);
  await exec("git", ["branch", "-M", "main"]);
  const config = join(cwd, ".arc", "system", "arc-config.yml");
  const text = await readFile(config, "utf8");
  await writeFile(config, text.replace(/^branch.protection:.*$/mu, "branch.protection: full")
    .replace(/^session.remote_sync:.*$/mu, "session.remote_sync: disabled")
    .replace(/^archive.cadence:.*$/mu, `archive.cadence: ${cadence}`));
  await exec("git", ["add", "."]);
  await exec("git", ["commit", "-m", "Project fixture"]);
  await exec("git", ["checkout", "-b", "feat/completed-unit"]);
  for (const step of [1, 2]) {
    await writeFile(join(cwd, "work.txt"), `step ${step}\n`);
    await exec("git", ["add", "work.txt"]);
    await exec("git", ["commit", "-m", `Work step ${step}`]);
  }
  await ensureWorktreeMarkerIgnored(cwd, exec, nodeWorktreeMarkerIgnoreFs);
  await writeWorktreeMarker(cwd, { spawnedByArc: false, createdFor: { kind: "work-unit", name: "completed-unit" }, spawningIdentity: "test-user", createdAt: "2026-10-16T12:00:00.000Z" });
  const h = createLifecycleHarness();
  h.store.environment.identity = "test-user";
  const repository = randomUUID();
  await h.seed(recordReferences["project-registry/identity"](OwnerIdentitySchema.parse({ type: "project", name: "test-project", uid: repository })), "{}");
  const record = await h.seedMeta("completed-unit", { state: "Shipped", currentWorkflow: null }, { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q4") },
    { branches: [{ repository, ref: "feat/completed-unit", linkedAs: "created", excluded: [] }] });
  return { ...h, cwd, exec, repository, record, head: (await exec("git", ["rev-parse", "HEAD"])).stdout.trim() };
}

export type CompletedSubjectScenario = "archive-restart" | "arc-landing" | "merge-commit" | "multi-commit-squash" | "cut" | "abandon" | "partial-teardown" | "missing" | "ambiguous";
