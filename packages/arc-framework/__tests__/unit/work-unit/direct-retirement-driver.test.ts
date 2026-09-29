import { describe, expect, it } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import {
  createInRepoAbandonRetirementContext,
  createInRepoRenameRetirementContext,
  DirectTransitionConservationError,
} from "../../../src/lib/work-unit/direct-retirement-driver.js";
import { renameArtifactBasename } from "../../../src/lib/work-unit/mutators/relocate-artifacts.js";
import { makeGitProcessError } from "../../helpers/git-exec-fake.js";

const HEAD = "a".repeat(40);
const META_PATH = ".arc/active/meta-sample.md";
const ROADMAP_PATH = ".arc/backlog/ROADMAP.md";

function bytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

async function readRoadmapPatch(
  beforeRoadmap: Uint8Array | null,
  afterRoadmap: Uint8Array | null,
) {
  const exec: GitExec = async (_cmd, args) => {
    if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { stdout: "feat/sample\n" };
    if (args[0] === "rev-parse" && args[1] === "--verify") return { stdout: `${HEAD}\n` };
    if (args[0] === "ls-tree") return { stdout: `${META_PATH}\0` };
    throw new Error(`unexpected Git command: ${args.join(" ")}`);
  };
  const context = createInRepoAbandonRetirementContext({
    cwd: "/repo",
    exec,
    readBlob: async (ref, path) => {
      if (path === META_PATH) return ref === HEAD ? bytes("meta") : null;
      if (path === ROADMAP_PATH) return ref === HEAD ? beforeRoadmap : afterRoadmap;
      throw new Error(`unexpected blob read: ${String(ref)}:${path}`);
    },
  });
  const source = await context.captureSource({
    name: "sample",
    sourceDir: ".arc/active",
    expectedBranch: "feat/sample",
  });
  return await context.readTransitionPatch(source);
}

describe("direct retirement branch resolution", () => {
  it("resolves branch inputs only through the heads namespace", async () => {
    const calls: string[][] = [];
    const head = "a".repeat(40);
    const exec: GitExec = async (_cmd, args) => {
      calls.push(args);
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { stdout: "feat/sample\n" };
      if (
        args[0] === "rev-parse"
        && args[1] === "--verify"
        && args[2] === "refs/heads/feat/sample^{commit}"
      ) return { stdout: `${head}\n` };
      if (args[0] === "ls-tree") return { stdout: ".arc/active/meta-sample.md\0" };
      throw new Error(`unexpected Git command: ${args.join(" ")}`);
    };
    const context = createInRepoAbandonRetirementContext({
      cwd: "/repo",
      exec,
      readBlob: async () => new TextEncoder().encode("meta"),
    });

    await expect(context.captureSource({
      name: "sample",
      sourceDir: ".arc/active",
      expectedBranch: "feat/sample",
    })).resolves.toMatchObject({ scope: { source: { branch: "feat/sample", head } } });
    expect(calls).toContainEqual(["rev-parse", "--verify", "refs/heads/feat/sample^{commit}"]);
    expect(calls).not.toContainEqual(["rev-parse", "--verify", "feat/sample^{commit}"]);
  });

  it("records a changed present readiness blob at its exact managed path", async () => {
    const operations = await readRoadmapPatch(bytes("before"), bytes("after"));

    expect(operations).toContainEqual({
      operation: "write",
      path: ROADMAP_PATH,
      contentDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
    });
  });

  it("records a deleted readiness blob at its exact managed path", async () => {
    const operations = await readRoadmapPatch(bytes("before"), null);

    expect(operations).toContainEqual({ operation: "delete", path: ROADMAP_PATH });
  });

  it("omits unchanged readiness blobs from the retirement patch", async () => {
    const operations = await readRoadmapPatch(bytes("same"), bytes("same"));

    expect(operations).not.toContainEqual(expect.objectContaining({ path: ROADMAP_PATH }));
  });
});

describe("rename result derivation", () => {
  it("maps every source artifact basename to the target slug", async () => {
    const sourcePaths = [".arc/active/meta-sample.md", ".arc/active/spec-sample.md"];
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { stdout: "feat/sample\n" };
      if (args[0] === "rev-parse" && args[1] === "--verify") return { stdout: `${HEAD}\n` };
      if (args[0] === "ls-tree") return { stdout: `${sourcePaths.join("\0")}\0` };
      throw new Error(`unexpected Git command: ${args.join(" ")}`);
    };
    const context = createInRepoRenameRetirementContext({
      cwd: "/repo",
      exec,
      readBlob: async () => bytes("artifact"),
    });

    const source = await context.captureSource({
      name: "sample",
      targetSlug: "renamed-sample",
      sourceDir: ".arc/active",
      resultDir: ".arc/active",
      expectedBranch: "feat/sample",
    });

    expect(source.resultArtifactPaths).toEqual([
      ".arc/active/meta-renamed-sample.md",
      ".arc/active/spec-renamed-sample.md",
    ]);
    expect(source.slugMap).toEqual({ sourceSlug: "sample", targetSlug: "renamed-sample" });
  });

  it("derives a backlog stub result in the new leaf", async () => {
    const sourcePath = ".arc/backlog/planned/sample/meta-sample.md";
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { stdout: "chore/rename-sample\n" };
      if (args[0] === "rev-parse" && args[1] === "--verify") return { stdout: `${HEAD}\n` };
      if (args[0] === "ls-tree") return { stdout: `${sourcePath}\0` };
      throw new Error(`unexpected Git command: ${args.join(" ")}`);
    };
    const context = createInRepoRenameRetirementContext({
      cwd: "/repo",
      exec,
      readBlob: async () => bytes("artifact"),
    });

    const source = await context.captureSource({
      name: "sample",
      targetSlug: "renamed-sample",
      sourceDir: ".arc/backlog/planned/sample",
      resultDir: ".arc/backlog/planned/renamed-sample",
      expectedBranch: "[none]",
    });

    expect(source.resultArtifactPaths).toEqual([
      ".arc/backlog/planned/renamed-sample/meta-renamed-sample.md",
    ]);
  });

  it("restages a modified rename result while preserving its staged source deletion", async () => {
    const sourcePath = ".arc/active/meta-sample.md";
    const resultPath = ".arc/active/meta-renamed-sample.md";
    const calls: string[][] = [];
    const exec: GitExec = async (_cmd, args) => {
      calls.push(args);
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { stdout: "feat/sample\n" };
      if (args[0] === "rev-parse" && args[1] === "--verify") return { stdout: `${HEAD}\n` };
      if (args[0] === "ls-tree") return { stdout: `${sourcePath}\0` };
      if (args[0] === "diff" && args[1] === "--cached") {
        return { stdout: `${sourcePath}\0${resultPath}\0` };
      }
      if (args[0] === "add") return { stdout: "" };
      throw new Error(`unexpected Git command: ${args.join(" ")}`);
    };
    const context = createInRepoRenameRetirementContext({
      cwd: "/repo",
      exec,
      readBlob: async () => bytes("artifact"),
    });
    const source = await context.captureSource({
      name: "sample",
      targetSlug: "renamed-sample",
      sourceDir: ".arc/active",
      resultDir: ".arc/active",
      expectedBranch: "feat/sample",
    });

    await context.stageTransition(source);

    expect(calls).toContainEqual(["add", "-A", "--", resultPath, ROADMAP_PATH]);
  });

  it("preserves shipped basenames and rejects missing rename results", async () => {
    expect(renameArtifactBasename("meta-sample.md", null)).toBe("meta-sample.md");
    expect(renameArtifactBasename("notes-sample.md", {
      sourceSlug: "sample",
      targetSlug: "renamed-sample",
    })).toBe("notes-renamed-sample.md");
  });

  it.each([
    ["source remains", true, true, "rename transition left source artifact in the index"],
    ["result omitted", false, false, "rename transition omitted result artifact"],
  ] as const)("retains the shipped patch refusal when the %s", async (_label, sourcePresent, resultPresent, message) => {
    const sourcePath = ".arc/active/meta-sample.md";
    const resultPath = ".arc/active/meta-renamed-sample.md";
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { stdout: "feat/sample\n" };
      if (args[0] === "rev-parse" && args[1] === "--verify") return { stdout: `${HEAD}\n` };
      if (args[0] === "ls-tree") return { stdout: `${sourcePath}\0` };
      throw new Error(`unexpected Git command: ${args.join(" ")}`);
    };
    const context = createInRepoRenameRetirementContext({
      cwd: "/repo",
      exec,
      readBlob: async (ref, path) => {
        if (ref === HEAD && path === sourcePath) return bytes("source");
        if (ref === null && path === sourcePath) return sourcePresent ? bytes("source") : null;
        if (ref === null && path === resultPath) return resultPresent ? bytes("result") : null;
        if (path === ROADMAP_PATH) return null;
        throw new Error(`unexpected blob read: ${String(ref)}:${path}`);
      },
    });
    const source = await context.captureSource({
      name: "sample",
      targetSlug: "renamed-sample",
      sourceDir: ".arc/active",
      resultDir: ".arc/active",
      expectedBranch: "feat/sample",
    });

    await expect(context.readTransitionPatch(source)).rejects.toThrow(message);
  });

  it("names an omitted companion through the typed conservation refusal", async () => {
    const sourcePaths = [".arc/active/meta-sample.md", ".arc/active/spec-sample.md"];
    const omittedResult = ".arc/active/spec-renamed-sample.md";
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { stdout: "feat/sample\n" };
      if (args[0] === "rev-parse" && args[1] === "--verify") return { stdout: `${HEAD}\n` };
      if (args[0] === "ls-tree") return { stdout: `${sourcePaths.join("\0")}\0` };
      throw new Error(`unexpected Git command: ${args.join(" ")}`);
    };
    const context = createInRepoRenameRetirementContext({
      cwd: "/repo",
      exec,
      readBlob: async (ref, path) => {
        if (ref === HEAD && sourcePaths.includes(path)) return bytes("source");
        if (ref === null && sourcePaths.includes(path)) return null;
        if (ref === null && path === ".arc/active/meta-renamed-sample.md") return bytes("meta result");
        if (ref === null && path === omittedResult) return null;
        if (path === ROADMAP_PATH) return null;
        throw new Error(`unexpected blob read: ${String(ref)}:${path}`);
      },
    });
    const source = await context.captureSource({
      name: "sample",
      targetSlug: "renamed-sample",
      sourceDir: ".arc/active",
      resultDir: ".arc/active",
      expectedBranch: "feat/sample",
    });

    const failure = await context.readTransitionPatch(source).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(DirectTransitionConservationError);
    expect(failure).toMatchObject({ path: omittedResult });
    expect((failure as Error).message).toContain(omittedResult);
  });

  it("binds only caller-declared shared-visible paths from a mixed dependent inventory", async () => {
    const sourcePath = ".arc/active/meta-sample.md";
    const resultPath = ".arc/active/meta-renamed-sample.md";
    const siblingPath = ".arc/active/spec-sibling.md";
    const privatePath = ".arc/active/meta-private-dependent.md";
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { stdout: "feat/sample\n" };
      if (args[0] === "rev-parse" && args[1] === "--verify") return { stdout: `${HEAD}\n` };
      if (args[0] === "ls-tree") return { stdout: `${sourcePath}\0` };
      throw new Error(`unexpected Git command: ${args.join(" ")}`);
    };
    const context = createInRepoRenameRetirementContext({
      cwd: "/repo",
      exec,
      readBlob: async (ref, path) => {
        if (ref === HEAD && path === sourcePath) return bytes("source");
        if (ref === null && path === sourcePath) return null;
        if (ref === null && path === resultPath) return bytes("result");
        if (ref === HEAD && path === siblingPath) return bytes("old sibling");
        if (ref === null && path === siblingPath) return bytes("new sibling");
        if (ref === HEAD && path === ROADMAP_PATH) return bytes("old roadmap");
        if (ref === null && path === ROADMAP_PATH) return bytes("new roadmap");
        throw new Error(`unexpected blob read: ${String(ref)}:${path}`);
      },
    });
    const source = await context.captureSource({
      name: "sample",
      targetSlug: "renamed-sample",
      sourceDir: ".arc/active",
      resultDir: ".arc/active",
      expectedBranch: "feat/sample",
      additionalPaths: [siblingPath],
    });

    const operations = await context.readTransitionPatch(source);

    expect(operations.map(({ operation, path }) => [operation, path])).toEqual([
      ["delete", sourcePath],
      ["write", resultPath],
      ["write", siblingPath],
      ["write", ROADMAP_PATH],
    ]);
    expect(operations).not.toContainEqual(expect.objectContaining({ path: privatePath }));
  });

  it.each([
    ["source pair", ".arc/active/meta-sample.md"],
    ["result pair", ".arc/active/meta-renamed-sample.md"],
    ["ROADMAP", ROADMAP_PATH],
  ])("refuses an additional path that shadows the derived %s", async (_label, additionalPath) => {
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { stdout: "feat/sample\n" };
      if (args[0] === "rev-parse" && args[1] === "--verify") return { stdout: `${HEAD}\n` };
      if (args[0] === "ls-tree") return { stdout: `${META_PATH}\0` };
      throw new Error(`unexpected Git command: ${args.join(" ")}`);
    };
    const context = createInRepoRenameRetirementContext({
      cwd: "/repo",
      exec,
      readBlob: async () => bytes("artifact"),
    });

    await expect(context.captureSource({
      name: "sample",
      targetSlug: "renamed-sample",
      sourceDir: ".arc/active",
      resultDir: ".arc/active",
      expectedBranch: "feat/sample",
      additionalPaths: [additionalPath],
    })).rejects.toThrow("additional transition path overlaps a derived path");
  });

  it("restores every rename path after a refused commit", async () => {
    const calls: string[][] = [];
    const siblingPath = ".arc/active/spec-sibling.md";
    const exec: GitExec = async (_cmd, args) => {
      calls.push(args);
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { stdout: "feat/sample\n" };
      if (args[0] === "rev-parse" && args[1] === "--verify") return { stdout: `${HEAD}\n` };
      if (args[0] === "ls-tree") return { stdout: `${META_PATH}\0` };
      if (args[0] === "restore") return { stdout: "" };
      throw new Error(`unexpected Git command: ${args.join(" ")}`);
    };
    const context = createInRepoRenameRetirementContext({
      cwd: "/repo",
      exec,
      readBlob: async () => bytes("artifact"),
    });
    const source = await context.captureSource({
      name: "sample",
      targetSlug: "renamed-sample",
      sourceDir: ".arc/active",
      resultDir: ".arc/active",
      expectedBranch: "feat/sample",
      additionalPaths: [siblingPath],
    });
    await expect(context.rollbackRefusedCommit(source)).resolves.toEqual({ status: "rolled-back" });
    expect(calls).toContainEqual([
      "restore",
      `--source=${HEAD}`,
      "--staged",
      "--worktree",
      "--",
      META_PATH,
      ".arc/active/meta-renamed-sample.md",
      siblingPath,
      ROADMAP_PATH,
    ]);
  });

  it("reports an incomplete tree restore without record cleanup instructions", async () => {
    const exec: GitExec = async (_cmd, args) => {
      if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") return { stdout: "feat/sample\n" };
      if (args[0] === "rev-parse" && args[1] === "--verify") return { stdout: `${HEAD}\n` };
      if (args[0] === "ls-tree") return { stdout: `${META_PATH}\0` };
      if (args[0] === "restore") {
        throw makeGitProcessError({ command: "git", args, exitCode: 128, stderr: "injected restore refusal" });
      }
      throw new Error(`unexpected Git command: ${args.join(" ")}`);
    };
    const context = createInRepoRenameRetirementContext({
      cwd: "/repo",
      exec,
      readBlob: async () => bytes("artifact"),
    });
    const source = await context.captureSource({
      name: "sample",
      targetSlug: "renamed-sample",
      sourceDir: ".arc/active",
      resultDir: ".arc/active",
      expectedBranch: "feat/sample",
    });
    const result = await context.rollbackRefusedCommit(source);

    expect(result).toMatchObject({ status: "refused", reason: "authority-unavailable" });
    if (result.status !== "refused") throw new Error("expected refusal");
    expect(result.diagnostic).toMatch(/tree restore failed: .*injected restore refusal/u);
    expect(result.diagnostic).not.toContain("record");
  });
});
