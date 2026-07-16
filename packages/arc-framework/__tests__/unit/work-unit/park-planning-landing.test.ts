/** Base-version orchestration tests for partial-protection park landing. */

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import { validateManagedPath } from "../../../src/lib/canonical/managed-path.js";
import type { GitExec } from "../../../src/lib/git/exec.js";
import {
  createInRepoParkPlanningLandingContext,
  landParkPlanningTransition,
  type ParkLandingBaseSnapshot,
  type ParkLandingTransition,
  type ParkPlanningLandingContext,
} from "../../../src/lib/work-unit/park-planning-landing.js";

const sourceDigest = canonicalDigest("source");
const patchDigest = canonicalDigest("patch");
const resultDigest = canonicalDigest("result");
const recordDigest = canonicalDigest("record");

const transition: ParkLandingTransition = {
  commit: "b".repeat(40),
  receipt: {
    schemaVersion: 1,
    receiptId: recordDigest,
    subject: { kind: "work-unit", name: "solo" },
    transition: "park-planning",
    source: { branch: "plan/solo", head: "a".repeat(40), artifactDigest: sourceDigest },
    transitionPatchDigest: patchDigest,
    retiringProjection: { kind: "direct-transition" },
    authorization: "planning-relocated",
    result: { kind: "relocate", plannedArtifactDigest: resultDigest },
  },
  files: [{
    path: validateManagedPath(".arc/backlog/planned/solo/meta-solo.md"),
    mode: "100644",
    oid: "c".repeat(40),
    bytes: new TextEncoder().encode("meta"),
  }],
};

function base(version: string, conflicts: readonly string[] = []): ParkLandingBaseSnapshot {
  return {
    version: canonicalDigest(version),
    indexTree: "d".repeat(40),
    stagedPaths: [],
    conflictingPaths: conflicts,
  };
}

function context(
  snapshots: readonly ParkLandingBaseSnapshot[],
  stagedVersions: string[],
): ParkPlanningLandingContext {
  let read = 0;
  return {
    readTransition: async () => ({ status: "resolved", transition }),
    readBase: async () => snapshots[read++] ?? snapshots.at(-1)!,
    stage: async (_source, expectedBase) => {
      stagedVersions.push(expectedBase.version);
      return { status: "staged" };
    },
  };
}

function productionHarness(options: { symlinkParent?: string } = {}): {
  context: ParkPlanningLandingContext;
  calls: Array<{ args: string[]; indexFile?: string }>;
  files: Map<string, Uint8Array>;
  setLockedTree(tree: string): void;
} {
  const indexPath = "/repo/.git/index";
  const files = new Map<string, Uint8Array>([[indexPath, new TextEncoder().encode("index")]]);
  const directories = new Set(["/repo", "/repo/.git", "/repo/.arc"]);
  const symlinks = new Set(options.symlinkParent === undefined ? [] : [options.symlinkParent]);
  const calls: Array<{ args: string[]; indexFile?: string }> = [];
  const baseTree = "d".repeat(40);
  let lockedTree = baseTree;
  const exec: GitExec = async (_cmd, args, execOptions) => {
    calls.push({ args, ...(execOptions?.indexFile === undefined ? {} : { indexFile: execOptions.indexFile }) });
    if (args[0] === "rev-parse" && args[1] === "--verify") return { stdout: `${"a".repeat(40)}\n` };
    if (args[0] === "rev-parse" && args[1] === "--path-format=absolute") {
      return { stdout: `${indexPath}\n` };
    }
    if (args[0] === "write-tree") {
      return { stdout: `${execOptions?.indexFile === undefined ? baseTree : lockedTree}\n` };
    }
    if (args[0] === "status" || args[0] === "diff" || args[0] === "ls-files") return { stdout: "" };
    if (args[0] === "update-index") return { stdout: "" };
    throw new Error(`unexpected Git command: ${args.join(" ")}`);
  };
  const missing = (path: string): Error => Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
  return {
    context: createInRepoParkPlanningLandingContext({
      cwd: "/repo",
      exec,
      readBlob: async () => null,
      fs: {
        lstat: async (path) => {
          if (symlinks.has(path)) {
            return { isDirectory: () => false, isSymbolicLink: () => true };
          }
          if (directories.has(path)) {
            return { isDirectory: () => true, isSymbolicLink: () => false };
          }
          throw missing(path);
        },
        mkdir: async (path) => {
          if (directories.has(path) || symlinks.has(path) || files.has(path)) throw new Error(`EEXIST: ${path}`);
          directories.add(path);
        },
        readFile: async (path) => {
          const content = files.get(path);
          if (content === undefined) throw missing(path);
          return content;
        },
        writeFile: async (path, content) => {
          if (directories.has(path) || symlinks.has(path) || files.has(path)) throw new Error(`EEXIST: ${path}`);
          files.set(path, content);
        },
        rename: async (from, to) => {
          const content = files.get(from);
          if (content === undefined) throw missing(from);
          files.set(to, content);
          files.delete(from);
        },
        rm: async (path) => {
          files.delete(path);
        },
      },
    }),
    calls,
    files,
    setLockedTree: (tree) => { lockedTree = tree; },
  };
}

describe("landParkPlanningTransition", () => {
  it("uses a fresh non-conflicting base version when the base changed", async () => {
    const stagedVersions: string[] = [];
    const initial = base("initial");
    const fresh = base("fresh");

    const result = await landParkPlanningTransition(
      context([initial, fresh], stagedVersions),
      { name: "solo", commit: transition.commit },
    );

    expect(result.status).toBe("landed");
    expect(stagedVersions).toEqual([fresh.version]);
  });

  it("refuses a changed base that gained a slug conflict without staging", async () => {
    const stagedVersions: string[] = [];
    const conflict = ".arc/backlog/provisional/solo/meta-solo.md";

    const result = await landParkPlanningTransition(
      context([base("initial"), base("fresh", [conflict])], stagedVersions),
      { name: "solo", commit: transition.commit },
    );

    expect(result).toEqual({
      status: "rejected",
      reason: `The base already contains a conflicting work-unit result: ${conflict}.`,
    });
    expect(stagedVersions).toEqual([]);
  });

  it("rejects an index change after the preflight while holding the compare-and-set lock", async () => {
    const harness = productionHarness();
    const expected = await harness.context.readBase("solo", transition.files);
    harness.setLockedTree("e".repeat(40));

    const result = await harness.context.stage(transition, expected);

    expect(result).toEqual({
      status: "rejected",
      reason: "The base changed during park landing; retry from the fresh base.",
    });
    expect(harness.calls.some((call) => call.args[0] === "update-index")).toBe(false);
    expect(harness.files.has("/repo/.git/index.lock")).toBe(false);
  });

  it("rejects a symlinked landing parent before writing or staging", async () => {
    const harness = productionHarness({ symlinkParent: "/repo/.arc/backlog" });
    const expected = await harness.context.readBase("solo", transition.files);

    const result = await harness.context.stage(transition, expected);

    expect(result).toMatchObject({
      status: "rejected",
      reason: expect.stringMatching(/parent is not a real directory/iu),
    });
    expect(harness.files.has("/repo/.arc/backlog/planned/solo/meta-solo.md")).toBe(false);
    expect(harness.calls.some((call) => call.args[0] === "update-index")).toBe(false);
    expect(harness.files.has("/repo/.git/index.lock")).toBe(false);
  });

  it("installs the lock-backed index only after exact files are created", async () => {
    const harness = productionHarness();
    const expected = await harness.context.readBase("solo", transition.files);

    const result = await harness.context.stage(transition, expected);

    expect(result).toEqual({ status: "staged" });
    expect(harness.files.has("/repo/.arc/backlog/planned/solo/meta-solo.md")).toBe(true);
    expect(harness.files.has("/repo/.git/index.lock")).toBe(false);
    expect(harness.calls).toContainEqual(expect.objectContaining({
      args: expect.arrayContaining(["update-index", "--cacheinfo"]),
      indexFile: "/repo/.git/index.lock",
    }));
  });
});
