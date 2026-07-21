import { describe, expect, it } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import { createInRepoAbandonRetirementContext } from "../../../src/lib/work-unit/direct-retirement-driver.js";

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
    readFile: async () => "",
    createRecord: async () => undefined,
    removeRecord: async () => undefined,
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
      readFile: async () => "",
      createRecord: async () => undefined,
      removeRecord: async () => undefined,
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
