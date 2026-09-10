import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { workUnitPathTreatmentContext } from "../../src/lib/base-drift/current-adapters.js";
import {
  closeDeliveryEligibility,
  prepareDeliveryEligibility,
} from "../../src/lib/delivery/eligibility.js";
import {
  compareGitNormalizedDeliveryTrees,
  inspectDeliveryCandidateCheckout,
  observeDeliveryEligibilityRef,
} from "../../src/lib/delivery/git-eligibility.js";
import { revalidateDeliveryLifecycleContribution } from
  "../../src/lib/delivery/git-lifecycle-contribution.js";
import { deriveDeliveryMaterialization } from "../../src/lib/delivery/materialization.js";
import { analyzeRevisionOverlap } from "../../src/lib/git/base-overlap.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { readAncestry } from "../../src/lib/work-unit/git-decomposition-object-readers.js";
import { deliveryStackPlanFixture } from "../fixtures/delivery-plan.js";
import { createTempRepoCore, removeGitBackedDir } from "../helpers/temp-repo.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => removeGitBackedDir(root)));
});

describe("disjoint delivery eligibility", () => {
  it("lands a base-only readiness regeneration without its custom merge driver", async () => {
    const repository = await createTempRepoCore({ prefix: "arc-delivery-disjoint-" });
    roots.push(repository);
    const git = async (args: readonly string[]): Promise<string> => (
      await execFileAsync("git", [...args], { cwd: repository })
    ).stdout.trim();
    const exec: GitExec = async (command, args) => {
      const result = await execFileAsync(command, args, { cwd: repository });
      return { stdout: result.stdout, stderr: result.stderr };
    };

    await mkdir(join(repository, ".arc", "backlog"), { recursive: true });
    await writeFile(join(repository, ".gitattributes"), ".arc/backlog/ROADMAP.md merge=arc-roadmap\n", "utf8");
    await writeFile(join(repository, ".arc", "backlog", "ROADMAP.md"), "base readiness\n", "utf8");
    await git(["add", ".gitattributes", ".arc/backlog/ROADMAP.md"]);
    await git(["commit", "-m", "base readiness"]);
    const chainBase = await git(["rev-parse", "HEAD"]);

    await git(["switch", "-c", "candidate/first"]);
    await writeFile(join(repository, "first.txt"), "reviewed first member\n", "utf8");
    await git(["add", "first.txt"]);
    await git(["commit", "-m", "first member"]);
    const firstHead = await git(["rev-parse", "HEAD"]);
    await git(["switch", "-c", "candidate/top"]);
    await writeFile(join(repository, "top.txt"), "reviewed terminal\n", "utf8");
    await git(["add", "top.txt"]);
    await git(["commit", "-m", "terminal member"]);

    await git(["switch", "main"]);
    await writeFile(join(repository, ".arc", "backlog", "ROADMAP.md"), "advanced readiness\n", "utf8");
    await git(["add", ".arc/backlog/ROADMAP.md"]);
    await git(["commit", "-m", "regenerate readiness"]);
    const observedTip = await git(["rev-parse", "HEAD"]);
    await git(["config", "merge.arc-roadmap.driver", "false"]);

    const plan = deliveryStackPlanFixture();
    const candidates = ["candidate/first", "candidate/top"].map((ref, index) => ({
      deliverableId: plan.members[index]!.deliverableId,
      ref: `refs/heads/${ref}`,
    }));
    const dependencies = {
      observeRef: (ref: string) => observeDeliveryEligibilityRef(exec, ref),
      readAncestry: (ancestor: string, descendant: string) => readAncestry(exec, ancestor, descendant),
      readOverlap: (input: { leftRevision: string; rightRevision: string; workUnitId: string }) => (
        analyzeRevisionOverlap({
          exec,
          leftRevision: input.leftRevision,
          rightRevision: input.rightRevision,
          treatmentContext: workUnitPathTreatmentContext(input.workUnitId),
        })
      ),
      revalidateLifecycleContribution: (input: {
        protectedBaseRef: string;
        chainBaseRef: string;
        candidateRef: string;
        paths: readonly string[];
        regenerablePaths: readonly string[];
      }) => revalidateDeliveryLifecycleContribution({ exec, ...input }),
      compareNormalizedCompleteness: async (input: {
        protectedBase: { ref: string; head: string; tree: string };
        chainBase: { head: string; tree: string };
        top: { ref: string; head: string; tree: string };
        finalCandidate: { deliverableId: string; ref: string; head: string; tree: string };
        lifecyclePaths: readonly string[];
        regenerablePaths: readonly string[];
      }) => {
        const result = await compareGitNormalizedDeliveryTrees({
          exec,
          protectedBaseTree: input.protectedBase.tree,
          chainBaseTree: input.chainBase.tree,
          topTree: input.top.tree,
          finalCandidateTree: input.finalCandidate.tree,
          lifecyclePaths: input.lifecyclePaths,
          regenerablePaths: input.regenerablePaths,
        });
        return result.status === "unavailable"
          ? { status: "refused" as const, reason: "unavailable" as const }
          : result.status === "match"
            ? result
            : { status: "refused" as const, reason: "mismatched" as const };
      },
      readCurrentPlan: async () => plan,
      resolveMember: async () => ({ status: "ok" as const, value: null }),
      inspectCheckout: (path: string) => inspectDeliveryCandidateCheckout(exec, path),
    };

    const prepared = await prepareDeliveryEligibility({
      plan,
      protectedBaseRef: "refs/heads/main",
      topRef: "refs/heads/candidate/top",
      candidates,
      lifecyclePaths: [".arc/backlog/ROADMAP.md"],
    }, dependencies);
    expect(prepared.status).toBe("prepared");
    if (prepared.status !== "prepared") return;
    expect(prepared.snapshot).toMatchObject({
      protectedBase: { head: observedTip },
      chainBase: { head: chainBase },
      predecessorRelation: { kind: "disjoint-ahead", observedTip, chainBase },
    });
    await expect(closeDeliveryEligibility(prepared.snapshot, dependencies))
      .resolves.toMatchObject({ status: "eligible" });

    const materialization = deriveDeliveryMaterialization(plan, prepared.snapshot);
    expect(materialization.status).toBe("derived");
    if (materialization.status !== "derived") return;
    expect(materialization.value.target.head).toBe(chainBase);
    expect(materialization.value.members[0]!.coordinates.base).toBe(chainBase);

    await git(["merge", "--no-ff", "--no-edit", "refs/heads/candidate/first"]);
    expect(await readFile(join(repository, ".arc", "backlog", "ROADMAP.md"), "utf8"))
      .toBe("advanced readiness\n");
    expect(await readFile(join(repository, "first.txt"), "utf8")).toBe("reviewed first member\n");
    expect(await git(["rev-parse", "refs/heads/candidate/first"])).toBe(firstHead);
  });
});
