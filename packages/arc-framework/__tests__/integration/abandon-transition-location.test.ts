import { mkdir, mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { renderMetaProjectionFile } from "../../src/lib/active/meta-reader.js";
import { gitTransitionResultDigest } from "../../src/lib/work-unit/retirement-authority.js";
import type { ManagedPath } from "../../src/lib/canonical/managed-path.js";
import { createExecaGitExec } from "../../src/lib/git/process-executor.js";
import {
  abandonTransitionLocationRefusal,
  locateAbandonTransition,
  validateGitTransitionRetirementEvidence,
} from "../../src/lib/work-unit/git-retirement-authorization-context.js";

const branch = "feat/sample";
const metaPath = ".arc/active/meta-sample.md";
const specPath = ".arc/active/spec-sample.md";
const transitionPath = ".arc/system/.internal/transitions/sample.json";
const roadmapPath = ".arc/backlog/ROADMAP.md";

const roots: string[] = [];

async function createRepository(options: {
  sourceDir?: string;
  cohort?: string;
  malformedMeta?: boolean;
  duplicateMetaPath?: string;
  keepSpec?: boolean;
  extraResultPath?: string;
} = {}): Promise<{
  root: string;
  sourceHead: string;
  resultHead: string;
  metaPath: string;
  specPath: string;
  exec: ReturnType<typeof createExecaGitExec>;
}> {
  const root = await mkdtemp(join(tmpdir(), "arc-abandon-location-"));
  roots.push(root);
  const rawExec = createExecaGitExec();
  const exec: ReturnType<typeof createExecaGitExec> = async (cmd, args, options) => await rawExec(
    cmd,
    args,
    { ...options, cwd: root },
  );
  await exec("git", ["init", "-b", branch]);
  await exec("git", ["config", "user.name", "ARC Test"]);
  await exec("git", ["config", "user.email", "arc@example.test"]);
  const sourceDir = options.sourceDir ?? ".arc/active";
  const sourceMetaPath = `${sourceDir}/meta-sample.md`;
  const sourceSpecPath = `${sourceDir}/spec-sample.md`;
  await mkdir(join(root, sourceDir), { recursive: true });
  const meta = options.malformedMeta
    ? "# malformed\n"
    : renderMetaProjectionFile("sample", {
    State: sourceDir.includes("/planned/") ? "Planned" : "Active",
    Branch: branch,
    Cohort: options.cohort ?? "[none]",
  });
  await writeFile(join(root, sourceMetaPath), meta);
  await writeFile(join(root, sourceSpecPath), "# Sample\n");
  if (options.duplicateMetaPath !== undefined) {
    await mkdir(join(root, options.duplicateMetaPath, ".."), { recursive: true });
    await writeFile(join(root, options.duplicateMetaPath), meta);
  }
  await mkdir(join(root, ".arc/backlog"), { recursive: true });
  await writeFile(join(root, roadmapPath), "- sample\n");
  await exec("git", ["add", "."]);
  await exec("git", ["commit", "-m", "source"]);
  const sourceHead = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();

  await unlink(join(root, sourceMetaPath));
  if (!options.keepSpec) await unlink(join(root, sourceSpecPath));
  if (options.duplicateMetaPath !== undefined) await unlink(join(root, options.duplicateMetaPath));
  await writeFile(join(root, roadmapPath), "");
  await mkdir(join(root, ".arc/system/.internal/transitions"), { recursive: true });
  await writeFile(join(root, transitionPath), JSON.stringify({
    schemaVersion: 1,
    origin: "sample",
    kind: "abandon",
    successors: [],
    edges: [],
  }));
  if (options.extraResultPath !== undefined) {
    await mkdir(join(root, options.extraResultPath, ".."), { recursive: true });
    await writeFile(join(root, options.extraResultPath), "unrelated\n");
  }
  await exec("git", ["add", "."]);
  await exec("git", ["commit", "-m", "abandon"]);
  const resultHead = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  return { root, sourceHead, resultHead, metaPath: sourceMetaPath, specPath: sourceSpecPath, exec };
}

async function locate(
  repo: Awaited<ReturnType<typeof createRepository>>,
  params: { baseRef?: string; head?: string; name?: string; requestBranch?: string } = {},
) {
  return await locateAbandonTransition(
    repo.exec,
    params.baseRef ?? repo.resultHead,
    {
      subject: { kind: "work-unit", name: params.name ?? "sample" },
      branch: params.requestBranch ?? branch,
      head: params.head ?? repo.resultHead,
      remote: "origin",
      requestedMode: "abandoned",
    },
    async (ref, path: ManagedPath) => {
      try {
        const { stdout } = await repo.exec("git", ["show", `${ref}:${path}`]);
        return new TextEncoder().encode(stdout);
      } catch {
        return null;
      }
    },
  );
}

function readRepoBlob(repo: Awaited<ReturnType<typeof createRepository>>) {
  return async (ref: string, path: ManagedPath): Promise<Uint8Array | null> => {
    try {
      const { stdout } = await repo.exec("git", ["show", `${ref}:${path}`]);
      return new TextEncoder().encode(stdout);
    } catch {
      return null;
    }
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true })));
});

describe("structural abandon transition location", () => {
  it("maps closed locator states to existing authorization refusals", () => {
    expect(abandonTransitionLocationRefusal({ status: "absent" })).toBe("evidence-missing");
    expect(abandonTransitionLocationRefusal({ status: "ambiguous" })).toBe("authority-ambiguous");
    expect(abandonTransitionLocationRefusal({ status: "unavailable" })).toBe("authority-unavailable");
    expect(abandonTransitionLocationRefusal({
      status: "unique",
      proof: { topology: "direct", sourceHead: "a", resultHead: "b", sourceArtifacts: [] },
    })).toBeNull();
  });

  it("accepts an exact single-parent direct transition without reading transition-record bytes", async () => {
    const repo = await createRepository();
    const readPaths: string[] = [];

    const located = await locateAbandonTransition(
      repo.exec,
      repo.resultHead,
      {
        subject: { kind: "work-unit", name: "sample" },
        branch,
        head: repo.resultHead,
        remote: "origin",
        requestedMode: "abandoned",
      },
      async (ref, path: ManagedPath) => {
        readPaths.push(path);
        try {
          const { stdout } = await repo.exec("git", ["show", `${ref}:${path}`]);
          return new TextEncoder().encode(stdout);
        } catch {
          return null;
        }
      },
    );

    expect(located).toMatchObject({
      status: "unique",
      proof: {
        topology: "direct",
        sourceHead: repo.sourceHead,
        resultHead: repo.resultHead,
        sourceArtifacts: [
          { path: metaPath, state: "present" },
          { path: specPath, state: "present" },
        ],
      },
    });
    expect(readPaths).not.toContain(transitionPath);
  });

  it("accepts the unique landed transition reachable from the selected base", async () => {
    const repo = await createRepository();

    await expect(locate(repo, { head: repo.sourceHead })).resolves.toMatchObject({
      status: "unique",
      proof: {
        topology: "landed",
        sourceHead: repo.sourceHead,
        resultHead: repo.resultHead,
      },
    });
  });

  it("replays a valid abandon stamp from its pinned transition heads", async () => {
    const repo = await createRepository();
    const evidence = {
      kind: "git-transition" as const,
      transition: "abandon" as const,
      resultDigest: gitTransitionResultDigest({
        transition: "abandon",
        subject: { kind: "work-unit", name: "sample" },
        branch,
        retiringHead: repo.resultHead,
        resultHead: repo.resultHead,
        resultInventory: [],
      }),
    };

    await expect(validateGitTransitionRetirementEvidence(
      repo.exec,
      repo.resultHead,
      {
        subject: { kind: "work-unit", name: "sample" },
        branch,
        retiringHead: repo.resultHead,
        authorization: "discard-confirmed",
        evidence,
      },
      readRepoBlob(repo),
    )).resolves.toBe(true);
  });

  it("rejects abandon replay copied across any stamped identity or proof field", async () => {
    const repo = await createRepository();
    const resultDigest = gitTransitionResultDigest({
      transition: "abandon",
      subject: { kind: "work-unit", name: "sample" },
      branch,
      retiringHead: repo.resultHead,
      resultHead: repo.resultHead,
      resultInventory: [],
    });
    const valid = {
      subject: { kind: "work-unit", name: "sample" } as const,
      branch,
      retiringHead: repo.resultHead,
      authorization: "discard-confirmed" as const,
      evidence: { kind: "git-transition" as const, transition: "abandon" as const, resultDigest },
    };
    const cases = [
      { ...valid, subject: { kind: "work-unit", name: "other" } as const },
      { ...valid, branch: "feat/other" },
      { ...valid, retiringHead: repo.sourceHead },
      { ...valid, authorization: "planning-relocated" as const },
      { ...valid, evidence: { ...valid.evidence, resultDigest: `sha256:${"f".repeat(64)}` as const } },
      {
        ...valid,
        authorization: "planning-relocated" as const,
        evidence: { ...valid.evidence, transition: "park-planning" as const },
      },
    ];

    for (const candidate of cases) {
      await expect(validateGitTransitionRetirementEvidence(
        repo.exec,
        repo.resultHead,
        candidate,
        readRepoBlob(repo),
      )).resolves.toBe(false);
    }
  });

  it.each([
    ["unrelated relevant change", { extraResultPath: ".arc/active/unrelated.md" }],
    ["surviving subject artifact", { keepSpec: true }],
    ["malformed source meta", { malformedMeta: true }],
    ["duplicate source meta", { duplicateMetaPath: ".arc/backlog/provisional/sample/meta-sample.md" }],
    [
      "cohort-inconsistent planned group",
      { sourceDir: ".arc/backlog/planned/wrong/sample", cohort: "expected" },
    ],
  ] as const)("refuses a transition with %s", async (_label, options) => {
    const repo = await createRepository(options);

    await expect(locate(repo)).resolves.toEqual({ status: "absent" });
  });

  it("returns absent for the wrong subject, branch, or unreachable base", async () => {
    const repo = await createRepository();

    await expect(locate(repo, { name: "other" })).resolves.toEqual({ status: "absent" });
    await expect(locate(repo, { requestBranch: "feat/other" })).resolves.toEqual({ status: "absent" });
    await expect(locate(repo, { baseRef: repo.sourceHead, head: repo.sourceHead })).resolves.toEqual({
      status: "absent",
    });
  });

  it("refuses root and merge heads as direct transition topology", async () => {
    const repo = await createRepository();
    const rootHead = (await repo.exec("git", ["rev-list", "--max-parents=0", "HEAD"])).stdout.trim();
    await expect(locate(repo, { baseRef: rootHead, head: rootHead })).resolves.toEqual({ status: "absent" });

    await repo.exec("git", ["checkout", "-b", "merge-base", repo.sourceHead]);
    await repo.exec("git", ["checkout", "-b", "side"]);
    await writeFile(join(repo.root, "side.txt"), "side\n");
    await execCommit(repo, "side");
    await repo.exec("git", ["checkout", "merge-base"]);
    await writeFile(join(repo.root, "base.txt"), "base\n");
    await execCommit(repo, "base");
    await repo.exec("git", ["merge", "--no-ff", "side", "-m", "merge"]);
    const mergeHead = (await repo.exec("git", ["rev-parse", "HEAD"])).stdout.trim();

    await expect(locate(repo, { baseRef: mergeHead, head: mergeHead })).resolves.toEqual({ status: "absent" });
  });

  it("returns unavailable when the selected authority ref cannot be resolved", async () => {
    const repo = await createRepository({ extraResultPath: ".arc/active/unrelated.md" });

    await expect(locate(repo, { baseRef: "refs/heads/missing" })).resolves.toEqual({ status: "unavailable" });
  });

  it("returns ambiguous when the selected base contains two valid abandon transitions", async () => {
    const repo = await createRepository();
    await mkdir(join(repo.root, ".arc/active"), { recursive: true });
    await writeFile(join(repo.root, metaPath), renderMetaProjectionFile("sample", {
      State: "Active",
      Branch: branch,
      Cohort: "[none]",
    }));
    await writeFile(join(repo.root, specPath), "# Sample\n");
    await execCommit(repo, "restore");
    await unlink(join(repo.root, metaPath));
    await unlink(join(repo.root, specPath));
    await execCommit(repo, "abandon again");
    const secondResult = (await repo.exec("git", ["rev-parse", "HEAD"])).stdout.trim();

    await expect(locate(repo, { baseRef: secondResult, head: repo.sourceHead })).resolves.toEqual({
      status: "ambiguous",
    });
    await expect(validateGitTransitionRetirementEvidence(
      repo.exec,
      secondResult,
      {
        subject: { kind: "work-unit", name: "sample" },
        branch,
        retiringHead: repo.sourceHead,
        authorization: "discard-confirmed",
        evidence: {
          kind: "git-transition",
          transition: "abandon",
          resultDigest: `sha256:${"a".repeat(64)}`,
        },
      },
      readRepoBlob(repo),
    )).resolves.toBe(false);
  });
});

async function execCommit(
  repo: Awaited<ReturnType<typeof createRepository>>,
  message: string,
): Promise<void> {
  await repo.exec("git", ["add", "-A"]);
  await repo.exec("git", ["commit", "-m", message]);
}
