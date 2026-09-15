/**
 * What a session reports after a write that is not a base advance invalidates the facts it orients from.
 *
 * The write here is an authorized merge landing a work unit's active record on the base branch. That is an
 * ordinary integration step, and it leaves the checkout holding a record whose branch is no longer the branch
 * the checkout is on — so the facts a session opens from stop resolving, while the repository itself is exactly
 * where the ceremony meant to put it.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { handleStatus } from "../../src/handlers/status.js";
import { resolveProcessInteractionContext } from "../../src/lib/command-input/interaction-context.js";
import { runHandlerAt } from "../helpers/handler.js";
import { expectPinnedObservation } from "../helpers/pinned-observation.js";
import {
  cleanupTempDir,
  DEFAULT_PROMPTS,
  execFileAsync,
  initInTempRepo,
} from "../helpers/integration.js";

const WORK_UNIT = "example";
const HEAD_REF = `feat/${WORK_UNIT}`;

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => cleanupTempDir(root)));
});

async function git(cwd: string, args: readonly string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", ...args], { cwd });
  return stdout.trim();
}

/** The merge is expected to conflict in one case, which Git reports by exiting non-zero. */
async function mergeAllowingConflict(cwd: string, ref: string): Promise<void> {
  try {
    await git(cwd, ["merge", ref]);
  } catch {
    // A conflicted merge leaves the unmerged index in place, which is the state under observation.
  }
}

function metaDocument(): string {
  return [
    `# Metadata: ${WORK_UNIT}`,
    "",
    "| **State** | **Owner**   | **Branch**     | **Class** | **Priority** |",
    "| --------- | ----------- | -------------- | --------- | ------------ |",
    `| \`Active\`  | \`test-user\` | \`${HEAD_REF}\` | \`Light\`   | \`P2\`         |`,
    "",
    "- **Cohort:** [none]",
    "- **Depends On:** [none]",
    "",
    "- **Origin:** [internal]",
    "- **Design:** [none]",
    `- **Task List:** \`tasks-${WORK_UNIT}.md\``,
    "- **Review Rubric:** [none]",
    "",
    "- **Current Workflow:** [none]",
    "- **Last Completed:** none",
    "- **Next Task:** Task 1.1",
    "- **Blockers:** [none]",
    "",
    "- **Next Action:** continue",
    "",
    "- **PR URL:** [none]",
    "- **Completed:** [none]",
    "",
    "---",
    "",
  ].join("\n");
}

/** An ARC project whose work unit is committed on its own branch, with the base ready to receive it. */
async function projectWithWorkUnitBranch(baseChange: string): Promise<string> {
  const root = await initInTempRepo(DEFAULT_PROMPTS);
  roots.push(root);
  await mkdir(join(root, "src"), { recursive: true });
  await writeFile(join(root, "src", "shared.ts"), "export const shared = 0;\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "init"]);

  await git(root, ["switch", "-c", HEAD_REF]);
  await mkdir(join(root, ".arc", "active"), { recursive: true });
  await writeFile(join(root, ".arc", "active", `meta-${WORK_UNIT}.md`), metaDocument());
  await writeFile(
    join(root, ".arc", "active", `tasks-${WORK_UNIT}.md`),
    "# Task List: Example\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Do the thing**\n",
  );
  await writeFile(join(root, "src", "shared.ts"), "export const shared = 1;\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "work"]);

  // The base moves too, so the merge below is a real one rather than a fast-forward. Whether it
  // touches the same path as the branch is what decides if the merge conflicts.
  await git(root, ["switch", "main"]);
  await writeFile(join(root, baseChange), "export const other = 2;\n");
  await git(root, ["add", "-A"]);
  await git(root, ["commit", "-m", "base change"]);
  return root;
}

function machineContext() {
  return resolveProcessInteractionContext({ noInput: false, machineReadable: true, yes: "absent" });
}

/** Open a session that also writes the recovery seed, and report what the seed write reported. */
async function seedWriteOpening(root: string): Promise<unknown> {
  const opened = await runHandlerAt(root, async () => {
    await handleStatus(
      undefined,
      { sessionInit: true, writeCompactionSeed: true, json: true },
      machineContext(),
    );
  });
  expect(opened.exitCode, opened.stdout + opened.stderr).toBe(0);
  return (JSON.parse(opened.stdout) as { compactionSeedWrite: unknown }).compactionSeedWrite;
}

describe("a session opening after an authorized merge lands a work unit's active record", () => {
  it("writes its recovery seed while the record's branch is the branch in hand", async () => {
    const root = await projectWithWorkUnitBranch("src/other.ts");
    await git(root, ["switch", HEAD_REF]);

    expect(await seedWriteOpening(root)).toMatchObject({ status: "written" });
  });

  it("cannot write its recovery seed once the merge has landed the record on the base", async () => {
    const root = await projectWithWorkUnitBranch("src/other.ts");
    await mergeAllowingConflict(root, HEAD_REF);

    expectPinnedObservation(await seedWriteOpening(root), {
      behavior: "An authorized merge landing a work unit's active record on the base branch is an ordinary "
        + "integration step, so a session opening over the result should still resolve the checkout it is in "
        + "rather than report its own facts unresolved.",
      observed: { status: "failed", reason: "seed-invalid" },
      target: { status: "written" },
    });
  });

  it("reports the same failure whether or not the merge left an unmerged index", async () => {
    const conflicted = await projectWithWorkUnitBranch("src/shared.ts");
    await mergeAllowingConflict(conflicted, HEAD_REF);
    const clean = await projectWithWorkUnitBranch("src/other.ts");
    await mergeAllowingConflict(clean, HEAD_REF);

    // The conflicted merge leaves unmerged paths behind; the clean one leaves nothing at all.
    expect(await git(conflicted, ["diff", "--name-only", "--diff-filter=U"])).toBe("src/shared.ts");
    expect(await git(clean, ["status", "--porcelain"])).toBe("");

    // The message carries each repository's own root, so the comparison is over the typed fields.
    const typed = (write: unknown): unknown => {
      const { status, reason } = write as { status: string; reason?: string };
      return { status, reason };
    };
    expect(typed(await seedWriteOpening(conflicted))).toEqual(typed(await seedWriteOpening(clean)));
  });
});
