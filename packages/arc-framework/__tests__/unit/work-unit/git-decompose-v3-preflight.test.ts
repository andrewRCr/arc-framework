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
  planning?: { design?: string[]; taskList?: string | null },
): Uint8Array {
  return encoder.encode(renderMetaFile(slug, {
    state,
    owner: "andrew",
    branch,
    design: planning?.design ?? [`draft-${slug}.md`],
    ...(planning !== undefined && "taskList" in planning ? { taskList: planning.taskList } : {}),
    dependsOn,
  }));
}

async function preflightFromBasePlanning(options: {
  design: string[];
  artifacts: string[];
  taskList?: string | null;
}) {
  const base = "refs/heads/main";
  const baseHead = "a".repeat(40);
  const metaPath = ".arc/backlog/planned/origin/meta-origin.md";
  const artifactPaths = options.artifacts.map((name) =>
    `.arc/backlog/planned/origin/${name}`);
  const listing = [
    `100644 blob ${metaPath}`,
    ...artifactPaths.map((path) => `100644 blob ${path}`),
  ].join("\0") + "\0";
  const blobs = new Map<string, Uint8Array>([
    [`${baseHead}:${metaPath}`, meta("origin", "Planning", null, [], {
      design: options.design,
      ...("taskList" in options ? { taskList: options.taskList } : {}),
    })],
    ...artifactPaths.map((path) => [
      `${baseHead}:${path}`,
      encoder.encode("# Design\n\n## Scope\n"),
    ] as const),
  ]);
  return await createGitV3DecomposePreflight({
    cwd: "/repo",
    exec: async (_command, args) => args[0] === "for-each-ref"
      ? { stdout: `${base}\0${baseHead}\0`, stderr: "" }
      : { stdout: listing, stderr: "" },
    readBlob: async (ref, path) => blobs.get(`${ref}:${path}`) ?? null,
  }, "main", "origin");
}

describe("createGitV3DecomposePreflight", () => {
  it("infers each sanctioned planning profile from exact metadata pointers and stored artifacts", async () => {
    const cases = [
      {
        design: ["draft-origin.md"],
        artifacts: ["draft-origin.md"],
        profile: { kind: "draft", sourceDesign: ["draft-origin.md"] },
      },
      {
        design: ["spec-origin.md"],
        artifacts: ["spec-origin.md"],
        profile: { kind: "single-spec", sourceDesign: ["spec-origin.md"] },
      },
      {
        design: ["spec-origin-prd.md", "spec-origin-rfc.md"],
        artifacts: ["spec-origin-prd.md", "spec-origin-rfc.md"],
        profile: {
          kind: "paired-spec",
          sourceDesign: ["spec-origin-prd.md", "spec-origin-rfc.md"],
        },
      },
    ] as const;

    for (const profileCase of cases) {
      const result = await preflightFromBasePlanning({
        design: [...profileCase.design],
        artifacts: [...profileCase.artifacts],
      });

      expect(result).toMatchObject({
        status: "ready",
        preflight: { starterMap: { machine: { planningProfile: profileCase.profile } } },
      });
    }
  });

  it("refuses invalid design authority at its exact metadata or artifact locus", async () => {
    const metaLocus = ".arc/backlog/planned/origin/meta-origin.md#Design";
    const invalidMetadata = [
      { design: [], artifacts: [] },
      { design: ["draft-origin.md", "spec-origin.md"], artifacts: ["draft-origin.md", "spec-origin.md"] },
      { design: ["spec-origin.md", "spec-origin.md"], artifacts: ["spec-origin.md"] },
      { design: ["spec-other.md"], artifacts: ["spec-other.md"] },
      { design: ["spec-origin.md", "rfc-origin.md"], artifacts: ["spec-origin.md", "rfc-origin.md"] },
      {
        design: ["spec-origin-rfc.md", "spec-origin-prd.md"],
        artifacts: ["spec-origin-rfc.md", "spec-origin-prd.md"],
      },
    ];

    for (const invalid of invalidMetadata) {
      await expect(preflightFromBasePlanning(invalid)).resolves.toEqual({
        status: "rejected",
        reason: "planning-profile",
        locus: metaLocus,
      });
    }

    await expect(preflightFromBasePlanning({
      design: ["spec-origin.md"],
      artifacts: [],
    })).resolves.toEqual({
      status: "rejected",
      reason: "planning-profile",
      locus: ".arc/backlog/planned/origin/spec-origin.md",
    });
  });

  it("accepts only task-list authority consistent with the inferred profile and exact inventory", async () => {
    await expect(preflightFromBasePlanning({
      design: ["spec-origin.md"],
      artifacts: ["spec-origin.md", "tasks-origin.md"],
      taskList: null,
    })).resolves.toMatchObject({
      status: "ready",
      preflight: {
        starterMap: {
          machine: { planningProfile: { kind: "single-spec" } },
        },
      },
    });
    await expect(preflightFromBasePlanning({
      design: ["spec-origin.md"],
      artifacts: ["spec-origin.md", "tasks-origin.md"],
      taskList: "tasks-origin.md",
    })).resolves.toMatchObject({ status: "ready" });

    await expect(preflightFromBasePlanning({
      design: ["draft-origin.md"],
      artifacts: ["draft-origin.md", "tasks-origin.md"],
      taskList: "tasks-origin.md",
    })).resolves.toEqual({
      status: "rejected",
      reason: "planning-profile",
      locus: ".arc/backlog/planned/origin/meta-origin.md#Task List",
    });
    await expect(preflightFromBasePlanning({
      design: ["spec-origin.md"],
      artifacts: ["spec-origin.md", "tasks-origin.md"],
      taskList: "tasks-other.md",
    })).resolves.toEqual({
      status: "rejected",
      reason: "planning-profile",
      locus: ".arc/backlog/planned/origin/meta-origin.md#Task List",
    });
    await expect(preflightFromBasePlanning({
      design: ["spec-origin.md"],
      artifacts: ["spec-origin.md"],
      taskList: "tasks-origin.md",
    })).resolves.toEqual({
      status: "rejected",
      reason: "planning-profile",
      locus: ".arc/backlog/planned/origin/tasks-origin.md",
    });
  });

  it("selects committed local source bytes and derives dependency edges from the same tree", async () => {
    const base = "refs/heads/main";
    const source = "refs/heads/plan/origin";
    const baseHead = "a".repeat(40);
    const sourceHead = "b".repeat(40);
    const blobs = new Map<string, Uint8Array>([
      [`${baseHead}:.arc/backlog/planned/origin/meta-origin.md`, meta("origin", "Planning", null)],
      [`${baseHead}:.arc/backlog/planned/origin/draft-origin.md`, encoder.encode("# Draft\n\n## Base\n")],
      [`${sourceHead}:.arc/active/meta-origin.md`, meta("origin", "Planning", "plan/origin", ["foundation"])],
      [`${sourceHead}:.arc/active/draft-origin.md`, encoder.encode("# Draft\n\n## Source\n")],
      [`${sourceHead}:.arc/active/meta-consumer.md`, meta("consumer", "Active", "feat/consumer", ["origin"])],
      [`${sourceHead}:.arc/active/draft-consumer.md`, encoder.encode("# Consumer\n")],
    ]);
    const listings = new Map<string, string>([
      [baseHead, [
        "100644 blob .arc/backlog/planned/origin/meta-origin.md",
        "100644 blob .arc/backlog/planned/origin/draft-origin.md",
      ].join("\0") + "\0"],
      [sourceHead, [
        "100644 blob .arc/active/meta-origin.md",
        "100644 blob .arc/active/draft-origin.md",
        "100644 blob .arc/active/meta-consumer.md",
        "100644 blob .arc/active/draft-consumer.md",
      ].join("\0") + "\0"],
    ]);
    const exec = vi.fn(async (_command: string, args: string[]) => {
      if (args[0] === "for-each-ref") {
        return { stdout: `${base}\0${baseHead}\0${source}\0${sourceHead}\0`, stderr: "" };
      }
      const head = args.find((arg) => /^[0-9a-f]{40}$/u.test(arg));
      return { stdout: listings.get(head ?? "") ?? "", stderr: "" };
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
      head: sourceHead,
    });
    expect(result.preflight.starterMap.machine.incomingEdges).toEqual([
      expect.objectContaining({ dependent: "consumer", currentTargets: ["origin"] }),
    ]);
    expect(result.preflight.starterMap.machine.outgoingEdges).toEqual([
      expect.objectContaining({ prerequisite: "foundation" }),
    ]);
    expect(result.preflight.starterMap.machine.sourceUnits).toHaveLength(2);
    expect(exec).not.toHaveBeenCalledWith("git", expect.arrayContaining(["refs/remotes"]), expect.anything());
    expect(exec).not.toHaveBeenCalledWith("git", expect.arrayContaining(["status"]), expect.anything());
  });

  it("refuses an invalid selected source profile instead of hiding it behind base fallback", async () => {
    const base = "refs/heads/main";
    const source = "refs/heads/plan/origin";
    const baseHead = "a".repeat(40);
    const sourceHead = "b".repeat(40);
    const listings = new Map([
      [baseHead, [
        "100644 blob .arc/backlog/planned/origin/meta-origin.md",
        "100644 blob .arc/backlog/planned/origin/draft-origin.md",
      ].join("\0") + "\0"],
      [sourceHead, [
        "100644 blob .arc/active/meta-origin.md",
      ].join("\0") + "\0"],
    ]);
    const blobs = new Map([
      [`${baseHead}:.arc/backlog/planned/origin/meta-origin.md`, meta("origin", "Planning", null)],
      [`${baseHead}:.arc/backlog/planned/origin/draft-origin.md`, encoder.encode("# Draft\n")],
      [`${sourceHead}:.arc/active/meta-origin.md`, meta("origin", "Planning", "plan/origin", [], {
        design: [],
      })],
    ]);
    const result = await createGitV3DecomposePreflight({
      cwd: "/repo",
      exec: async (_command, args) => {
        if (args[0] === "for-each-ref") {
          return { stdout: `${base}\0${baseHead}\0${source}\0${sourceHead}\0`, stderr: "" };
        }
        const head = args.find((arg) => /^[0-9a-f]{40}$/u.test(arg));
        return { stdout: listings.get(head ?? "") ?? "", stderr: "" };
      },
      readBlob: async (ref, path) => blobs.get(`${ref}:${path}`) ?? null,
    }, "main", "origin");

    expect(result).toEqual({
      status: "rejected",
      reason: "planning-profile",
      locus: ".arc/active/meta-origin.md#Design",
    });
  });

  it("reports malformed origin lifecycle metadata at its committed-tree locus", async () => {
    const base = "refs/heads/main";
    const baseHead = "a".repeat(40);
    const metaPath = ".arc/backlog/planned/origin/meta-origin.md";
    const malformed = new TextDecoder().decode(meta("origin", "Planning", null))
      .replace("`Planning`", "[none]");

    const result = await createGitV3DecomposePreflight({
      cwd: "/repo",
      exec: async (_command, args) => args[0] === "for-each-ref"
        ? { stdout: `${base}\0${baseHead}\0`, stderr: "" }
        : { stdout: `100644 blob ${metaPath}\0`, stderr: "" },
      readBlob: async (_ref, path) => path === metaPath ? encoder.encode(malformed) : null,
    }, "main", "origin");

    expect(result).toEqual({
      status: "rejected",
      reason: "git-preflight:invalid-origin-meta",
      locus: metaPath,
    });
  });

  it("fails closed when the configured local base is absent", async () => {
    const result = await createGitV3DecomposePreflight({
      cwd: "/repo",
      exec: async () => ({ stdout: "refs/heads/other\0abc\0", stderr: "" }),
      readBlob: async () => null,
    }, "main", "origin");

    expect(result).toEqual({ status: "rejected", reason: "git-preflight:missing-base" });
  });

  it("returns the same pinned source from every attached or detached invocation checkout", async () => {
    const base = "refs/heads/main";
    const source = "refs/heads/plan/origin";
    const baseHead = "a".repeat(40);
    const sourceHead = "b".repeat(40);
    const listings = new Map([
      [baseHead, [
        "100644 blob .arc/backlog/planned/origin/meta-origin.md",
        "100644 blob .arc/backlog/planned/origin/draft-origin.md",
      ].join("\0") + "\0"],
      [sourceHead, [
        "100644 blob .arc/active/meta-origin.md",
        "100644 blob .arc/active/draft-origin.md",
        "100644 blob .arc/active/meta-consumer.md",
      ].join("\0") + "\0"],
    ]);
    const blobs = new Map([
      [`${baseHead}:.arc/backlog/planned/origin/meta-origin.md`, meta("origin", "Planning", null)],
      [`${baseHead}:.arc/backlog/planned/origin/draft-origin.md`, encoder.encode("# Draft\n\n## Base\n")],
      [`${sourceHead}:.arc/active/meta-origin.md`, meta("origin", "Planning", "plan/origin", ["foundation"])],
      [`${sourceHead}:.arc/active/draft-origin.md`, encoder.encode("# Draft\n\n## Source\n")],
      [`${sourceHead}:.arc/active/meta-consumer.md`, meta("consumer", "Active", "feat/consumer", ["origin"])],
    ]);
    const exec = vi.fn(async (_command: string, args: string[]) => {
      if (args[0] === "for-each-ref") {
        return { stdout: `${base}\0${baseHead}\0${source}\0${sourceHead}\0`, stderr: "" };
      }
      const head = args.find((arg) => /^[0-9a-f]{40}$/u.test(arg));
      return { stdout: listings.get(head ?? "") ?? "", stderr: "" };
    });
    const checkouts = ["/primary", "/base", "/source", "/unrelated", "/detached"];

    const results = await Promise.all(checkouts.map(async (cwd) =>
      await createGitV3DecomposePreflight({
        cwd,
        exec,
        readBlob: async (ref, path) => blobs.get(`${ref}:${path}`) ?? null,
      }, "main", "origin")));

    expect(results.every((result) => result.status === "ready")).toBe(true);
    expect(results.slice(1)).toEqual(results.slice(1).map(() => results[0]));
    expect(exec.mock.calls.every(([, args]) =>
      args[0] === "for-each-ref" || args[0] === "ls-tree")).toBe(true);
    expect(exec.mock.calls.filter(([, args]) => args[0] === "for-each-ref")
      .every(([, args]) => args.at(-1) === "refs/heads")).toBe(true);
  });

  it("fails closed when the enumerated base object cannot supply its committed tree", async () => {
    const base = "refs/heads/main";
    const baseHead = "a".repeat(40);
    const result = await createGitV3DecomposePreflight({
      cwd: "/repo",
      exec: async (_command, args) => {
        if (args[0] === "for-each-ref") {
          return { stdout: `${base}\0${baseHead}\0`, stderr: "" };
        }
        throw new Error("missing-enumerated-base-object");
      },
      readBlob: async () => null,
    }, "main", "origin");

    expect(result).toEqual({
      status: "rejected",
      reason: "git-preflight:missing-enumerated-base-object",
    });
  });
});
