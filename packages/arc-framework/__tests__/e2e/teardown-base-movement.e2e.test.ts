/**
 * Post-landing cleanup observed across a base that moves after the work unit's own archival.
 *
 * `arc teardown` proves the retiring branch landed against a freshly fetched base rather than the invoking
 * checkout's, so the base is read once more after the merge that retired the work unit; under full branch
 * protection the in-repo store reads the work unit's lifecycle from that base too. That read is the boundary these
 * probes move a base across; the fixture exists to reach it, which takes a landed merge, an archival, and a remote
 * that actually holds the merge.
 */

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { IN_REPO_STORE_OVERRIDE } from "../../src/lib/store/selection.js";
import { cleanupTempDir, createTempRepo, git, runArc, type RunResult } from "./store-default.js";
import { advanceBase, movementPaths, writeUnavailableBaseReadShim } from "../helpers/base-advance.js";
import { useInRepoStoreForEach } from "../helpers/in-repo-store-override.js";
import { seedProjectIdentity } from "../helpers/store/seed-store.js";
import { seedWorkUnit } from "../helpers/store/seed-work-unit.js";

const execFileAsync = promisify(execFile);

const WORK_UNIT = "example";
const HEAD_REF = `feat/${WORK_UNIT}`;
const ARCHIVE_PATH = `.arc/completed/2026-q3/01_${WORK_UNIT}/meta-${WORK_UNIT}.md`;

const cleanups: string[] = [];

afterEach(async () => {
  while (cleanups.length > 0) {
    const path = cleanups.pop();
    if (path !== undefined) await cleanupTempDir(path);
  }
});

const ARCHIVED_META = [
  `# Metadata: ${WORK_UNIT}`,
  "",
  "| **State** | **Owner**   | **Branch** | **Class** | **Priority** |",
  "| --------- | ----------- | ---------- | --------- | ------------ |",
  "| `Shipped` | `test-user` | `[none]`   | `Light`   | `P2`         |",
  "",
  "---",
  "",
].join("\n");

/**
 * A work unit whose merge and archival have both landed, standing at its cleanup boundary.
 *
 * The store holds the archival as the work unit's completed record. The in-repo store reads membership from the
 * fetched base under full protection, which decides the order the fixture builds in there: the archival commit
 * must reach the remote before the boundary can see it. A plain path remote is enough — cleanup talks to Git and
 * to nothing else.
 *
 * @returns The checkout standing at the boundary, on its base branch with the retired branch still present.
 */
async function shippedWithLiveBase(): Promise<string> {
  const repository = await createTempRepo("arc-teardown-movement-");
  cleanups.push(repository);
  await mkdir(join(repository, ".arc", "system"), { recursive: true });
  await writeFile(
    join(repository, ".arc", "system", "arc-config.yml"),
    "branch.base: main\nbranch.protection: full\n",
  );
  await writeFile(join(repository, "README.md"), "# Fixture\n");
  await git(repository, ["add", "-A"]);
  await git(repository, ["commit", "-m", "base"]);

  const remote = join(repository, ".arc-fixture", "origin.git");
  await mkdir(join(repository, ".arc-fixture"), { recursive: true });
  await writeFile(join(repository, ".git", "info", "exclude"), ".arc-fixture/\n", { flag: "a" });
  await execFileAsync("git", ["init", "--bare", "--initial-branch=main", remote]);
  await git(repository, ["remote", "add", "origin", remote]);
  await git(repository, ["push", "origin", "main"]);

  await git(repository, ["checkout", "-b", HEAD_REF]);
  await mkdir(join(repository, "src"), { recursive: true });
  await writeFile(join(repository, "src", `${WORK_UNIT}.ts`), "export const example = true;\n");
  await git(repository, ["add", "-A"]);
  await git(repository, ["commit", "-m", "implementation"]);
  await git(repository, ["push", "-u", "origin", HEAD_REF]);

  await git(repository, ["checkout", "main"]);
  await git(repository, ["merge", "--no-ff", HEAD_REF, "-m", `merge: ${WORK_UNIT}`]);
  await git(repository, ["push", "origin", "main"]);

  if (process.env[IN_REPO_STORE_OVERRIDE] === undefined) {
    // The store holds the shipped work unit completed, linked to its branch, as archival leaves it, where `arc init`
    // never ran; no archival commit reaches the base.
    await seedProjectIdentity(repository, SlugSchema.parse("test-user"));
    await seedWorkUnit(repository, WORK_UNIT, {
      identity: "test-user",
      meta: { state: "Shipped", owner: "test-user", branch: HEAD_REF, currentWorkflow: null, completed: "2026-07-14" },
      placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q3") },
      branch: HEAD_REF,
    });
    return repository;
  }
  await mkdir(join(repository, ".arc", "completed", "2026-q3", `01_${WORK_UNIT}`), { recursive: true });
  await writeFile(join(repository, ARCHIVE_PATH), ARCHIVED_META);
  await git(repository, ["add", "-A"]);
  await git(repository, ["commit", "-m", `archive ${WORK_UNIT}`]);
  await git(repository, ["push", "origin", "main"]);

  return repository;
}

function runTeardown(repository: string, env?: Record<string, string>): Promise<RunResult> {
  return runArc(["teardown", WORK_UNIT], repository, env === undefined ? {} : { env });
}

async function branchPresent(repository: string): Promise<boolean> {
  return (await git(repository, ["branch", "--list", HEAD_REF])) !== "";
}

/** The live head on the remote, which a clean reap deletes once the work is proven landed in the base. */
async function remoteHeadPresent(repository: string): Promise<boolean> {
  return (await git(repository, ["ls-remote", "--heads", "origin", HEAD_REF])) !== "";
}

describe("cleanup over a base advanced after the archival landed", () => {
  it("reaps the branch after an advance sharing no path with it", async () => {
    const repository = await shippedWithLiveBase();
    // What the advance touched never reaches a decision here: the gate reads this work unit's retirement from its
    // record and the branch's containment in the fetched base, so only the base's identity changes under it.
    await advanceBase({ cwd: repository, paths: movementPaths("disjoint", WORK_UNIT).base });

    const result = await runTeardown(repository);

    expect(result.exitCode, result.stdout + result.stderr).toBe(0);
    expect(result.stdout + result.stderr).toMatch(/Torn down/iu);
    expect(await branchPresent(repository)).toBe(false);
    expect(await remoteHeadPresent(repository)).toBe(false);
  });
});

describe("cleanup over the in-repo store when the base read goes unavailable under it", () => {
  // Refusing teardown when lifecycle authority cannot be read from the fetched base is the in-repo store's: the store
  // reads the work unit's retirement from its record, and proves landing against the base the clone already holds
  // when the refresh fails.
  useInRepoStoreForEach();

  it("refuses with the branch untouched, and reaps once the read is restored", async () => {
    const repository = await shippedWithLiveBase();
    const shimDir = await mkdtemp(join(tmpdir(), "arc-teardown-shim-"));
    cleanups.push(shimDir);
    const shim = await writeUnavailableBaseReadShim({ dir: shimDir });

    const refused = await runTeardown(repository, { ...shim.env, [shim.armVariable]: "1" });

    expect(refused.exitCode).toBe(1);
    expect(refused.stdout + refused.stderr).toMatch(/lifecycle authority ref/iu);
    expect(refused.stdout + refused.stderr).toMatch(/retry the same teardown command/iu);
    expect(await branchPresent(repository)).toBe(true);
    // The refusal names the same invocation as the retry once authority access is restored.
    const retried = await runTeardown(repository);
    expect(retried.exitCode, retried.stdout + retried.stderr).toBe(0);
    expect(await branchPresent(repository)).toBe(false);
  });
});
