import { execFile } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { RepositoryDeliveryPlanStore } from "../../src/lib/delivery/local-stores.js";
import { DeliveryPlanV1Codec } from "../../src/lib/delivery/plan.js";
import { RepositoryGitCommonStatePublisher } from "../../src/lib/git-common-state.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import {
  createPreBindingDeliveryReviewTargetDependencies,
  createPrePublicationCompositionDependencies,
} from
  "../../src/scripts/review-gate/policy/pre-publication-composition.js";
import { composePreBindingDeliveryReviewTargets } from
  "../../src/scripts/review-gate/policy/pre-publication-delivery-targets.js";
import { deliveryThreeMemberStackPlanFixture } from "../fixtures/delivery-plan.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => removeGitBackedDir(root)));
});

describe("pre-publication delivery target composition", () => {
  it("closes real candidate refs across machine-owned publication-state advances", async () => {
    const root = await createTempRepoCore({ prefix: "arc-prepublication-delivery-targets-" });
    roots.push(root);
    const plan = deliveryThreeMemberStackPlanFixture();
    const git = async (args: readonly string[], cwd = root): Promise<string> => (
      await execFileAsync("git", [...args], { cwd })
    ).stdout.trim();
    const commit = async (path: string, content: string): Promise<string> => {
      await writeFile(join(root, path), content, "utf8");
      await git(["add", path]);
      await git(["commit", "-m", path]);
      return git(["rev-parse", "HEAD"]);
    };

    const base = await commit("base.txt", "base\n");
    await git(["checkout", "-b", `feat/${plan.workUnitId}`]);
    const first = await commit("first.txt", "first\n");
    const second = await commit("second.txt", "second\n");
    const terminalCandidate = await commit("third.txt", "third\n");
    await mkdir(join(root, ".arc", "active"), { recursive: true });
    await mkdir(join(root, ".arc", "system"), { recursive: true });
    await writeFile(join(root, ".arc", "system", "arc-config.yml"), "branch.base: main\n", "utf8");
    await writeFile(join(root, ".arc", "active", `meta-${plan.workUnitId}.md`), [
      `# Metadata: ${plan.workUnitId}`,
      "",
      "- **State:** Active",
      `- **Branch:** feat/${plan.workUnitId}`,
      "",
    ].join("\n"), "utf8");
    await git(["add", ".arc/active"]);
    await git(["commit", "-m", "active work unit"]);
    const candidateDirectory = join(root, ".arc", "system", ".internal", "candidates");
    await mkdir(candidateDirectory, { recursive: true });
    await writeFile(join(candidateDirectory, `${plan.workUnitId}.json`), "candidate review state\n", "utf8");
    await writeFile(
      join(candidateDirectory, `${plan.workUnitId}.boundary.json`),
      "prepublication boundary\n",
      "utf8",
    );
    await git(["add", ".arc/system/.internal/candidates"]);
    await git(["commit", "-m", "record prepublication state"]);
    const top = await git(["rev-parse", "HEAD"]);

    const gitExec: GitExec = async (command, args, options) => {
      const result = await execFileAsync(command, args, { cwd: options?.cwd ?? root });
      return { stdout: result.stdout, stderr: result.stderr };
    };
    const publisher = new RepositoryGitCommonStatePublisher(gitExec, root);
    const plans = new RepositoryDeliveryPlanStore(publisher, DeliveryPlanV1Codec);
    await expect(plans.publishCurrent(plan.planId, plan, null)).resolves.toMatchObject({ status: "ok" });

    const commonDir = await git(["rev-parse", "--git-common-dir"]);
    const candidateHeads = [first, second, terminalCandidate];
    for (const [index, member] of plan.members.entries()) {
      const candidateRef = `refs/arc/delivery-candidates/${plan.planId}/${member.chunkKey}`;
      await git(["update-ref", candidateRef, candidateHeads[index]!]);
      const gatePath = join(root, commonDir, "arc", "delivery-gates", plan.planId, member.chunkKey);
      await mkdir(join(gatePath, ".."), { recursive: true });
      await git(["worktree", "add", "--detach", gatePath, candidateHeads[index]!]);
    }

    const result = await composePreBindingDeliveryReviewTargets({
      workUnitId: plan.workUnitId,
      baseRef: "main",
    }, createPreBindingDeliveryReviewTargetDependencies({ cwd: root, exec: gitExec }));

    expect(result).toMatchObject({
      status: "composed",
      targets: [
        { target: { diffBaseSha: base, headSha: first } },
        { target: { diffBaseSha: first, headSha: second } },
        { target: { diffBaseSha: second, headSha: top } },
      ],
    });
    expect(result).not.toHaveProperty("target");
    await expect(createPrePublicationCompositionDependencies({ cwd: root, exec: gitExec })
      .readDeliveryReviewTargets(plan.workUnitId)).resolves.toEqual(result);
    await expect(stat(join(root, commonDir, "arc", "delivery", "state")))
      .rejects.toMatchObject({ code: "ENOENT" });

    await writeFile(join(candidateDirectory, `${plan.workUnitId}.json`), "published candidate state\n", "utf8");
    await writeFile(
      join(candidateDirectory, `${plan.workUnitId}.boundary.json`),
      "publication-pending boundary\n",
      "utf8",
    );
    await git(["add", ".arc/system/.internal/candidates"]);
    await git(["commit", "-m", "advance publication state"]);
    const publicationTop = await git(["rev-parse", "HEAD"]);

    await expect(composePreBindingDeliveryReviewTargets({
      workUnitId: plan.workUnitId,
      baseRef: "main",
    }, createPreBindingDeliveryReviewTargetDependencies({ cwd: root, exec: gitExec }))).resolves.toMatchObject({
      status: "composed",
      targets: [
        { target: { diffBaseSha: base, headSha: first } },
        { target: { diffBaseSha: first, headSha: second } },
        { target: { diffBaseSha: second, headSha: publicationTop } },
      ],
    });

    await git(["branch", "feat/foreign-top", publicationTop]);
    await writeFile(join(root, ".arc", "active", `meta-${plan.workUnitId}.md`), [
      `# Metadata: ${plan.workUnitId}`,
      "",
      "- **State:** Active",
      "- **Branch:** feat/foreign-top",
      "",
    ].join("\n"), "utf8");
    await git(["add", ".arc/active"]);
    await git(["commit", "-m", "move recorded top"]);

    await expect(composePreBindingDeliveryReviewTargets({
      workUnitId: plan.workUnitId,
      baseRef: "main",
    }, createPreBindingDeliveryReviewTargetDependencies({ cwd: root, exec: gitExec }))).resolves.toEqual({
      status: "refused",
      reason: "evidence-unavailable",
    });
  });
});
