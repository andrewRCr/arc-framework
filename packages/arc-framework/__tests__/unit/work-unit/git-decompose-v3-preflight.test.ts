import { describe, expect, it, vi } from "vitest";

import { renderMetaFile } from "../../../src/lib/active/meta-reader.js";
import {
  createGitV3DecomposePreflight,
} from "../../../src/lib/work-unit/git-decompose-v3-preflight.js";

const encoder = new TextEncoder();

function meta(
  slug: string,
  state: "Planning" | "Active",
  branch: string | null,
  dependsOn: string[] = [],
): Uint8Array {
  return encoder.encode(renderMetaFile(slug, {
    state,
    owner: "andrew",
    branch,
    design: [`draft-${slug}.md`],
    dependsOn,
  }));
}

describe("createGitV3DecomposePreflight", () => {
  it("selects committed local source bytes and derives dependency edges from the same tree", async () => {
    const base = "refs/heads/main";
    const source = "refs/heads/plan/origin";
    const blobs = new Map<string, Uint8Array>([
      [`${base}:.arc/backlog/planned/origin/meta-origin.md`, meta("origin", "Planning", null)],
      [`${base}:.arc/backlog/planned/origin/draft-origin.md`, encoder.encode("# Draft\n\n## Base\n")],
      [`${source}:.arc/active/meta-origin.md`, meta("origin", "Planning", "plan/origin", ["foundation"])],
      [`${source}:.arc/active/draft-origin.md`, encoder.encode("# Draft\n\n## Source\n")],
      [`${source}:.arc/active/meta-consumer.md`, meta("consumer", "Active", "feat/consumer", ["origin"])],
      [`${source}:.arc/active/draft-consumer.md`, encoder.encode("# Consumer\n")],
    ]);
    const listings = new Map<string, string>([
      [base, [
        "100644 blob .arc/backlog/planned/origin/meta-origin.md",
        "100644 blob .arc/backlog/planned/origin/draft-origin.md",
      ].join("\0") + "\0"],
      [source, [
        "100644 blob .arc/active/meta-origin.md",
        "100644 blob .arc/active/draft-origin.md",
        "100644 blob .arc/active/meta-consumer.md",
        "100644 blob .arc/active/draft-consumer.md",
      ].join("\0") + "\0"],
    ]);
    const exec = vi.fn(async (_command: string, args: string[]) => {
      if (args[0] === "for-each-ref") {
        return { stdout: `${base}\0${"a".repeat(40)}\0${source}\0${"b".repeat(40)}\0`, stderr: "" };
      }
      const ref = args.find((arg) => arg.startsWith("refs/heads/"));
      return { stdout: listings.get(ref ?? "") ?? "", stderr: "" };
    });

    const result = await createGitV3DecomposePreflight({
      cwd: "/repo",
      exec,
      readBlob: async (ref, path) => blobs.get(`${ref}:${path}`) ?? null,
    }, "main", "origin");

    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.preflight.starterMap.machine.source).toMatchObject({
      ref: source,
      logicalBranch: "plan/origin",
      head: "b".repeat(40),
    });
    expect(result.preflight.starterMap.machine.incomingEdges).toEqual([
      expect.objectContaining({ dependent: "consumer", currentTargets: ["origin"] }),
    ]);
    expect(result.preflight.starterMap.machine.outgoingEdges).toEqual([
      expect.objectContaining({ prerequisite: "foundation" }),
    ]);
    expect(result.preflight.starterMap.machine.sourceUnits).toHaveLength(2);
    expect(exec).not.toHaveBeenCalledWith("git", expect.arrayContaining(["refs/remotes"]), expect.anything());
  });

  it("fails closed when the configured local base is absent", async () => {
    const result = await createGitV3DecomposePreflight({
      cwd: "/repo",
      exec: async () => ({ stdout: "refs/heads/other\0abc\0", stderr: "" }),
      readBlob: async () => null,
    }, "main", "origin");

    expect(result).toEqual({ status: "rejected", reason: "git-preflight:missing-base" });
  });
});
