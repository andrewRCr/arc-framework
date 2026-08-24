import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { GitExec } from "../../src/lib/git/exec.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import type {
  DeliveryMemberBinding,
} from "../../src/scripts/review-gate/core/delivery-member-lookup.js";
import type {
  ReviewTarget,
} from "../../src/scripts/review-gate/core/gate-contract-v2-schema.js";
import {
  composeDeliveryMemberTarget,
  confirmLocalReviewTarget,
  deriveLocalReviewTarget,
  LocalTargetDerivationError,
} from "../../src/scripts/review-gate/hosts/local/repository-target.js";

const roots: string[] = [];
const exec = createExecaGitExec();
const repositoryId = "12345678-1234-1234-1234-123456789abc";

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => rm(root, { recursive: true, force: true })));
});

async function git(cwd: string, ...args: string[]): Promise<string> {
  return (await exec("git", args, { cwd })).stdout.trim();
}

async function createRepository(commit = true): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "arc-review-target-"));
  roots.push(root);
  await git(root, "init", "-b", "main");
  await git(root, "config", "user.name", "ARC Test");
  await git(root, "config", "user.email", "arc@example.test");
  if (commit) {
    await writeFile(join(root, "tracked.txt"), "initial\n", "utf8");
    await git(root, "add", "tracked.txt");
    await git(root, "commit", "-m", "initial");
  }
  return root;
}

async function expectInvalid(
  root: string,
  reason: LocalTargetDerivationError["reason"],
  baseRef = "main",
): Promise<void> {
  await expect(deriveLocalReviewTarget({ exec, cwd: root, baseRef, repositoryId }))
    .rejects.toMatchObject({ code: "invalid-input", reason });
}

describe("canonical local review target derivation", () => {
  it("refuses unborn, unresolved-base, dirty, and non-commit repositories as invalid input", async () => {
    await expectInvalid(await createRepository(false), "unborn-repository");

    const unresolved = await createRepository();
    await expectInvalid(unresolved, "unresolved-base", "missing");

    const dirty = await createRepository();
    await writeFile(join(dirty, "untracked.txt"), "dirty\n", "utf8");
    await expectInvalid(dirty, "dirty-worktree");

    const nonCommit = await createRepository();
    const tree = await git(nonCommit, "rev-parse", "HEAD^{tree}");
    await writeFile(join(nonCommit, ".git", "HEAD"), `${tree}\n`, "utf8");
    await expectInvalid(nonCommit, "non-commit-head");
  });

  it("derives exact commits, merge base, and trees from a clean repository", async () => {
    const root = await createRepository();
    await git(root, "switch", "-c", "feature");
    await writeFile(join(root, "tracked.txt"), "feature\n", "utf8");
    await git(root, "commit", "-am", "feature");

    const target = await deriveLocalReviewTarget({ exec, cwd: root, baseRef: "main", repositoryId });

    expect(target).toMatchObject({
      schemaVersion: 2,
      semanticsVersion: "review-gate/v2",
      kind: "change-set",
      repositoryId,
      baseRef: "main",
      diffBaseSha: await git(root, "rev-parse", "main"),
      diffBaseTree: await git(root, "rev-parse", "main^{tree}"),
      headSha: await git(root, "rev-parse", "HEAD"),
      headTree: await git(root, "rev-parse", "HEAD^{tree}"),
    });
  });

  it("reports a stale target when coordinates move before publication", async () => {
    const root = await createRepository();
    await git(root, "switch", "-c", "feature");
    const attemptedTarget = await deriveLocalReviewTarget({
      exec,
      cwd: root,
      baseRef: "main",
      repositoryId,
    });
    await writeFile(join(root, "tracked.txt"), "moved\n", "utf8");
    await git(root, "commit", "-am", "move target");

    await expect(confirmLocalReviewTarget({
      exec,
      cwd: root,
      attemptedTarget,
    })).resolves.toMatchObject({
      state: "stale-target",
      attemptedTarget,
      currentTarget: { headSha: await git(root, "rev-parse", "HEAD") },
    });
  });
});

describe("member-coordinate target derivation", () => {
  function recordingExec(): { exec: GitExec; invocations: string[][] } {
    const invocations: string[][] = [];
    return {
      invocations,
      exec: async (file, args, options) => {
        invocations.push([...args]);
        return exec(file, args, options);
      },
    };
  }

  /** A control branch two commits ahead of `main`, standing in for a two-member stack. */
  async function createStack(): Promise<{
    root: string;
    predecessorSha: string;
    memberSha: string;
  }> {
    const root = await createRepository();
    await git(root, "switch", "-c", "feature");
    await writeFile(join(root, "tracked.txt"), "predecessor\n", "utf8");
    await git(root, "commit", "-am", "predecessor");
    const predecessorSha = await git(root, "rev-parse", "HEAD");
    await writeFile(join(root, "tracked.txt"), "member\n", "utf8");
    await git(root, "commit", "-am", "member");
    return { root, predecessorSha, memberSha: await git(root, "rev-parse", "HEAD") };
  }

  it("derives from the checkout and its merge base when no coordinates are supplied", async () => {
    const { root } = await createStack();
    const recording = recordingExec();

    const target = await deriveLocalReviewTarget({
      exec: recording.exec,
      cwd: root,
      baseRef: "main",
      repositoryId,
    });

    expect(target).toMatchObject({
      kind: "change-set",
      baseRef: "main",
      diffBaseSha: await git(root, "merge-base", "main", "HEAD"),
      headSha: await git(root, "rev-parse", "HEAD"),
    });
    expect(recording.invocations).toContainEqual(
      expect.arrayContaining(["rev-parse", "--verify", "refs/heads/main"]),
    );
  });

  it("derives against supplied coordinates verbatim, computing no merge base", async () => {
    const { root, predecessorSha, memberSha } = await createStack();
    const recording = recordingExec();

    const target = await deriveLocalReviewTarget({
      exec: recording.exec,
      cwd: root,
      baseRef: "main",
      repositoryId,
      memberCoordinates: { headSha: memberSha, diffBaseSha: predecessorSha },
    });

    expect(target).toMatchObject({
      kind: "delivery-member",
      baseRef: "main",
      diffBaseSha: predecessorSha,
      diffBaseTree: await git(root, "rev-parse", `${predecessorSha}^{tree}`),
      headSha: memberSha,
      headTree: await git(root, "rev-parse", `${memberSha}^{tree}`),
    });
    expect(target.diffBaseSha).not.toBe(await git(root, "merge-base", "main", "HEAD"));
    expect(recording.invocations.map(([verb]) => verb)).not.toContain("merge-base");
  });

  it("validates the base ref's format on both paths and resolves its object only by default", async () => {
    const { root, predecessorSha, memberSha } = await createStack();
    const recording = recordingExec();

    const target = await deriveLocalReviewTarget({
      exec: recording.exec,
      cwd: root,
      baseRef: "missing",
      repositoryId,
      memberCoordinates: { headSha: memberSha, diffBaseSha: predecessorSha },
    });

    expect(target.baseRef).toBe("missing");
    expect(recording.invocations).toContainEqual(
      expect.arrayContaining(["check-ref-format", "refs/heads/missing"]),
    );
    expect(recording.invocations).not.toContainEqual(
      expect.arrayContaining(["rev-parse", "--verify", "refs/heads/missing"]),
    );
    await expect(deriveLocalReviewTarget({ exec, cwd: root, baseRef: "missing", repositoryId }))
      .rejects.toMatchObject({ reason: "unresolved-base" });
    await expect(deriveLocalReviewTarget({
      exec,
      cwd: root,
      baseRef: "in..valid",
      repositoryId,
      memberCoordinates: { headSha: memberSha, diffBaseSha: predecessorSha },
    })).rejects.toMatchObject({ reason: "invalid-base" });
  });

  it("refuses recorded coordinates that are absent or are not commits", async () => {
    const { root, predecessorSha, memberSha } = await createStack();
    const absent = "0".repeat(40);
    const tree = await git(root, "rev-parse", "HEAD^{tree}");

    await expect(deriveLocalReviewTarget({
      exec,
      cwd: root,
      baseRef: "main",
      repositoryId,
      memberCoordinates: { headSha: absent, diffBaseSha: predecessorSha },
    })).rejects.toMatchObject({ code: "invalid-input", reason: "non-commit-head" });
    await expect(deriveLocalReviewTarget({
      exec,
      cwd: root,
      baseRef: "main",
      repositoryId,
      memberCoordinates: { headSha: memberSha, diffBaseSha: absent },
    })).rejects.toMatchObject({ code: "invalid-input", reason: "unresolved-base" });
    await expect(deriveLocalReviewTarget({
      exec,
      cwd: root,
      baseRef: "main",
      repositoryId,
      memberCoordinates: { headSha: tree, diffBaseSha: predecessorSha },
    })).rejects.toMatchObject({ code: "invalid-input", reason: "non-commit-head" });
    await expect(deriveLocalReviewTarget({
      exec,
      cwd: root,
      baseRef: "main",
      repositoryId,
      memberCoordinates: { headSha: memberSha, diffBaseSha: tree },
    })).rejects.toMatchObject({ code: "invalid-input", reason: "unresolved-base" });
  });

  it("scopes the worktree-cleanliness guard to the checkout-reading path", async () => {
    const { root, predecessorSha, memberSha } = await createStack();
    await writeFile(join(root, "tracked.txt"), "uncommitted\n", "utf8");

    await expect(deriveLocalReviewTarget({ exec, cwd: root, baseRef: "main", repositoryId }))
      .rejects.toMatchObject({ reason: "dirty-worktree" });
    await expect(deriveLocalReviewTarget({
      exec,
      cwd: root,
      baseRef: "main",
      repositoryId,
      memberCoordinates: { headSha: memberSha, diffBaseSha: predecessorSha },
    })).resolves.toMatchObject({ kind: "delivery-member", headSha: memberSha });
  });

  describe("composition from a member resolution", () => {
    function binding(
      overrides: Partial<DeliveryMemberBinding> & Pick<DeliveryMemberBinding, "base" | "head">,
    ): DeliveryMemberBinding {
      return {
        planId: "3f1b7c2e-4a5d-4e6f-8a9b-0c1d2e3f4a5b",
        deliverableId: `sha256:${"1".repeat(64)}`,
        workUnitId: "owning-work-unit",
        baseRef: "main",
        candidateHead: overrides.head,
        isFinalMember: false,
        ...overrides,
        headRef: overrides.headRef === undefined ? "delivery/plan/member-1" : overrides.headRef,
      };
    }

    it("pins the recorded commits, their trees, the configured base, and the member kind", async () => {
      const { root, predecessorSha, memberSha } = await createStack();
      const recording = recordingExec();
      const memberRef = "refs/delivery/plan/member-1";
      await git(root, "update-ref", memberRef, memberSha);

      const target = await composeDeliveryMemberTarget({
        exec: recording.exec,
        cwd: root,
        baseRef: "main",
        repositoryId,
        member: binding({ base: predecessorSha, head: memberSha }),
      });

      expect(target).toMatchObject({
        kind: "delivery-member",
        repositoryId,
        baseRef: "main",
        diffBaseSha: predecessorSha,
        diffBaseTree: await git(root, "rev-parse", `${predecessorSha}^{tree}`),
        headSha: memberSha,
        headTree: await git(root, "rev-parse", `${memberSha}^{tree}`),
      });
      expect(recording.invocations.flat().join(" ")).not.toContain("refs/delivery");
    });

    it("refuses recorded objects the repository does not hold", async () => {
      const { root, predecessorSha, memberSha } = await createStack();
      const absent = "0".repeat(40);

      await expect(composeDeliveryMemberTarget({
        exec,
        cwd: root,
        baseRef: "main",
        repositoryId,
        member: binding({ base: predecessorSha, head: absent }),
      })).rejects.toMatchObject({ code: "invalid-input", reason: "non-commit-head" });
      await expect(composeDeliveryMemberTarget({
        exec,
        cwd: root,
        baseRef: "main",
        repositoryId,
        member: binding({ base: absent, head: memberSha }),
      })).rejects.toMatchObject({ code: "invalid-input", reason: "unresolved-base" });
    });
  });

  describe("confirmation of a member target", () => {
    async function memberTarget(): Promise<{
      root: string;
      predecessorSha: string;
      memberSha: string;
      target: ReviewTarget;
    }> {
      const stack = await createStack();
      return {
        ...stack,
        target: await deriveLocalReviewTarget({
          exec,
          cwd: stack.root,
          baseRef: "main",
          repositoryId,
          memberCoordinates: { headSha: stack.memberSha, diffBaseSha: stack.predecessorSha },
        }),
      };
    }

    it("confirms current over a moved, dirty control checkout without re-deriving", async () => {
      const { root, target } = await memberTarget();
      await writeFile(join(root, "tracked.txt"), "successor\n", "utf8");
      await git(root, "commit", "-am", "successor");
      await writeFile(join(root, "tracked.txt"), "uncommitted\n", "utf8");
      const recording = recordingExec();

      await expect(confirmLocalReviewTarget({
        exec: recording.exec,
        cwd: root,
        attemptedTarget: target,
      })).resolves.toEqual({ state: "current", target });

      const issued = recording.invocations.map((args) => args.join(" "));
      expect(issued.some((command) => command.includes("merge-base"))).toBe(false);
      expect(issued.some((command) => command.includes("status"))).toBe(false);
      expect(issued.some((command) => command.includes("HEAD"))).toBe(false);
    });

    it("refuses a member target whose recorded objects are gone", async () => {
      const { root, target } = await memberTarget();
      const absent = "0".repeat(40);

      await expect(confirmLocalReviewTarget({
        exec,
        cwd: root,
        attemptedTarget: { ...target, headSha: absent },
      })).rejects.toMatchObject({ code: "invalid-input", reason: "non-commit-head" });
      await expect(confirmLocalReviewTarget({
        exec,
        cwd: root,
        attemptedTarget: { ...target, diffBaseSha: absent },
      })).rejects.toMatchObject({ code: "invalid-input", reason: "unresolved-base" });
    });
  });
});
