/** Git adapter tests for fresh lifecycle-contribution revalidation. */

import { describe, expect, it } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import { validateManagedPath } from "../../../src/lib/kernel/index.js";
import {
  classifyGitDeliveryTerminalDelta,
  revalidateDeliveryLifecycleContribution,
} from "../../../src/lib/delivery/git-lifecycle-contribution.js";

describe("revalidateDeliveryLifecycleContribution", () => {
  it("detects a contribution introduced after an earlier successful read", async () => {
    const path = ".arc/active/meta-example.md";
    const oid = "a".repeat(40);
    let candidateHasEntry = false;
    const exec: GitExec = async (_command, args) => ({
      stdout: args[2] === "candidate" && candidateHasEntry
        ? `100644 blob ${oid}\t${path}\0`
        : "",
    });
    const input = {
      exec,
      protectedBaseRef: "base",
      candidateRef: "candidate",
      paths: [path],
    };

    await expect(revalidateDeliveryLifecycleContribution(input)).resolves.toEqual({ status: "ok" });
    candidateHasEntry = true;
    await expect(revalidateDeliveryLifecycleContribution(input)).resolves.toEqual({
      status: "refused",
      reason: "contribution-mismatch",
      paths: [path],
    });
  });

  it("fails closed when an exact entry cannot be read", async () => {
    const path = ".arc/backlog/ROADMAP.md";
    const exec: GitExec = async () => ({ stdout: "malformed\0" });

    await expect(revalidateDeliveryLifecycleContribution({
      exec,
      protectedBaseRef: "base",
      candidateRef: "candidate",
      paths: [path],
    })).resolves.toEqual({
      status: "refused",
      reason: "entry-unavailable",
      paths: [path],
    });
  });
});

describe("classifyGitDeliveryTerminalDelta", () => {
  const activeMetaPath = validateManagedPath(".arc/active/meta-example.md");

  function gitExec(diffPaths: readonly string[] | Error): GitExec {
    return async (_command, args) => {
      if (args[0] === "diff") {
        if (diffPaths instanceof Error) throw diffPaths;
        return { stdout: diffPaths.map((path) => `${path}\0`).join("") };
      }
      return { stdout: "" };
    };
  }

  function input(diffPaths: readonly string[] | Error) {
    return {
      exec: gitExec(diffPaths),
      workUnitId: "example",
      activeMetaPath,
      protectedBaseRef: "refs/heads/main",
      topRef: "refs/heads/feat/example",
      fromRevision: "a".repeat(40),
      toRevision: "b".repeat(40),
      readDirectory: async () => ["meta-example.md", "spec-example.md", "tasks-example.md"],
      projectReadinessPath: null,
    };
  }

  it("classifies a delta reaching only the work unit's artifacts as lifecycle-only", async () => {
    await expect(classifyGitDeliveryTerminalDelta(input([
      ".arc/active/tasks-example.md",
      ".arc/active/spec-example.md",
    ]))).resolves.toEqual({
      kind: "lifecycle-only",
      lifecyclePaths: [".arc/active/spec-example.md", ".arc/active/tasks-example.md"],
    });
  });

  it("partitions a delta that also reaches source content", async () => {
    await expect(classifyGitDeliveryTerminalDelta(input([
      "packages/arc-framework/src/lib/delivery/review-fix.ts",
      ".arc/active/tasks-example.md",
    ]))).resolves.toEqual({
      kind: "carries-non-lifecycle",
      lifecyclePaths: [".arc/active/tasks-example.md"],
      nonLifecyclePaths: ["packages/arc-framework/src/lib/delivery/review-fix.ts"],
    });
  });

  it("classifies an empty delta as lifecycle-only", async () => {
    await expect(classifyGitDeliveryTerminalDelta(input([]))).resolves.toEqual({
      kind: "lifecycle-only",
      lifecyclePaths: [],
    });
  });

  it("reports the classification as unavailable when the revision range cannot be read", async () => {
    await expect(classifyGitDeliveryTerminalDelta(input(new Error("bad revision"))))
      .resolves.toBeNull();
  });
});
