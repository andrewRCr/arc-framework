import { describe, expect, it, vi } from "vitest";

import type { GitExec } from "../../../src/lib/git/exec.js";
import {
  planGitV3RetirementDelta,
  type GitV3RetirementDeltaInput,
} from "../../../src/lib/work-unit/git-decompose-v3-retirement-delta.js";

const BASE = "1".repeat(40);
const SOURCE = "2".repeat(40);
const RESULT = "3".repeat(40);
const META_BASE = "4".repeat(40);
const META_SOURCE = "5".repeat(40);
const DRAFT_SOURCE = "6".repeat(40);
const ROADMAP_BASE = "7".repeat(40);
const ROADMAP_SOURCE = "8".repeat(40);
const TREE = "9".repeat(40);
const RIDER_BLOB = "a".repeat(40);
const RIDER_TREE = "b".repeat(40);
const encoder = new TextEncoder();

function input(): GitV3RetirementDeltaInput {
  return {
    sourceKind: "started-planning",
    predecessorCandidates: [".arc/active/meta-origin.md"],
    originArtifactPaths: [
      ".arc/active/draft-origin.md",
      ".arc/active/meta-origin.md",
    ],
    roadmapPath: ".arc/backlog/ROADMAP.md",
    sourceHead: SOURCE,
    resultBaseHead: RESULT,
  };
}

function line(mode: string, kind: string, oid: string, path: string): string {
  return `${mode} ${kind} ${oid}\t${path}\0`;
}

function trees(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    [BASE]: [
      line("040000", "tree", TREE, ".arc"),
      line("100644", "blob", META_BASE, ".arc/active/meta-origin.md"),
      line("100644", "blob", ROADMAP_BASE, ".arc/backlog/ROADMAP.md"),
    ].join(""),
    [SOURCE]: [
      line("040000", "tree", TREE, ".arc"),
      line("100644", "blob", DRAFT_SOURCE, ".arc/active/draft-origin.md"),
      line("100644", "blob", META_SOURCE, ".arc/active/meta-origin.md"),
      line("100644", "blob", ROADMAP_SOURCE, ".arc/backlog/ROADMAP.md"),
    ].join(""),
    [RESULT]: [
      line("040000", "tree", TREE, ".arc"),
      line("100644", "blob", META_BASE, ".arc/active/meta-origin.md"),
      line("100644", "blob", ROADMAP_BASE, ".arc/backlog/ROADMAP.md"),
    ].join(""),
    ...overrides,
  };
}

function adapter(
  treeOutput = trees(),
  mergeBases = `${BASE}\n`,
): {
  exec: GitExec;
  readObject: ReturnType<typeof vi.fn<(oid: string, kind: string) => Promise<Uint8Array>>>;
  calls: string[][];
} {
  const calls: string[][] = [];
  const exec: GitExec = async (_cmd, args) => {
    calls.push(args);
    if (args[0] === "merge-base") return { stdout: mergeBases };
    const oid = args.at(-1);
    if (args[0] === "ls-tree" && oid !== undefined) {
      return { stdout: treeOutput[oid] ?? "" };
    }
    throw new Error(`unexpected git invocation: ${args.join(" ")}`);
  };
  const readObject = vi.fn(async (oid: string, kind: string) => encoder.encode(`${kind}:${oid}`));
  return { exec, readObject, calls };
}

describe("Git v3 retirement delta adapter", () => {
  it("refuses a criss-cross topology when merge-base --all returns multiple bases", async () => {
    const deps = adapter({}, `${BASE}\n${"c".repeat(40)}\n`);

    const result = await planGitV3RetirementDelta({ cwd: "/repo", ...deps }, input());

    expect(result).toEqual({
      status: "refused",
      refusal: { code: "ambiguous-merge-base" },
    });
    expect(deps.calls).toEqual([
      ["merge-base", "--all", SOURCE, RESULT],
    ]);
    expect(deps.readObject).not.toHaveBeenCalled();
  });

  it("binds exact binary object bytes from all three recursively listed trees", async () => {
    const deps = adapter();

    const result = await planGitV3RetirementDelta({ cwd: "/repo", ...deps }, input());

    expect(result.status).toBe("planned");
    if (result.status !== "planned") return;
    const meta = result.paths.find(({ path }) => path === ".arc/active/meta-origin.md");
    expect(meta?.source).toEqual({
      kind: "object",
      objectKind: "blob",
      mode: "100644",
      bytes: encoder.encode(`blob:${META_SOURCE}`),
    });
    expect(result.paths.some(({ path }) => path === ".arc")).toBe(false);
    expect(deps.calls.slice(1)).toHaveLength(3);
    for (const args of deps.calls.slice(1)) {
      expect(args).toEqual([
        "ls-tree",
        "--full-tree",
        "-r",
        "-t",
        "-z",
        "--format=%(objectmode) %(objecttype) %(objectname)%x09%(path)",
        expect.any(String),
      ]);
    }
  });

  it("retains a blob-to-tree replacement and refuses it before rider classification", async () => {
    const path = ".arc/reference/rider";
    const output = trees({
      [BASE]: `${trees()[BASE]}${line("100644", "blob", RIDER_BLOB, path)}`,
      [SOURCE]: `${trees()[SOURCE]}${line("040000", "tree", RIDER_TREE, path)}`,
      [RESULT]: `${trees()[RESULT]}${line("100644", "blob", RIDER_BLOB, path)}`,
    });
    const deps = adapter(output);

    await expect(planGitV3RetirementDelta({ cwd: "/repo", ...deps }, input())).resolves.toEqual({
      status: "refused",
      refusal: { code: "unexpected-object-kind", path },
    });
  });

  it("closes malformed tree output as a typed Git read refusal", async () => {
    const deps = adapter({ ...trees(), [SOURCE]: "not an ls-tree record\0" });

    await expect(planGitV3RetirementDelta({ cwd: "/repo", ...deps }, input())).resolves.toEqual({
      status: "refused",
      refusal: { code: "git-read-failed" },
    });
  });
});
