/** Built-CLI coverage for decomposition execution and base mobility. */

import { chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { delimiter, dirname, join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseMetaRecord, renderMetaFile } from "../../src/lib/active/meta-reader.js";
import { canonicalize } from "../../src/lib/canonical/canonical-json.js";
import {
  resolveV3DecomposeContentLocator,
  scanV3DecomposeContent,
} from "../../src/lib/work-unit/decompose-content.js";
import {
  cleanupTempDir,
  createTempRepo,
  git,
  runArcNoTty,
  type RunResult,
} from "./helpers.js";

async function write(repo: string, path: string, content: string): Promise<void> {
  const absolute = join(repo, path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
}

async function startedRepository(options: {
  protection?: "full" | "partial";
  heterogeneous?: boolean;
} = {}): Promise<string> {
  const repo = await createTempRepo("arc-decompose-command-");
  const protection = options.protection ?? "full";
  const draft = `# Draft: origin

- **Origin:** [internal]
- **Purpose:** Split the concern.

---

## Problem / Motivation

One concern.

## Alternatives

One alternative.

## Unknowns and Assumptions

One unknown.

## Scope Estimate

Medium.
`;
  await write(
    repo,
    ".arc/system/arc-config.yml",
    `branch.base: main\nbranch.protection: ${protection}\npm.mode: arc-in-git\n`,
  );
  await write(repo, ".arc/backlog/ROADMAP.md", "# Roadmap: Project Status\n");
  await write(repo, ".arc/backlog/planned/origin/draft-origin.md", draft);
  await write(repo, ".arc/backlog/planned/origin/meta-origin.md", renderMetaFile("origin", {
    state: "Planning",
    owner: "test-user",
    workClass: "Heavy",
    priority: "P1",
    origin: "internal",
    design: ["draft-origin.md"],
    dependsOn: options.heterogeneous ? ["dependency"] : [],
    currentWorkflow: "draft-design",
    nextAction: "Begin draft-design",
  }));
  await write(repo, ".arc/reference/shared.txt", "shared\n");
  if (options.heterogeneous) {
    await write(
      repo,
      ".arc/reference/shared.md",
      "# Shared home\n\n"
        + "## Retained prefix\n\nKeep this prefix byte-for-byte.\n\n"
        + "## Allocation target\n\nReplace only this allocated section.\n\n"
        + "## Retained suffix\n\nKeep this suffix byte-for-byte.\n",
    );
    await write(
      repo,
      ".arc/backlog/planned/dependency/draft-dependency.md",
      "# Draft: dependency\n",
    );
    await write(
      repo,
      ".arc/backlog/planned/dependency/meta-dependency.md",
      renderMetaFile("dependency", {
        state: "Planning",
        owner: "test-user",
        workClass: "Light",
        priority: "P2",
        origin: "internal",
        design: ["draft-dependency.md"],
        currentWorkflow: "draft-design",
        nextAction: "Begin draft-design",
      }),
    );
    await write(repo, ".arc/backlog/planned/existing/draft-existing.md", "# Draft: existing\n");
    await write(
      repo,
      ".arc/backlog/planned/existing/meta-existing.md",
      renderMetaFile("existing", {
        state: "Planning",
        owner: "test-user",
        workClass: "Light",
        priority: "P2",
        origin: "internal",
        design: ["draft-existing.md"],
        dependsOn: ["origin"],
        currentWorkflow: "draft-design",
        nextAction: "Begin draft-design",
      }),
    );
  }
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "prepare base"]);
  await git(repo, ["switch", "-c", "plan/origin"]);
  await mkdir(join(repo, ".arc/active"), { recursive: true });
  await git(repo, [
    "mv",
    ".arc/backlog/planned/origin/draft-origin.md",
    ".arc/active/draft-origin.md",
  ]);
  await git(repo, [
    "mv",
    ".arc/backlog/planned/origin/meta-origin.md",
    ".arc/active/meta-origin.md",
  ]);
  await write(repo, ".arc/active/meta-origin.md", renderMetaFile("origin", {
    state: "Planning",
    owner: "test-user",
    branch: "plan/origin",
    workClass: "Heavy",
    priority: "P1",
    origin: "internal",
    design: ["draft-origin.md"],
    dependsOn: options.heterogeneous ? ["dependency"] : [],
    currentWorkflow: "draft-design",
    nextAction: "Begin draft-design",
  }));
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "start origin"]);
  await git(repo, ["init", "--bare", ".git/test-origin.git"]);
  await git(repo, ["remote", "add", "origin", ".git/test-origin.git"]);
  await git(repo, ["push", "--set-upstream", "origin", "plan/origin"]);
  await git(repo, ["switch", "main"]);
  return repo;
}

async function writeCompletedCutMap(repo: string): Promise<string> {
  const preflight = await runArcNoTty(["decompose", "origin", "--preflight"], repo);
  expect(preflight.exitCode, preflight.stderr).toBe(0);
  const starter = JSON.parse(preflight.stdout) as {
    schemaVersion: 3;
    machine: {
      sourceUnits: Array<{ sourceId: string; sourceLocator: unknown }>;
    };
  };
  const completed = {
    schemaVersion: 3,
    machine: (starter as { machine: unknown }).machine,
    authoring: {
      shape: "heterogeneous",
      placement: { kind: "direct-member" },
      destinations: [
        {
          kind: "existing-home",
          destinationId: "existing",
          target: { kind: "document", path: ".arc/reference/shared.txt" },
        },
        {
          kind: "new-member",
          destinationId: "member",
          slug: "member",
          workClass: "Heavy",
        },
      ],
      internalEdges: [],
      sourceAllocations: starter.machine.sourceUnits.map((unit) => ({
        sourceId: unit.sourceId,
        ownership: "destination-owned",
        disposition: {
          kind: "target",
          destinationId: "member",
          targetLocator: {
            ...(unit.sourceLocator as object),
            artifact: "draft-member.md",
          },
        },
      })),
      incomingDispositions: [],
      outgoingDispositions: [],
    },
  };
  const cutMapPath = join(repo, "cut-map.json");
  await writeFile(cutMapPath, `${canonicalize(completed)}\n`);
  return cutMapPath;
}

async function writeExtractionCutMap(repo: string): Promise<string> {
  const preflight = await runArcNoTty(["decompose", "origin", "--preflight"], repo);
  expect(preflight.exitCode, preflight.stderr).toBe(0);
  const starter = JSON.parse(preflight.stdout) as {
    machine: {
      sourceUnits: Array<{
        sourceId: string;
        sourceLocator: { artifact: string; [key: string]: unknown };
      }>;
    };
  };
  expect(starter.machine.sourceUnits.length).toBeGreaterThan(2);
  const completed = {
    schemaVersion: 3,
    machine: starter.machine,
    authoring: {
      shape: "extraction",
      placement: { kind: "direct-member" },
      destinations: [{
        kind: "new-member",
        destinationId: "member",
        slug: "member",
        workClass: "Heavy",
      }],
      internalEdges: [],
      sourceAllocations: starter.machine.sourceUnits.map((unit, index) => ({
        sourceId: unit.sourceId,
        ownership: "destination-owned",
        disposition: index === 0
          ? { kind: "retained-origin" }
          : index === 1
            ? { kind: "drop", reason: "obsolete framing" }
            : {
                kind: "target",
                destinationId: "member",
                targetLocator: { ...unit.sourceLocator, artifact: "draft-member.md" },
              },
      })),
      incomingDispositions: [],
      outgoingDispositions: [],
    },
  };
  const cutMapPath = join(repo, "extraction-cut-map.json");
  await writeFile(cutMapPath, `${canonicalize(completed)}\n`);
  return cutMapPath;
}

async function writeMultiMemberCohortlessCutMap(repo: string): Promise<string> {
  const preflight = await runArcNoTty(["decompose", "origin", "--preflight"], repo);
  expect(preflight.exitCode, preflight.stderr).toBe(0);
  const starter = JSON.parse(preflight.stdout) as {
    machine: {
      sourceUnits: Array<{
        sourceId: string;
        sourceLocator: { artifact: string; [key: string]: unknown };
      }>;
    };
  };
  expect(starter.machine.sourceUnits.length).toBeGreaterThan(1);
  const completed = {
    schemaVersion: 3,
    machine: starter.machine,
    authoring: {
      shape: "symmetric",
      placement: { kind: "direct-member" },
      destinations: [
        {
          kind: "new-member",
          destinationId: "alpha",
          slug: "alpha",
          workClass: "Heavy",
        },
        {
          kind: "new-member",
          destinationId: "beta",
          slug: "beta",
          workClass: "Heavy",
        },
      ],
      internalEdges: [],
      sourceAllocations: starter.machine.sourceUnits.map((unit, index) => {
        const destinationId = index % 2 === 0 ? "alpha" : "beta";
        return {
          sourceId: unit.sourceId,
          ownership: "destination-owned",
          disposition: {
            kind: "target",
            destinationId,
            targetLocator: {
              ...unit.sourceLocator,
              artifact: `draft-${destinationId}.md`,
            },
          },
        };
      }),
      incomingDispositions: [],
      outgoingDispositions: [],
    },
  };
  const cutMapPath = join(repo, "multi-member-cut-map.json");
  await writeFile(cutMapPath, `${canonicalize(completed)}\n`);
  return cutMapPath;
}

async function writePartialHeterogeneousCutMap(repo: string): Promise<{
  cutMapPath: string;
  machine: {
    sourceUnits: Array<{
      sourceId: string;
      sourceLocator: { artifact: string; [key: string]: unknown };
    }>;
    incomingEdges: Array<{ edgeId: string }>;
    outgoingEdges: Array<{ edgeId: string }>;
  };
}> {
  const preflight = await runArcNoTty(["decompose", "origin", "--preflight"], repo);
  expect(preflight.exitCode, preflight.stderr).toBe(0);
  const starter = JSON.parse(preflight.stdout) as {
    machine: {
      sourceUnits: Array<{
        sourceId: string;
        sourceLocator: { artifact: string; [key: string]: unknown };
      }>;
      incomingEdges: Array<{ edgeId: string }>;
      outgoingEdges: Array<{ edgeId: string }>;
    };
  };
  expect(starter.machine.sourceUnits.length).toBeGreaterThan(1);
  expect(starter.machine.incomingEdges).toHaveLength(1);
  expect(starter.machine.outgoingEdges).toHaveLength(1);
  const completed = {
    schemaVersion: 3,
    machine: starter.machine,
    authoring: {
      shape: "heterogeneous",
      placement: { kind: "direct-member" },
      destinations: [
        {
          kind: "existing-home",
          destinationId: "document",
          target: { kind: "document", path: ".arc/reference/shared.md" },
        },
        {
          kind: "existing-home",
          destinationId: "existing",
          target: { kind: "work-unit", slug: "existing" },
        },
        {
          kind: "new-member",
          destinationId: "member",
          slug: "member",
          workClass: "Heavy",
        },
      ],
      internalEdges: [],
      sourceAllocations: starter.machine.sourceUnits.map((unit, index) => ({
        sourceId: unit.sourceId,
        ownership: "destination-owned",
        disposition: index === 0
          ? {
              kind: "target",
              destinationId: "document",
              targetLocator: {
                artifact: "shared.md",
                kind: "section",
                level: 2,
                headingSource: "Allocation target",
                ancestry: [],
                occurrence: 0,
              },
            }
          : {
              kind: "target",
              destinationId: "member",
              targetLocator: {
                ...unit.sourceLocator,
                artifact: "draft-member.md",
              },
            },
      })),
      incomingDispositions: starter.machine.incomingEdges.map(({ edgeId }) => ({
        edgeId,
        disposition: { kind: "replace", replacementTargets: ["member"] },
      })),
      outgoingDispositions: starter.machine.outgoingEdges.map(({ edgeId }) => ({
        edgeId,
        disposition: { kind: "targets", targets: ["member"] },
      })),
    },
  };
  const cutMapPath = join(repo, "partial-cut-map.json");
  await writeFile(cutMapPath, `${canonicalize(completed)}\n`);
  return { cutMapPath, machine: starter.machine };
}

async function claimDirectory(repo: string): Promise<string> {
  const commonDir = resolve(repo, await git(repo, ["rev-parse", "--git-common-dir"]));
  return join(commonDir, "arc", "transient-claims");
}

async function claimFiles(repo: string): Promise<string[]> {
  try {
    return (await readdir(await claimDirectory(repo))).sort();
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function repositorySnapshot(repo: string): Promise<{
  head: string;
  heads: string;
  indexTree: string;
  status: string;
  worktrees: string;
  claims: string[];
}> {
  return {
    head: await git(repo, ["rev-parse", "HEAD"]),
    heads: await git(repo, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads"]),
    indexTree: await git(repo, ["write-tree"]),
    status: await git(repo, ["status", "--porcelain=v1", "--untracked-files=all"]),
    worktrees: await git(repo, ["worktree", "list", "--porcelain"]),
    claims: await claimFiles(repo),
  };
}

async function gitReadFailureEnvironment(repo: string): Promise<Record<string, string>> {
  const shimDir = join(repo, "git-read-failure-shim");
  await mkdir(shimDir);
  const driver = [
    "#!/usr/bin/env node",
    'const { spawnSync } = require("node:child_process");',
    'const { delimiter, resolve } = require("node:path");',
    "const args = process.argv.slice(2);",
    'if (args[0] === "for-each-ref") {',
    '  process.stderr.write("injected preflight ref read failure\\n");',
    "  process.exit(97);",
    "}",
    "const shim = resolve(__dirname);",
    'const path = (process.env.PATH ?? "").split(delimiter)',
    "  .filter((entry) => resolve(entry) !== shim).join(delimiter);",
    'const result = spawnSync("git", args, { env: { ...process.env, PATH: path }, stdio: "inherit" });',
    "process.exit(result.status ?? 1);",
    "",
  ].join("\n");
  const driverPath = join(shimDir, process.platform === "win32" ? "git-shim.cjs" : "git");
  await writeFile(driverPath, driver, "utf8");
  if (process.platform === "win32") {
    await writeFile(join(shimDir, "git.cmd"), '@node "%~dp0git-shim.cjs" %*\r\n', "utf8");
  } else {
    await chmod(driverPath, 0o755);
  }
  return { PATH: `${shimDir}${delimiter}${process.env.PATH ?? ""}` };
}

function parseSingleDecomposeRefusal(result: RunResult): {
  status: string;
  reason: string;
  locus?: string;
  remedy: { argv: string[]; text: string };
} {
  expect(result.exitCode).toBe(1);
  expect(result.stdout.endsWith("\n")).toBe(true);
  const lines = result.stdout.trimEnd().split("\n");
  expect(lines).toHaveLength(1);
  const envelope = JSON.parse(lines[0] ?? "") as {
    status: string;
    reason: string;
    locus?: string;
    remedy: { argv: string[]; text: string };
  };
  expect(result.stderr).toBe(`${envelope.reason}\n${envelope.remedy.text}\n`);
  return envelope;
}

describe("arc decompose command modes", () => {
  let repo: string | undefined;

  afterEach(async () => {
    if (repo !== undefined) await cleanupTempDir(repo);
  });

  it("stages one complete full-protection transition without a receipt successor", async () => {
    repo = await startedRepository();
    const cutMapPath = await writeCompletedCutMap(repo);

    const executed = await runArcNoTty(
      ["decompose", "origin", "--execute", cutMapPath],
      repo,
      { timeout: 60_000 },
    );
    expect(executed.exitCode, executed.stderr).toBe(0);
    const result = JSON.parse(executed.stdout) as Record<string, unknown>;
    expect(result).toMatchObject({
      status: "staged",
      operation: {
        occupation: {
          protection: "full",
          candidateBranch: "chore/decompose-origin",
        },
      },
    });
    expect(await claimFiles(repo)).toEqual([]);
    expect(executed.stdout).not.toContain("receiptId");
    expect(executed.stdout).not.toContain("continuation");
    expect(executed.stdout).not.toContain("discard");
  });

  it("emits one actionable refusal envelope from every selected mode without mutation", async () => {
    repo = await startedRepository();
    const retirementMap = await writeCompletedCutMap(repo);
    const extractionMap = await writeExtractionCutMap(repo);
    const gitFailureEnv = await gitReadFailureEnvironment(repo);
    const cases = [
      {
        mode: "preflight",
        args: ["decompose", "origin", "--preflight"],
        options: {
          timeout: 60_000,
          env: gitFailureEnv,
        },
        reason: "unexpected-error",
        argv: ["arc", "decompose", "origin", "--preflight"],
      },
      {
        mode: "execute",
        args: ["decompose", "origin", "--execute", extractionMap],
        reason: "map:authoring-shape",
        argv: ["arc", "decompose", "origin", "--extract", extractionMap],
      },
      {
        mode: "extract",
        args: ["decompose", "origin", "--extract", retirementMap],
        reason: "map:authoring-shape",
        argv: ["arc", "decompose", "origin", "--execute", retirementMap],
      },
      {
        mode: "finish preview",
        args: ["decompose", "origin", "--finish", retirementMap],
        reason: "map:authoring-shape",
        argv: ["arc", "decompose", "origin", "--execute", retirementMap],
      },
      {
        mode: "finish apply",
        args: [
          "decompose",
          "origin",
          "--finish",
          retirementMap,
          "--apply",
          `sha256:${"a".repeat(64)}`,
        ],
        reason: "map:authoring-shape",
        argv: ["arc", "decompose", "origin", "--execute", retirementMap],
      },
      {
        mode: "advance base",
        args: ["decompose", "origin", "--advance-base", extractionMap],
        reason: "map:authoring-shape",
        argv: ["arc", "decompose", "origin", "--extract", extractionMap],
      },
    ] as const;

    for (const scenario of cases) {
      const before = await repositorySnapshot(repo);
      const result = await runArcNoTty(
        [...scenario.args],
        repo,
        "options" in scenario ? scenario.options : { timeout: 60_000 },
      );
      const envelope = parseSingleDecomposeRefusal(result);
      expect(envelope, scenario.mode).toMatchObject({
        status: "refused",
        reason: scenario.reason,
        locus: expect.any(String),
        remedy: { argv: scenario.argv },
      });
      expect(await repositorySnapshot(repo), scenario.mode).toEqual(before);
    }
  });

  it("emits an actionable uncovered-content refusal while advancing a committed candidate", async () => {
    repo = await startedRepository();
    let cutMapPath = await writeCompletedCutMap(repo);
    const executed = await runArcNoTty(
      ["decompose", "origin", "--execute", cutMapPath],
      repo,
      { timeout: 60_000 },
    );
    expect(executed.exitCode, executed.stderr).toBe(0);
    const staged = JSON.parse(executed.stdout) as {
      operation: { occupation: { protection: string; path: string } };
    };
    expect(staged.operation.occupation.protection).toBe("full");
    const candidatePath = staged.operation.occupation.path;
    await git(candidatePath, ["commit", "-m", "commit decomposition transition"]);
    const candidateHead = await git(candidatePath, ["rev-parse", "HEAD"]);

    await git(repo, ["switch", "plan/origin"]);
    const companionPath = ".arc/active/notes-origin.md";
    await write(repo, companionPath, "# Notes: origin\n\nUnallocated companion content.\n");
    await git(repo, ["add", companionPath]);
    await git(repo, ["commit", "-m", "add uncovered source companion"]);
    await git(repo, ["push", "origin", "plan/origin"]);
    await git(repo, ["switch", "main"]);
    cutMapPath = await writeCompletedCutMap(repo);
    const before = await repositorySnapshot(repo);

    const refused = await runArcNoTty(
      ["decompose", "origin", "--advance-base", cutMapPath],
      repo,
      { timeout: 60_000 },
    );

    expect(refused.exitCode).not.toBe(0);
    const envelope = JSON.parse(refused.stdout) as {
      status: string;
      reason: string;
      locus: string;
      remedy: { argv: string[]; text: string };
    };
    expect(envelope).toMatchObject({
      status: "refused",
      locus: companionPath,
      remedy: { argv: ["arc", "decompose", "origin", "--preflight"] },
    });
    expect(envelope.reason).toMatch(/(?:^|:)uncovered-retirement-content$/u);
    expect(refused.stderr).toBe(`${envelope.reason}\n${envelope.remedy.text}\n`);
    expect(await repositorySnapshot(repo)).toEqual(before);
    expect(await git(candidatePath, ["rev-parse", "HEAD"])).toBe(candidateHead);
    expect(await git(candidatePath, ["status", "--porcelain=v1"])).toBe("");
  });

  it("lands a direct-member extraction with a reasoned drop then durably finishes the source", async () => {
    repo = await startedRepository();
    const cutMapPath = await writeExtractionCutMap(repo);
    const sourceHeadBefore = await git(repo, ["rev-parse", "plan/origin"]);
    const sourceTreeBefore = await git(repo, ["rev-parse", "plan/origin^{tree}"]);
    const beforeModeRefusals = await repositorySnapshot(repo);

    for (const mode of ["--execute", "--advance-base"] as const) {
      const refused = await runArcNoTty(["decompose", "origin", mode, cutMapPath], repo, {
        timeout: 60_000,
      });
      expect(refused.exitCode).not.toBe(0);
      expect(JSON.parse(refused.stdout)).toMatchObject({
        status: "refused",
        reason: "map:authoring-shape",
      });
      expect(await repositorySnapshot(repo)).toEqual(beforeModeRefusals);
    }

    const extracted = await runArcNoTty(
      ["decompose", "origin", "--extract", cutMapPath],
      repo,
      { timeout: 60_000 },
    );
    expect(extracted.exitCode, extracted.stderr).toBe(0);
    const result = JSON.parse(extracted.stdout) as {
      operation: {
        occupation: { protection: string; path: string };
        report: {
          extraction: {
            retainedOrigin: {
              origin: string;
              path: string;
              allocations: Array<{ sourceId: string; ownership: string }>;
            };
            reasonedDrops: Array<{
              sourceId: string;
              ownership: string;
              reason: string;
            }>;
            anchor: { origin: string; path: string };
          };
        };
        stagedPaths: string[];
      };
    };
    const cutMap = JSON.parse(await readFile(cutMapPath, "utf8")) as {
      machine: {
        sourceUnits: Array<{
          sourceId: string;
          sourcePath: string;
          sourceLocator: unknown;
        }>;
      };
      authoring: {
        sourceAllocations: Array<{
          sourceId: string;
          disposition: { kind: string; reason?: string };
        }>;
      };
    };
    const dropAllocation = cutMap.authoring.sourceAllocations.find(({ disposition }) =>
      disposition.kind === "drop");
    if (dropAllocation === undefined) throw new Error("extraction fixture needs a reasoned drop");
    expect(result).toMatchObject({
      status: "staged",
      operation: {
        occupation: { protection: "full" },
        report: {
          extraction: {
            anchor: { origin: "origin", path: ".arc/active/meta-origin.md" },
          },
        },
      },
    });
    expect(result.operation.report.extraction.reasonedDrops).toEqual([{
      sourceId: dropAllocation.sourceId,
      ownership: "destination-owned",
      reason: "obsolete framing",
    }]);
    expect(result.operation.stagedPaths).not.toEqual(expect.arrayContaining([
      expect.stringContaining(".arc/system/.internal/transitions/"),
      expect.stringContaining(".arc/active/meta-origin.md"),
    ]));
    const memberMetaPath = ".arc/backlog/planned/member/meta-member.md";
    const originMetaPath = ".arc/backlog/planned/origin/meta-origin.md";
    const candidatePaths = (await git(result.operation.occupation.path, ["ls-files"])).split("\n");
    expect(candidatePaths).not.toEqual(expect.arrayContaining([
      expect.stringMatching(/(?:^|\/)(?:transitions?|receipts?|continuations?)(?:\/|$)/u),
      expect.stringMatching(/(?:^|\/)cohort-[^/]+\.md$/u),
    ]));
    expect(await claimFiles(repo)).toEqual([]);
    expect(extracted.stdout).not.toMatch(/receipt|continuation|teardown|launch|publication/iu);
    const basePathsBeforeLanding = (await git(repo, ["ls-tree", "-r", "--name-only", "main"]))
      .split("\n");
    expect(basePathsBeforeLanding).not.toEqual(expect.arrayContaining([
      memberMetaPath,
      originMetaPath,
    ]));
    const memberBeforeLanding = await runArcNoTty(["status", "member", "--json"], repo);
    expect(memberBeforeLanding.exitCode, memberBeforeLanding.stderr).toBe(0);
    expect(JSON.parse(memberBeforeLanding.stdout)).toMatchObject({
      slug: "member",
      position: null,
      state: "nonexistent",
    });
    const memberMeta = await readFile(
      join(result.operation.occupation.path, memberMetaPath),
      "utf8",
    );
    expect(parseMetaRecord(memberMeta)).toMatchObject({
      state: "Planning",
      branch: null,
      cohort: null,
      promotionReceipt: null,
      candidateId: null,
      currentWorkflow: "draft-design",
      nextAction: "Begin draft-design",
      prUrl: null,
      completed: null,
    });
    expect(await readFile(
      join(result.operation.occupation.path, originMetaPath),
      "utf8",
    )).toContain("# Metadata: origin");
    expect(await git(repo, ["rev-parse", "plan/origin"])).toBe(sourceHeadBefore);
    expect(await git(repo, ["rev-parse", "plan/origin^{tree}"])).toBe(sourceTreeBefore);

    const retainedId = cutMap.authoring.sourceAllocations.find(({ disposition }) =>
      disposition.kind === "retained-origin")?.sourceId;
    const retainedSource = cutMap.machine.sourceUnits.find(({ sourceId }) => sourceId === retainedId);
    if (retainedSource === undefined) throw new Error("extraction fixture needs retained source");
    const droppedSource = cutMap.machine.sourceUnits.find(({ sourceId }) =>
      sourceId === dropAllocation.sourceId);
    if (droppedSource === undefined) throw new Error("extraction fixture needs dropped source");

    await git(result.operation.occupation.path, ["commit", "-m", "land additive extraction"]);
    const candidateHead = await git(result.operation.occupation.path, ["rev-parse", "HEAD"]);
    await git(repo, ["merge", "--ff-only", candidateHead]);
    const landedPaths = (await git(repo, ["ls-tree", "-r", "--name-only", "main"])).split("\n");
    expect(landedPaths).toEqual(expect.arrayContaining([memberMetaPath, originMetaPath]));
    await git(repo, ["push", "origin", "main"]);
    const memberAfterLanding = await runArcNoTty(["status", "member", "--json"], repo);
    expect(memberAfterLanding.exitCode, memberAfterLanding.stderr).toBe(0);
    expect(JSON.parse(memberAfterLanding.stdout)).toMatchObject({
      slug: "member",
      position: { phase: "Planning", location: "planned" },
      state: "planned",
    });
    const projectAfterLanding = await runArcNoTty(
      ["status", "--project", "--local", "--json"],
      repo,
    );
    expect(projectAfterLanding.exitCode, projectAfterLanding.stderr).toBe(0);
    expect(JSON.parse(projectAfterLanding.stdout)).toMatchObject({
      facts: expect.arrayContaining([
        expect.objectContaining({ slug: "member", readiness: "ready" }),
      ]),
    });
    await git(repo, ["switch", "plan/origin"]);
    const sourceBytes = new Uint8Array(await readFile(join(repo, retainedSource.sourcePath)));
    const scan = scanV3DecomposeContent("draft-origin.md", sourceBytes);
    if (scan.status !== "scanned") throw new Error(scan.reason);
    const retained = resolveV3DecomposeContentLocator(
      scan.units,
      retainedSource.sourceLocator,
      "draft-origin.md",
    );
    if (retained.status !== "resolved") throw new Error(retained.reason);

    const beforeTeardownRefusal = await repositorySnapshot(repo);
    const teardown = await runArcNoTty(["teardown", "origin"], repo, { timeout: 60_000 });
    expect(teardown.exitCode).not.toBe(0);
    expect(teardown.stdout + teardown.stderr).toMatch(/retirement evidence is missing/iu);
    expect(await repositorySnapshot(repo)).toEqual(beforeTeardownRefusal);

    const beforePreview = await repositorySnapshot(repo);
    const preview = await runArcNoTty(
      ["decompose", "origin", "--finish", cutMapPath],
      repo,
      { timeout: 60_000 },
    );
    expect(preview.exitCode, preview.stderr).toBe(0);
    const previewResult = JSON.parse(preview.stdout) as {
      status: string;
      preview: { applyAuthority: string };
    };
    expect(previewResult).toMatchObject({
      status: "previewed",
      preview: {
        liveBase: {
          ref: "refs/heads/main",
          head: candidateHead,
          destinations: expect.arrayContaining([
            expect.objectContaining({ path: memberMetaPath, mode: "100644" }),
          ]),
        },
        sources: [expect.objectContaining({
          path: retainedSource.sourcePath,
          before: {
            mode: "100644",
            contentDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
            byteLength: sourceBytes.byteLength,
          },
          after: {
            kind: "file",
            mode: "100644",
            contentBase64: Buffer.from(retained.unit.bytes).toString("base64"),
          },
          removedLocators: expect.arrayContaining([droppedSource.sourceLocator]),
        })],
      },
    });
    expect(await repositorySnapshot(repo)).toEqual(beforePreview);
    const finished = await runArcNoTty(
      ["decompose", "origin", "--finish", cutMapPath, "--apply", previewResult.preview.applyAuthority],
      repo,
      { timeout: 60_000 },
    );
    expect(finished.exitCode, finished.stderr).toBe(0);
    expect(JSON.parse(finished.stdout)).toEqual({ status: "finished" });
    expect(new Uint8Array(await readFile(join(repo, retainedSource.sourcePath))))
      .toEqual(retained.unit.bytes);
    expect((await git(repo, ["diff", "--cached", "--name-only"])).trim())
      .toBe(retainedSource.sourcePath);

    const originMetaSourcePath = ".arc/active/meta-origin.md";
    const originMetaBeforeReconciliation = await readFile(join(repo, originMetaSourcePath), "utf8");
    const originMetaAfterReconciliation = originMetaBeforeReconciliation.replace(
      "- **Next Action:** Begin draft-design",
      "- **Next Action:** Continue retained origin planning",
    );
    expect(originMetaAfterReconciliation).not.toBe(originMetaBeforeReconciliation);
    await writeFile(join(repo, originMetaSourcePath), originMetaAfterReconciliation, "utf8");
    await git(repo, ["add", "--", retainedSource.sourcePath, originMetaSourcePath]);
    expect((await git(repo, ["diff", "--name-only", "--", retainedSource.sourcePath, originMetaSourcePath])))
      .toBe("");
    expect((await git(repo, ["diff", "--cached", "--name-only", "--no-renames"]))
      .split("\n")
      .filter(Boolean)
      .sort())
      .toEqual([originMetaSourcePath, retainedSource.sourcePath].sort());
    await git(repo, [
      "commit",
      "-m",
      "chore(planning): finish source extraction for origin",
      "-m",
      "Context: draft-origin.md (planning)",
    ]);
    const durableFinishHead = await git(repo, ["rev-parse", "HEAD"]);
    expect((await git(repo, [
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "-r",
      durableFinishHead,
    ])).split("\n").filter(Boolean).sort())
      .toEqual([originMetaSourcePath, retainedSource.sourcePath].sort());

    const repeated = await runArcNoTty(
      ["decompose", "origin", "--finish", cutMapPath],
      repo,
      { timeout: 60_000 },
    );
    expect(repeated.exitCode, repeated.stderr).toBe(0);
    expect(JSON.parse(repeated.stdout)).toEqual({ status: "already-finished" });
    const committedRepeat = await runArcNoTty(
      ["decompose", "origin", "--finish", cutMapPath, "--apply", previewResult.preview.applyAuthority],
      repo,
      { timeout: 60_000 },
    );
    expect(committedRepeat.exitCode, committedRepeat.stderr).toBe(0);
    expect(JSON.parse(committedRepeat.stdout)).toEqual({ status: "already-finished" });
    expect(await git(repo, ["rev-parse", "HEAD"])).toBe(durableFinishHead);
    expect(await git(repo, ["status", "--porcelain=v1", "--untracked-files=no"])).toBe("");
  });

  it("refuses destination-owned multi-member direct placement before repository mutation", async () => {
    repo = await startedRepository();
    const cutMapPath = await writeMultiMemberCohortlessCutMap(repo);
    const beforeRefusal = await repositorySnapshot(repo);

    const refused = await runArcNoTty(
      ["decompose", "origin", "--execute", cutMapPath],
      repo,
      { timeout: 60_000 },
    );

    expect(refused.exitCode).not.toBe(0);
    expect(JSON.parse(refused.stdout)).toMatchObject({
      status: "refused",
      stage: "repository-plan",
      reason: "completed-map",
      locus: "authoring.placement",
      recovery: { kind: "none" },
    });
    expect(await repositorySnapshot(repo)).toEqual(beforeRefusal);
    expect(await git(repo, ["branch", "--list", "chore/decompose-origin"])).toBe("");
    expect(await git(repo, ["worktree", "list", "--porcelain"]))
      .not.toContain("branch refs/heads/chore/decompose-origin");
    expect(await claimFiles(repo)).toEqual([]);
  });

  it("retires one heterogeneous direct member on the partial base without candidate authority", async () => {
    repo = await startedRepository({ protection: "partial", heterogeneous: true });
    const { cutMapPath } = await writePartialHeterogeneousCutMap(repo);
    const sharedPath = join(repo, ".arc", "reference", "shared.md");
    const existingMetaPath = join(
      repo,
      ".arc",
      "backlog",
      "planned",
      "existing",
      "meta-existing.md",
    );
    const sharedBefore = await readFile(sharedPath, "utf8");
    const existingMetaBefore = await readFile(existingMetaPath, "utf8");

    await writeFile(sharedPath, `${sharedBefore}\nstale existing-home bytes\n`);
    const beforeStaleRefusal = await repositorySnapshot(repo);
    const stale = await runArcNoTty(
      ["decompose", "origin", "--execute", cutMapPath],
      repo,
      { timeout: 60_000 },
    );
    expect(stale.exitCode).not.toBe(0);
    expect(JSON.parse(stale.stdout)).toMatchObject({
      status: "refused",
      stage: "occupation",
      reason: "partial-projection-dirty",
      recovery: { kind: "none" },
    });
    expect(await repositorySnapshot(repo)).toEqual(beforeStaleRefusal);

    await git(repo, ["restore", "--", ".arc/reference/shared.md"]);
    const beforeExecute = await repositorySnapshot(repo);
    const executed = await runArcNoTty(
      ["decompose", "origin", "--execute", cutMapPath],
      repo,
      { timeout: 60_000 },
    );
    expect(executed.exitCode, executed.stderr).toBe(0);
    const staged = JSON.parse(executed.stdout) as {
      status: "staged";
      operation: {
        occupation: {
          protection: "partial";
        };
        report: {
          topology: Array<{ kind: string; action: string; disposition: string; path?: string }>;
          destinations: Array<{ path: string }>;
        };
      };
    };
    expect(staged).toMatchObject({
      status: "staged",
      operation: {
        occupation: {
          protection: "partial",
        },
      },
    });
    expect(staged.operation.report.topology).toEqual([{
      kind: "topology",
      action: "none",
      disposition: "no-write",
    }]);
    expect(await claimFiles(repo)).toEqual([]);
    expect(await git(repo, ["branch", "--list", "chore/decompose-origin"])).toBe("");
    expect(await git(repo, ["worktree", "list", "--porcelain"]))
      .toBe(beforeExecute.worktrees);
    expect(await git(repo, ["remote"])).toBe("origin");
    expect(await readFile(sharedPath, "utf8")).toBe(sharedBefore);

    const existingMetaAfter = await readFile(existingMetaPath, "utf8");
    expect(existingMetaAfter).toBe(existingMetaBefore.replace(
      "- **Depends On:** `origin`",
      "- **Depends On:** `member`",
    ));
    const memberMeta = await readFile(
      join(repo, ".arc", "backlog", "planned", "member", "meta-member.md"),
      "utf8",
    );
    expect(memberMeta).toContain("- **Depends On:** `dependency`");
    expect(await git(repo, ["ls-files", "**/meta-existing.md"]))
      .toBe(".arc/backlog/planned/existing/meta-existing.md");
    const stagedAfterExecute = await git(repo, ["diff", "--cached", "--name-only", "--no-renames"]);
    expect(stagedAfterExecute).not.toContain("cohort-");
    expect(stagedAfterExecute).toContain(".arc/system/.internal/transitions/");
    expect(executed.stdout).not.toContain("receiptId");
    expect(executed.stdout).not.toContain("continuation");
    expect(await claimFiles(repo)).toEqual([]);
  });
});
