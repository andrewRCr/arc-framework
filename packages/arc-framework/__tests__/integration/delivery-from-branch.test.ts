import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  inspectDeliveryBranch,
  prepareDeliveryFromBranchAuthoring,
  resolveDeliveryFromBranchProjection,
} from "../../src/lib/delivery/from-branch.js";
import { DeliveryAuthoringSlotsV1Schema } from "../../src/lib/delivery/authoring-map.js";
import { createRawGitExec } from "../../src/lib/io-context.js";
import {
  cleanupTempDir,
  createTempRepo,
  execFileAsync,
} from "../helpers/integration.js";

describe("branch-derived delivery facts", () => {
  let repository: string;
  let originalBase: string;
  let firstContribution: string;
  let baseAdvance: string;
  let ambientMerge: string;
  let head: string;

  beforeEach(async () => {
    repository = await createTempRepo("arc-delivery-branch-");
    await commitFile(repository, "shared.txt", "base\n", "base");
    originalBase = await oid(repository, "HEAD");
    await git(repository, ["checkout", "-b", "feature"]);
    await commitFile(repository, "feature-one.txt", "one\n", "first contribution");
    firstContribution = await oid(repository, "HEAD");
    await git(repository, ["checkout", "main"]);
    await writeFile(join(repository, "base-only.txt"), "advance\n");
    await writeFile(join(repository, "ambient-pair.txt"), "ambient\n");
    await git(repository, ["add", "--", "base-only.txt", "ambient-pair.txt"]);
    await git(repository, ["-c", "core.hooksPath=/dev/null", "commit", "-m", "base advance"]);
    baseAdvance = await oid(repository, "HEAD");
    await git(repository, ["checkout", "feature"]);
    await git(repository, [
      "-c", "core.hooksPath=/dev/null", "merge", "--no-ff", "main", "-m", "absorb base",
    ]);
    ambientMerge = await oid(repository, "HEAD");
    await commitFile(repository, "feature-two.txt", "two\n", "second contribution");
    head = await oid(repository, "HEAD");
  });

  afterEach(async () => cleanupTempDir(repository));

  it("finds original divergence and retains an ambient merge as one ordering step", async () => {
    const result = await inspectDeliveryBranch({
      exec: createRawGitExec(repository),
      base: "main",
      head: "HEAD",
    });

    expect(result).toMatchObject({
      status: "inspected",
      base: baseAdvance,
      head,
      originalDivergence: { predecessor: originalBase, commit: firstContribution },
      steps: [
        { commit: firstContribution, predecessor: originalBase, classification: "contribution" },
        { commit: ambientMerge, predecessor: firstContribution, classification: "ambient-base-absorb" },
        { commit: head, predecessor: ambientMerge, classification: "contribution" },
      ],
      contributionStepIds: [firstContribution, head],
    });
    if (result.status !== "inspected") return;
    expect(result.steps[1]?.changeSet).toMatchObject({ changeSet: "known" });
    expect(result.steps[2]?.cumulativePaths).toEqual(["feature-one.txt", "feature-two.txt"]);
  });

  it("inspects only the selected first-parent range instead of materializing repository history", async () => {
    const exec = createRawGitExec(repository);
    const boundedExec: typeof exec = async (args, options) => {
      if (args[0] === "rev-list" && args.length === 2) {
        throw new Error("unbounded history traversal");
      }
      return exec(args, options);
    };

    await expect(inspectDeliveryBranch({
      exec: boundedExec,
      base: "main",
      head: "HEAD",
    })).resolves.toMatchObject({
      status: "inspected",
      contributionStepIds: [firstContribution, head],
    });
  });

  it("distinguishes an unsupported merge-tree capability from an impure ambient merge", async () => {
    const exec = createRawGitExec(repository);
    const unsupportedExec: typeof exec = async (args, options) => {
      if (args[0] === "merge-tree" && args[1] === "--write-tree") {
        throw new Error("unknown option: --write-tree");
      }
      return exec(args, options);
    };

    await expect(inspectDeliveryBranch({
      exec: unsupportedExec,
      base: "main",
      head: "HEAD",
    })).resolves.toEqual({ status: "refused", reason: "merge-tree-write-tree-unsupported" });
  });

  it("uses an explicit historical base line instead of the moving configured base", async () => {
    const result = await inspectDeliveryBranch({
      exec: createRawGitExec(repository),
      base: originalBase,
      head: "HEAD",
    });

    expect(result).toMatchObject({
      status: "inspected",
      base: originalBase,
      steps: [
        { commit: firstContribution, classification: "contribution" },
        { commit: ambientMerge, classification: "contribution" },
        { commit: head, classification: "contribution" },
      ],
    });
  });

  it("refuses missing and non-ancestor boundaries with typed reasons", async () => {
    await expect(inspectDeliveryBranch({
      exec: createRawGitExec(repository),
      base: "HEAD",
      head: "HEAD",
    })).resolves.toEqual({ status: "refused", reason: "divergence-boundary-missing" });

    await git(repository, ["checkout", "--orphan", "disconnected"]);
    await git(repository, ["rm", "-rf", "."]);
    await commitFile(repository, "disconnected.txt", "outside\n", "disconnected");
    await expect(inspectDeliveryBranch({
      exec: createRawGitExec(repository),
      base: "main",
      head: "HEAD",
    })).resolves.toEqual({ status: "refused", reason: "base-not-ancestor" });
  });

  it("refuses a base absorb whose conflict resolution cannot be proved ambient", async () => {
    await git(repository, ["checkout", "main"]);
    await commitFile(repository, "shared.txt", "main resolution\n", "main conflict side");
    await git(repository, ["checkout", "-b", "conflict-feature", originalBase]);
    await commitFile(repository, "shared.txt", "feature resolution\n", "feature conflict side");
    await expect(execFileAsync("git", ["merge", "--no-ff", "main", "-m", "conflicting absorb"], {
      cwd: repository,
    })).rejects.toThrow();
    await writeFile(join(repository, "shared.txt"), "authored resolution\n");
    await git(repository, ["add", "--", "shared.txt"]);
    await git(repository, ["-c", "core.hooksPath=/dev/null", "commit", "-m", "resolve absorb"]);

    await expect(inspectDeliveryBranch({
      exec: createRawGitExec(repository),
      base: "main",
      head: "HEAD",
    })).resolves.toEqual({ status: "refused", reason: "ambient-purity-unproven" });
  });

  it("preserves arbitrary rename endpoints in cumulative contribution shape", async () => {
    const previousPath = "old\nname.txt";
    const nextPath = "new\nname.txt";
    await commitFile(repository, previousPath, "rename me\n", "add hostile path");
    await git(repository, ["mv", previousPath, nextPath]);
    await git(repository, ["-c", "core.hooksPath=/dev/null", "commit", "-m", "rename hostile path"]);

    const result = await inspectDeliveryBranch({
      exec: createRawGitExec(repository),
      base: "main",
      head: "HEAD",
    });
    expect(result.status).toBe("inspected");
    if (result.status !== "inspected") return;
    expect(result.steps.at(-1)?.changeSet).toMatchObject({
      changeSet: "known",
      changes: [{ status: "renamed", previousPath, path: nextPath }],
    });
    expect(result.steps.at(-1)?.cumulativePaths).toContain(previousPath);
    expect(result.steps.at(-1)?.cumulativePaths).toContain(nextPath);
  });

  it("normalizes attributed ranges upward and preserves at-least-once membership", async () => {
    await commitFile(repository, "attributed-one.txt", "one\n", [
      "feat(test): attribute a task range",
      "",
      "Context: tasks-demo.md (Tasks 1.1.a-b, 1.R)",
    ].join("\n"));
    const firstAttributed = await oid(repository, "HEAD");
    await commitFile(repository, "attributed-two.txt", "two\n", [
      "feat(test): repeat one parent attribution",
      "",
      "Context: tasks-demo.md (Task 1.1.a)",
    ].join("\n"));
    const secondAttributed = await oid(repository, "HEAD");
    await commitFile(repository, "unresolved.txt", "missing\n", [
      "feat(test): retain a stale task attribution",
      "",
      "Context: tasks-demo.md (Task 9.9.a)",
    ].join("\n"));
    const unresolved = await oid(repository, "HEAD");
    const prepared = await prepareDeliveryFromBranchAuthoring({
      mapId: "branch-map",
      planId: "4bce3788-2bd7-49ee-9f7f-af6c28f47bc1",
      workUnitId: "demo",
      expectedCurrentPlanDigest: null,
      taskListPath: ".arc/active/tasks-demo.md",
      taskListContent: taskListFixture(),
      designInventory: {
        artifacts: [{
          artifactId: "spec-demo.md",
          revisionDigest: `sha256:${"1".repeat(64)}`,
          form: "detailed",
          elements: [],
        }],
      },
      exec: createRawGitExec(repository),
      base: "main",
      head: "HEAD",
    });

    expect(prepared.status).toBe("prepared");
    if (prepared.status !== "prepared") return;
    expect(prepared.snapshot.source.facts).toMatchObject({
      taskAttributions: [
        { commit: firstAttributed, taskIds: ["1.1", "1.R"], unresolvedTaskIds: [] },
        { commit: secondAttributed, taskIds: ["1.1"], unresolvedTaskIds: [] },
        { commit: unresolved, taskIds: [], unresolvedTaskIds: ["9.9.a"] },
      ],
      advisories: [{ kind: "unresolved-task-reference", commit: unresolved, taskId: "9.9.a" }],
    });
    const contributionIds = prepared.inspection.contributionStepIds;
    const secondMemberStart = contributionIds.indexOf(secondAttributed);
    const projection = resolveDeliveryFromBranchProjection({
      snapshot: prepared.snapshot,
      slots: DeliveryAuthoringSlotsV1Schema.parse({
        projection: { kind: "wu-integration-target" },
        boundary: {
          kind: "explicit",
          segments: [
            { chunkKey: "first", sourceIds: contributionIds.slice(0, secondMemberStart) },
            { chunkKey: "second", sourceIds: contributionIds.slice(secondMemberStart) },
          ],
        },
        members: [
          memberSlot("first"),
          memberSlot("second"),
        ],
        seams: [],
      }),
    });
    expect(projection).toMatchObject({
      status: "resolved",
      projection: {
        authoring: {
          members: [
            { chunkKey: "first", taskIds: ["1.1", "1.R"] },
            { chunkKey: "second", taskIds: ["1.1"] },
          ],
        },
        sourceAdvisories: [
          { kind: "unresolved-task-reference", commit: unresolved, taskId: "9.9.a" },
        ],
      },
    });
  });

  it("refuses when a contribution commit message cannot be inspected", async () => {
    const exec = createRawGitExec(repository);
    const prepared = await prepareDeliveryFromBranchAuthoring({
      mapId: "branch-map",
      planId: "4bce3788-2bd7-49ee-9f7f-af6c28f47bc1",
      workUnitId: "demo",
      expectedCurrentPlanDigest: null,
      taskListPath: ".arc/active/tasks-demo.md",
      taskListContent: taskListFixture(),
      designInventory: {
        artifacts: [{
          artifactId: "spec-demo.md",
          revisionDigest: `sha256:${"1".repeat(64)}`,
          form: "detailed",
          elements: [],
        }],
      },
      exec: async (args, options) => {
        if (args[0] === "show") throw new Error("message unavailable");
        return exec(args, options);
      },
      base: "main",
      head: "HEAD",
    });

    expect(prepared).toEqual({ status: "refused", reason: "commit-attribution-unreadable" });
  });

  it("ignores task references attributed to a different task list", async () => {
    await commitFile(repository, "other-work.txt", "other\n", [
      "feat(test): attribute another work unit",
      "",
      "Context: tasks-other.md (Task 1.1.a)",
    ].join("\n"));
    const prepared = await prepareDeliveryFromBranchAuthoring({
      mapId: "branch-map",
      planId: "4bce3788-2bd7-49ee-9f7f-af6c28f47bc1",
      workUnitId: "demo",
      expectedCurrentPlanDigest: null,
      taskListPath: ".arc/active/tasks-demo.md",
      taskListContent: taskListFixture(),
      designInventory: {
        artifacts: [{
          artifactId: "spec-demo.md",
          revisionDigest: `sha256:${"1".repeat(64)}`,
          form: "detailed",
          elements: [],
        }],
      },
      exec: createRawGitExec(repository),
      base: "main",
      head: "HEAD",
    });

    expect(prepared.status).toBe("prepared");
    if (prepared.status !== "prepared") return;
    expect(prepared.snapshot.source.facts).toMatchObject({ taskAttributions: [], advisories: [] });
  });

  it("reports contribution co-change and lifecycle-artifact touches without constraining the cut", async () => {
    await writeFile(join(repository, "zeta.txt"), "one\n");
    await writeFile(join(repository, "alpha.txt"), "one\n");
    await git(repository, ["add", "--", "zeta.txt", "alpha.txt"]);
    await git(repository, ["-c", "core.hooksPath=/dev/null", "commit", "-m", "first co-change"]);
    const firstPair = await oid(repository, "HEAD");
    await writeFile(join(repository, "zeta.txt"), "two\n");
    await writeFile(join(repository, "alpha.txt"), "two\n");
    await mkdir(join(repository, ".arc", "active"), { recursive: true });
    await writeFile(join(repository, ".arc", "active", "meta-demo.md"), "# Metadata: demo\n");
    await git(repository, ["add", "--", "zeta.txt", "alpha.txt", ".arc/active/meta-demo.md"]);
    await git(repository, ["-c", "core.hooksPath=/dev/null", "commit", "-m", "second co-change"]);
    const secondPair = await oid(repository, "HEAD");
    const prepared = await prepareDeliveryFromBranchAuthoring({
      mapId: "branch-map",
      planId: "4bce3788-2bd7-49ee-9f7f-af6c28f47bc1",
      workUnitId: "demo",
      expectedCurrentPlanDigest: null,
      taskListPath: ".arc/active/tasks-demo.md",
      taskListContent: taskListFixture(),
      designInventory: {
        artifacts: [{
          artifactId: "spec-demo.md",
          revisionDigest: `sha256:${"1".repeat(64)}`,
          form: "detailed",
          elements: [],
        }],
      },
      exec: createRawGitExec(repository),
      base: "main",
      head: "HEAD",
    });

    expect(prepared.status).toBe("prepared");
    if (prepared.status !== "prepared") return;
    expect(prepared.snapshot.source.facts).toMatchObject({
      coChangePairs: expect.arrayContaining([{
        paths: ["alpha.txt", "zeta.txt"],
        contributionStepIds: [firstPair, secondPair]
          .sort((left, right) => Buffer.from(left).compare(Buffer.from(right))),
      }]),
      lifecycleArtifactTouches: [{
        commit: secondPair,
        paths: [".arc/active/meta-demo.md"],
      }],
    });
    const reports = prepared.snapshot.source.facts as {
      coChangePairs: { paths: string[] }[];
    };
    expect(reports.coChangePairs.flatMap((pair) => pair.paths)).not.toContain("ambient-pair.txt");
    const projection = resolveDeliveryFromBranchProjection({
      snapshot: prepared.snapshot,
      slots: DeliveryAuthoringSlotsV1Schema.parse({
        projection: { kind: "wu-integration-target" },
        boundary: {
          kind: "explicit",
          segments: [{
            chunkKey: "only",
            sourceIds: prepared.inspection.contributionStepIds,
          }],
        },
        members: [memberSlot("only")],
        seams: [],
      }),
    });
    expect(projection.status).toBe("resolved");
  });
});

function memberSlot(chunkKey: string) {
  return {
    status: "live" as const,
    chunkKey,
    title: `${chunkKey} member`,
    contract: `Publish the ${chunkKey} contribution`,
    designElementIds: [],
    mainlineLandability: "integration-only" as const,
  };
}

function taskListFixture(): string {
  return [
    "# Task List: Demo",
    "",
    "## **Phase 1:** Implementation",
    "",
    "### `[ ]` **1.1 Implement the contract**",
    "",
    "- _Goal:_ Implement the contract.",
    "",
    "    - `[ ]` **1.1.a First part**",
    "    - `[ ]` **1.1.b Second part**",
    "",
    "### `[ ]` **1.R Revise the contract**",
    "",
    "- _Goal:_ Revise the contract.",
    "",
    "## **Phase 2:** Verification",
    "",
    "### `[ ]` **2.1 Verify the work unit**",
    "",
  ].join("\n");
}

async function git(repository: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd: repository });
}

async function oid(repository: string, ref: string): Promise<string> {
  return (await execFileAsync("git", ["rev-parse", ref], { cwd: repository })).stdout.trim();
}

async function commitFile(
  repository: string,
  path: string,
  content: string,
  message: string,
): Promise<void> {
  await writeFile(join(repository, path), content);
  await git(repository, ["add", "--", path]);
  await git(repository, ["-c", "core.hooksPath=/dev/null", "commit", "-m", message]);
}
