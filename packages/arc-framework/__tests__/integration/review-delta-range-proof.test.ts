/** Real Git history distinguishes linear review ranges from merges. */
import { afterEach, expect, it } from "vitest";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createTempRepo, cleanupTempDir, makeGitExec } from "../helpers/integration.js";
import { createReviewTarget } from "../../src/scripts/review-gate/core/gate-contract-v2.js";
import { proveReviewDeltaRange } from "../../src/scripts/review-gate/policy/review-delta-range-proof.js";

let cwd: string | undefined;
afterEach(async () => { if (cwd !== undefined) await cleanupTempDir(cwd); cwd = undefined; });

it.each(["linear", "merge"] as const)("proves only a linear descendant in real Git: %s", async movement => {
  cwd = await createTempRepo("arc-review-range-");
  const exec = makeGitExec(cwd);
  const git = async (...args: string[]) => (await exec("git", args)).stdout.trim();
  await git("commit", "--allow-empty", "-m", "base");
  const diffBaseSha = await git("rev-parse", "HEAD");
  const diffBaseTree = await git("rev-parse", "HEAD^{tree}");
  await git("switch", "-c", "work");
  await writeFile(join(cwd, "main.ts"), "export const value = 1;\n");
  await git("add", "main.ts");
  await git("commit", "-m", "reviewed change");
  const predecessorHead = await git("rev-parse", "HEAD");
  const predecessor = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
    repositoryId: "repo-range", baseRef: "main", diffBaseSha, diffBaseTree,
    headSha: predecessorHead, headTree: await git("rev-parse", "HEAD^{tree}") });
  await writeFile(join(cwd, "main.ts"), "export const value = 2;\n");
  await git("add", "main.ts");
  await git("commit", "-m", "plain successor");
  if (movement === "merge") {
    await git("switch", "-c", "side", predecessorHead);
    await writeFile(join(cwd, "side.ts"), "export const side = true;\n");
    await git("add", "side.ts");
    await git("commit", "-m", "side contribution");
    await git("switch", "work");
    await git("merge", "--no-ff", "side", "-m", "merge contribution");
  }
  const current = createReviewTarget({ schemaVersion: 2, semanticsVersion: "review-gate/v2", kind: "change-set",
    repositoryId: "repo-range", baseRef: "main", diffBaseSha, diffBaseTree,
    headSha: await git("rev-parse", "HEAD"), headTree: await git("rev-parse", "HEAD^{tree}") });
  await expect(proveReviewDeltaRange({ predecessor, current, convergence: "converged", cwd, exec }))
    .resolves.toBe(movement === "linear");
}, 30_000);
