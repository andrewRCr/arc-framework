import { execFile } from "node:child_process";
import { chmod, lstat, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

import { renderMetaFile } from "../../src/lib/active/meta-reader.js";
import {
  canonicalize,
  digestBytes,
  sortByCanonicalBytes,
} from "../../src/lib/canonical/canonical-json.js";
import { createRawGitExec } from "../../src/lib/change-facts.js";
import type { GitExec } from "../../src/lib/git/exec.js";
import { createGitV3DecomposePreflight } from "../../src/lib/work-unit/git-decompose-v3-preflight.js";
import {
  executeGitV3DecomposeCommand,
  executeGitV3DecomposeOperation,
  executeGitV3ExtractionCommand,
  executeGitV3ExtractionOperation,
} from "../../src/lib/work-unit/git-decompose-v3-operation.js";
import { finishGitV3Extraction } from "../../src/lib/work-unit/git-decompose-v3-finish.js";
import {
  resolveV3DecomposeContentLocator,
  scanV3DecomposeContent,
} from "../../src/lib/work-unit/decompose-content.js";
import { advanceGitDecomposeTransitionBase } from
  "../../src/lib/work-unit/git-decompose-transition-base-advancement.js";
import { resolveTransitionRecordRelativePath } from "../../src/lib/work-unit/transition-record-store.js";
import {
  composeGitV3ExtractionRepositoryPlan,
  composeGitV3RepositoryPlan,
} from "../../src/lib/work-unit/git-decompose-v3-repository-plan.js";
import {
  v3IncomingEdgeId,
  v3PreflightId,
} from "../../src/lib/work-unit/decompose-v3-schema.js";
import { runCli } from "../helpers/run-cli.js";
import { CLI_PATH } from "../helpers/cli-spawn.js";
import { CLASSIFY_SCRIPT, runScript } from "../helpers/run-script.js";

const execFileAsync = promisify(execFile);
const roots: string[] = [];

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8" });
  return stdout;
}

function gitExec(): GitExec {
  return async (command, args, options) => {
    const { stdout } = await execFileAsync(command, args, {
      cwd: options?.cwd,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    return { stdout };
  };
}

async function readBlob(repo: string, ref: string, path: string): Promise<Uint8Array | null> {
  try {
    const { stdout } = await execFileAsync("git", ["show", `${ref}:${path}`], {
      cwd: repo,
      encoding: "buffer",
      maxBuffer: 20 * 1024 * 1024,
    });
    return new Uint8Array(stdout);
  } catch {
    return null;
  }
}

async function write(repo: string, path: string, content: string): Promise<void> {
  const target = join(repo, path);
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, content);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}

async function repositoryDependencies(repo: string) {
  const exec = gitExec();
  const cohortTemplate = await readFile("arc/reference/templates/arc/work-unit/template-cohort.md");
  return {
    cwd: repo,
    exec,
    readBlob: async (ref: string, path: string) => await readBlob(repo, ref, path),
    readObject: async (oid: string) => {
      const { stdout } = await execFileAsync("git", ["cat-file", "-p", oid], {
        cwd: repo,
        encoding: "buffer",
        maxBuffer: 20 * 1024 * 1024,
      });
      return new Uint8Array(stdout);
    },
    cohortTemplate,
  };
}

async function genericPlanningLaneRepository() {
  const repo = await mkdtemp(join(tmpdir(), "arc-generic-planning-lane-"));
  roots.push(repo);
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.name", "ARC Test"]);
  await git(repo, ["config", "user.email", "arc@example.test"]);
  await git(repo, ["commit", "--allow-empty", "-m", "base"]);
  const baseHead = (await git(repo, ["rev-parse", "HEAD"])).trim();

  await write(repo, ".arc/active/spec-origin.md", "# Spec: origin\n");
  await write(repo, ".arc/backlog/ROADMAP.md", "# Roadmap\n");
  await write(repo, ".arc/system/.internal/transitions/origin.json", "{}\n");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "add planning transition"]);
  const planningHead = (await git(repo, ["rev-parse", "HEAD"])).trim();

  return { repo, baseHead, planningHead };
}

async function startedRepository(options: {
  companionCoverage?: boolean;
  completedTarget?: boolean;
  sourceRider?: boolean;
  uncoveredCompanion?: boolean;
} = {}) {
  const repo = await mkdtemp(join(tmpdir(), "arc-v3-repository-plan-"));
  roots.push(repo);
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.name", "ARC Test"]);
  await git(repo, ["config", "user.email", "arc@example.test"]);
  await git(repo, ["commit", "--allow-empty", "-m", "seed"]);
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
  const plannedMeta = renderMetaFile("origin", {
    state: "Planning",
    owner: "andrew",
    workClass: "Heavy",
    priority: "P1",
    origin: "internal",
    design: ["draft-origin.md"],
    currentWorkflow: "draft-design",
    nextAction: "Begin draft-design",
  });
  const taskList = `# Task List: origin

Planning context.

## Phase One

### Task 1

First phase content.

## Phase Two

### Task 2

Second phase content.
`;
  const notes = `# Notes: origin

## Evidence

Preserve the motivating evidence.
`;
  const assurance = `# Assurance: origin

## Guarantees

Preserve the nonstandard guarantee.
`;
  const sharedPath = options.companionCoverage === true
    ? ".arc/reference/shared.md"
    : ".arc/reference/shared.txt";
  await write(repo, ".arc/backlog/ROADMAP.md", "# Roadmap before\n");
  await write(
    repo,
    ".arc/system/arc-config.yml",
    "branch.base: main\nbranch.protection: full\npm.mode: arc-in-git\n",
  );
  await write(repo, ".arc/backlog/planned/origin/draft-origin.md", draft);
  await write(repo, ".arc/backlog/planned/origin/meta-origin.md", plannedMeta);
  if (options.completedTarget === true) {
    await write(
      repo,
      ".arc/completed/2026-q3/49_foundation/meta-foundation.md",
      renderMetaFile("foundation", {
        state: "Shipped",
        owner: "andrew",
        workClass: "Light",
        priority: "P2",
        origin: "internal",
        completed: "2026-09-01",
      }),
    );
  }
  if (options.companionCoverage === true) {
    await write(repo, ".arc/backlog/planned/origin/assurance-origin.md", assurance);
    await write(repo, ".arc/backlog/planned/origin/notes-origin.md", notes);
    await write(repo, ".arc/backlog/planned/origin/tasks-origin.md", taskList);
    await write(repo, ".arc/backlog/planned/origin/README.md", "# Unrelated sibling\n");
    await write(
      repo,
      sharedPath,
      "# Shared\n\n## Companion Slot\n\nExisting companion content.\n\n"
        + "## Task Slot\n\nExisting task content.\n",
    );
  } else {
    await write(repo, sharedPath, "shared\n");
  }
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "base"]);
  const baseHead = (await git(repo, ["rev-parse", "HEAD"])).trim();

  await git(repo, ["switch", "-c", "plan/origin"]);
  await mkdir(join(repo, ".arc/active"), { recursive: true });
  await git(repo, ["mv", ".arc/backlog/planned/origin/draft-origin.md", ".arc/active/draft-origin.md"]);
  await git(repo, ["mv", ".arc/backlog/planned/origin/meta-origin.md", ".arc/active/meta-origin.md"]);
  if (options.companionCoverage === true) {
    await git(repo, [
      "mv",
      ".arc/backlog/planned/origin/assurance-origin.md",
      ".arc/active/assurance-origin.md",
    ]);
    await git(repo, [
      "mv",
      ".arc/backlog/planned/origin/notes-origin.md",
      ".arc/active/notes-origin.md",
    ]);
    await git(repo, [
      "mv",
      ".arc/backlog/planned/origin/tasks-origin.md",
      ".arc/active/tasks-origin.md",
    ]);
  } else {
    await rm(join(repo, ".arc/backlog/planned/origin"), { recursive: true, force: true });
  }
  await write(repo, ".arc/active/meta-origin.md", renderMetaFile("origin", {
    state: "Planning",
    owner: "andrew",
    branch: "plan/origin",
    workClass: "Heavy",
    priority: "P1",
    origin: "internal",
    design: ["draft-origin.md"],
    currentWorkflow: "draft-design",
    nextAction: "Begin draft-design",
  }));
  if (options.uncoveredCompanion === true) {
    await write(repo, ".arc/active/notes-origin.md", "# Notes: origin\n\nUnallocated companion content.\n");
  }
  if (options.sourceRider === true) {
    await write(repo, ".arc/reference/supporting-origin.md", "# Source-private rider\n");
  }
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "start"]);
  const sourceHead = (await git(repo, ["rev-parse", "HEAD"])).trim();
  await git(repo, ["switch", "main"]);

  const remote = await mkdtemp(join(tmpdir(), "arc-v3-repository-plan-remote-"));
  roots.push(remote);
  await git(remote, ["init", "--bare"]);
  await git(repo, ["remote", "add", "origin", remote]);
  await git(repo, ["push", "origin", "main", "plan/origin"]);

  const dependencies = await repositoryDependencies(repo);
  const preflight = await createGitV3DecomposePreflight({
    cwd: repo,
    exec: dependencies.exec,
    readBlob: async (ref, path) => await readBlob(repo, ref, path),
  }, "main", "origin");
  if (preflight.status !== "ready") throw new Error(JSON.stringify(preflight));
  const machine = preflight.preflight.starterMap.machine;
  const completedMap = {
    schemaVersion: 3 as const,
    machine,
    authoring: {
      shape: "heterogeneous" as const,
      placement: { kind: "direct-member" as const },
      destinations: [
        {
          kind: "existing-home" as const,
          destinationId: "existing",
          target: { kind: "document" as const, path: sharedPath },
        },
        {
          kind: "new-member" as const,
          destinationId: "member",
          slug: "member",
          workClass: "Heavy" as const,
        },
      ],
      internalEdges: [],
      externalEdges: [] as Array<{ from: string; to: string }>,
      sourceAllocations: machine.sourceUnits.map((unit) => {
        const artifact = unit.sourceLocator.artifact;
        if (options.companionCoverage !== true || artifact === "draft-origin.md") {
          return {
            sourceId: unit.sourceId,
            ownership: "destination-owned" as const,
            disposition: {
              kind: "target" as const,
              destinationId: "member",
              targetLocator: { ...unit.sourceLocator, artifact: "draft-member.md" },
            },
          };
        }
        if (artifact === "tasks-origin.md") {
          if (unit.sourceLocator.kind === "section"
            && unit.sourceLocator.headingSource === "Phase One") {
            return {
              sourceId: unit.sourceId,
              ownership: "destination-owned" as const,
              disposition: {
                kind: "target" as const,
                destinationId: "existing",
                targetLocator: {
                  artifact: "shared.md",
                  kind: "section" as const,
                  level: 2 as const,
                  headingSource: "Task Slot",
                  ancestry: [],
                  occurrence: 0,
                },
              },
            };
          }
          return {
            sourceId: unit.sourceId,
            ownership: "destination-owned" as const,
            disposition: {
              kind: "target" as const,
              destinationId: "member",
              targetLocator: { ...unit.sourceLocator, artifact: "tasks-member.md" },
            },
          };
        }
        if (artifact === "notes-origin.md") {
          return {
            sourceId: unit.sourceId,
            ownership: "destination-owned" as const,
            disposition: unit.sourceLocator.kind === "preamble"
              ? { kind: "drop" as const, reason: "member scaffold supplies the notes preamble" }
              : {
                  kind: "target" as const,
                  destinationId: "member",
                  targetLocator: { ...unit.sourceLocator, artifact: "notes-member.md" },
                },
          };
        }
        return {
          sourceId: unit.sourceId,
          ownership: "destination-owned" as const,
          disposition: unit.sourceLocator.kind === "preamble"
            ? { kind: "drop" as const, reason: "title is represented by the destination" }
            : {
                kind: "target" as const,
                destinationId: "existing",
                targetLocator: {
                  artifact: "shared.md",
                  kind: "section" as const,
                  level: 2 as const,
                  headingSource: "Companion Slot",
                  ancestry: [],
                  occurrence: 0,
                },
              },
        };
      }),
      incomingDispositions: [],
      outgoingDispositions: [],
    },
  };
  return { repo, remote, baseHead, sourceHead, completedMap, dependencies };
}

async function activeExtractionRepository(
  profile: "draft" | "single-spec" | "paired-spec",
  provisionalTask: boolean,
  incoming = false,
  extraCompanions = false,
  sourceMaturity: "active" | "started-planning" = "active",
) {
  const repo = await mkdtemp(join(tmpdir(), "arc-v3-extraction-plan-"));
  roots.push(repo);
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.name", "ARC Test"]);
  await git(repo, ["config", "user.email", "arc@example.test"]);
  await write(repo, ".arc/backlog/ROADMAP.md", "# Roadmap before\n");
  await write(repo, ".arc/system/arc-config.yml", "branch.base: main\npm.mode: arc-in-git\n");
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "base"]);
  if (incoming) {
    await write(repo, ".arc/backlog/planned/dependent/meta-dependent.md", renderMetaFile("dependent", {
      state: "Planning",
      owner: "andrew",
      workClass: "Light",
      priority: "P2",
      dependsOn: ["origin"],
      origin: "internal",
      design: ["draft-dependent.md"],
      currentWorkflow: "draft-design",
      nextAction: "Begin draft-design",
    }));
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", "add dependent"]);
  }
  const baseHead = (await git(repo, ["rev-parse", "HEAD"])).trim();

  const sourceBranch = sourceMaturity === "started-planning" ? "plan/origin" : "feat/origin";
  await git(repo, ["switch", "-c", sourceBranch]);
  const design = profile === "draft"
    ? ["draft-origin.md"]
    : profile === "single-spec"
      ? ["spec-origin.md"]
      : ["spec-origin-prd.md", "spec-origin-rfc.md"];
  const designBodies = design.map((artifact, index) => `# ${artifact}\n\n`
    + `## Scope ${index}\n\nOwned scope ${index}.\n\n`
    + `## Detail ${index}\n\nImplementation detail ${index}.\n\n`
    + `## Verification ${index}\n\nVerification detail ${index}.\n`);
  for (const [index, artifact] of design.entries()) {
    await write(repo, `.arc/active/${artifact}`, designBodies[index]!);
  }
  await write(repo, ".arc/active/tasks-origin.md", designBodies[0]!);
  if (extraCompanions) {
    await write(repo, ".arc/active/assurance-origin.md", "# Assurance\n\nPreserve exactly.\n");
    await write(repo, ".arc/active/draft-origin.md", "# Retired draft\n\nPreserve exactly.\n");
    await write(repo, ".arc/active/notes-origin.md", "# Notes\n\nPreserve exactly.\n");
  }
  await write(repo, ".arc/active/meta-origin.md", renderMetaFile("origin", {
    state: sourceMaturity === "started-planning" ? "Planning" : "Active",
    owner: "andrew",
    branch: sourceBranch,
    workClass: "Heavy",
    priority: "P1",
    origin: "internal",
    design,
    ...(profile === "draft" ? {} : { taskList: "tasks-origin.md" }),
    ...(sourceMaturity === "started-planning" ? { currentWorkflow: "generate-tasks" } : {}),
    nextAction: "Continue implementation",
  }));
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "active origin"]);
  const sourceHead = (await git(repo, ["rev-parse", "HEAD"])).trim();
  const sourceTree = (await git(repo, ["rev-parse", "HEAD^{tree}"])).trim();
  await git(repo, ["switch", "main"]);

  const dependencies = await repositoryDependencies(repo);
  const preflight = await createGitV3DecomposePreflight({
    cwd: repo,
    exec: dependencies.exec,
    readBlob: async (ref, path) => await readBlob(repo, ref, path),
  }, "main", "origin");
  if (preflight.status !== "ready") throw new Error(JSON.stringify(preflight));
  const machine = preflight.preflight.starterMap.machine;
  if (machine.sourceUnits.length < 3) throw new Error("extraction fixture needs three source units");
  const designSourceIds = machine.sourceUnits.filter((unit) =>
    machine.planningProfile.sourceDesign.includes(unit.sourcePath.split("/").at(-1)!))
    .map(({ sourceId }) => sourceId);
  const completedMap = {
    schemaVersion: 3 as const,
    machine,
    authoring: {
      shape: "extraction" as const,
      placement: { kind: "direct-member" as const },
      destinations: [{
        kind: "new-member" as const,
        destinationId: "member",
        slug: "member",
        workClass: "Heavy" as const,
      }],
      internalEdges: [],
      externalEdges: [],
      sourceAllocations: machine.sourceUnits.map((unit, index) => ({
        sourceId: unit.sourceId,
        ownership: "destination-owned" as const,
        disposition: sourceMaturity === "started-planning"
          && !designSourceIds.includes(unit.sourceId)
          ? { kind: "retained-origin" as const }
          : sourceMaturity === "started-planning"
            && designSourceIds.indexOf(unit.sourceId) === 0
            ? { kind: "retained-origin" as const }
            : sourceMaturity === "started-planning"
              && designSourceIds.indexOf(unit.sourceId) === designSourceIds.length - 1
              ? { kind: "drop" as const, reason: "obsolete framing" }
              : provisionalTask && index === 0
          ? {
              kind: "target" as const,
              destinationId: "member",
              targetLocator: { ...unit.sourceLocator, artifact: "tasks-member.md" },
            }
          : index === (provisionalTask ? 1 : 0)
            ? { kind: "retained-origin" as const }
          : index === machine.sourceUnits.length - 1
            ? { kind: "drop" as const, reason: "obsolete framing" }
            : {
                kind: "target" as const,
                destinationId: "member",
                targetLocator: {
                  ...unit.sourceLocator,
                  artifact: unit.sourceLocator.artifact.replace("origin", "member"),
                },
              },
      })),
      incomingDispositions: machine.incomingEdges.map((edge) => ({
        edgeId: edge.edgeId,
        disposition: { kind: "replace" as const, replacementTargets: ["origin"] },
      })),
      outgoingDispositions: [],
    },
  };
  return {
    repo,
    dependencies,
    completedMap,
    preflight: preflight.preflight,
    baseHead,
    sourceHead,
    sourceTree,
    sourceBranch,
  };
}

async function stageExtractionRepository() {
  const fixture = await activeExtractionRepository("single-spec", false);
  const staged = await executeGitV3ExtractionOperation({
    ...fixture.dependencies,
    spawningIdentity: "andrew",
  }, {
    protection: "full",
    baseBranch: "main",
    completedMap: fixture.completedMap,
  });
  if (staged.status !== "staged" || staged.operation.occupation.protection !== "full") {
    throw new Error(JSON.stringify(staged));
  }
  const candidatePath = staged.operation.occupation.path;
  roots.push(candidatePath);
  const destinationPath = staged.plan.mutations.find((mutation) =>
    mutation.path.endsWith("spec-member.md"))?.path;
  if (destinationPath === undefined) throw new Error("extraction fixture needs a member spec");
  const cutMapPath = join(fixture.repo, "cut-map.json");
  await writeFile(cutMapPath, `${canonicalize(fixture.completedMap)}\n`);
  return { ...fixture, staged, candidatePath, destinationPath, cutMapPath };
}

async function landedExtractionRepository() {
  const fixture = await stageExtractionRepository();
  await git(fixture.candidatePath, ["commit", "-m", "land additive extraction"]);
  const candidateHead = (await git(fixture.candidatePath, ["rev-parse", "HEAD"])).trim();
  await git(fixture.repo, ["merge", "--ff-only", candidateHead]);
  const landedHead = (await git(fixture.repo, ["rev-parse", "HEAD"])).trim();
  await git(fixture.repo, ["switch", "feat/origin"]);
  return { ...fixture, landedHead };
}

async function landedStartedPlanningCompanionExtractionRepository(
  profile: "single-spec" | "paired-spec" = "single-spec",
) {
  const fixture = await activeExtractionRepository(
    profile,
    false,
    false,
    true,
    "started-planning",
  );
  const staged = await executeGitV3ExtractionOperation({
    ...fixture.dependencies,
    spawningIdentity: "andrew",
  }, {
    protection: "full",
    baseBranch: "main",
    completedMap: fixture.completedMap,
  });
  if (staged.status !== "staged" || staged.operation.occupation.protection !== "full") {
    throw new Error(JSON.stringify(staged));
  }
  const candidatePath = staged.operation.occupation.path;
  roots.push(candidatePath);
  await git(candidatePath, ["commit", "-m", "land started planning extraction"]);
  const candidateHead = (await git(candidatePath, ["rev-parse", "HEAD"])).trim();
  await git(fixture.repo, ["merge", "--ff-only", candidateHead]);
  await git(fixture.repo, ["switch", fixture.sourceBranch]);
  const cutMapPath = join(fixture.repo, "started-planning-cut-map.json");
  await writeFile(cutMapPath, `${canonicalize(fixture.completedMap)}\n`);
  return { ...fixture, staged, candidatePath, cutMapPath };
}

type StartedPlanningCompanionFixture = Awaited<
  ReturnType<typeof landedStartedPlanningCompanionExtractionRepository>
>;

async function landedCohortExtractionRepository() {
  const fixture = await activeExtractionRepository("single-spec", false);
  const completedMap = {
    ...fixture.completedMap,
    authoring: {
      ...fixture.completedMap.authoring,
      placement: { kind: "cohort" as const, cohort: "group" },
    },
  };
  const staged = await executeGitV3ExtractionOperation({
    ...fixture.dependencies,
    spawningIdentity: "andrew",
  }, {
    protection: "full",
    baseBranch: "main",
    completedMap,
  });
  if (staged.status !== "staged" || staged.operation.occupation.protection !== "full") {
    throw new Error(JSON.stringify(staged));
  }
  const candidatePath = staged.operation.occupation.path;
  roots.push(candidatePath);
  const cohortPath = ".arc/backlog/planned/group/cohort-group.md";
  const memberPath = ".arc/backlog/planned/group/member/spec-member.md";
  await write(
    candidatePath,
    cohortPath,
    (await readFile(join(candidatePath, cohortPath), "utf8")).replace(
      "**Purpose:** —",
      "**Purpose:** Coordinate the extracted member with its surviving origin.",
    ),
  );
  const authoredMember = `${await readFile(join(candidatePath, memberPath), "utf8")}`
    + "\n## Owner-authored plan\n\nReady for task generation.\n";
  await write(candidatePath, memberPath, authoredMember);
  await git(candidatePath, ["add", cohortPath, memberPath]);
  await git(candidatePath, ["commit", "-m", "author grouped extraction"]);
  const candidateHead = (await git(candidatePath, ["rev-parse", "HEAD"])).trim();
  await git(fixture.repo, ["merge", "--ff-only", candidateHead]);
  await git(fixture.repo, ["switch", "feat/origin"]);
  const cutMapPath = join(fixture.repo, "grouped-cut-map.json");
  await writeFile(cutMapPath, `${canonicalize(completedMap)}\n`);
  return {
    ...fixture,
    completedMap,
    staged,
    candidatePath,
    cohortPath,
    memberPath,
    authoredMember,
    cutMapPath,
  };
}

async function previewFinish(fixture: Awaited<ReturnType<typeof stageExtractionRepository>>) {
  return await finishGitV3Extraction(fixture.dependencies, {
    cwd: fixture.repo,
    baseBranch: "main",
    origin: "origin",
    cutMapPath: fixture.cutMapPath,
    applyAuthority: null,
  });
}

async function committedTransitionCandidate() {
  const started = await startedRepository();
  const staged = await executeGitV3DecomposeOperation({
    ...started.dependencies,
    spawningIdentity: "andrew",
  }, {
    protection: "full",
    baseBranch: "main",
    completedMap: started.completedMap,
  });
  if (staged.status !== "staged" || staged.operation.occupation.protection !== "full") {
    throw new Error(JSON.stringify(staged));
  }
  const candidatePath = staged.operation.occupation.path;
  await git(candidatePath, ["commit", "-m", "commit decomposition transition"]);
  const candidateHead = (await git(candidatePath, ["rev-parse", "HEAD"])).trim();
  return { ...started, candidatePath, candidateHead };
}

async function reAdvancedTransitionCandidate() {
  const fixture = await committedTransitionCandidate();
  await write(fixture.repo, ".arc/reference/base-growth.txt", "first descendant\n");
  await git(fixture.repo, ["add", ".arc/reference/base-growth.txt"]);
  await git(fixture.repo, ["commit", "-m", "first base advance"]);
  const firstBaseHead = (await git(fixture.repo, ["rev-parse", "main"])).trim();
  const firstAdvance = await advanceGitDecomposeTransitionBase(fixture.dependencies, {
    protection: "full",
    baseBranch: "main",
    completedMap: fixture.completedMap,
  });
  if (firstAdvance.status !== "advanced") throw new Error(JSON.stringify(firstAdvance));
  await git(fixture.candidatePath, ["commit", "-m", "absorb first base advance"]);
  const candidateHead = (await git(fixture.candidatePath, ["rev-parse", "HEAD"])).trim();

  await write(fixture.repo, ".arc/reference/base-growth-2.txt", "second descendant\n");
  await git(fixture.repo, ["add", ".arc/reference/base-growth-2.txt"]);
  await git(fixture.repo, ["commit", "-m", "second base advance"]);
  const currentBaseHead = (await git(fixture.repo, ["rev-parse", "main"])).trim();

  return { ...fixture, firstBaseHead, candidateHead, currentBaseHead };
}

async function backlogStubRepository(options: { preserveParent?: boolean } = {}) {
  const repo = await mkdtemp(join(tmpdir(), "arc-v3-backlog-stub-"));
  roots.push(repo);
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.name", "ARC Test"]);
  await git(repo, ["config", "user.email", "arc@example.test"]);
  const spec = `# Spec: origin

## Context

Split one configured-ref planning stub.

## Requirements

Preserve the single-spec profile.

## Verification

Prove the direct-base retirement.
`;
  await write(repo, ".arc/backlog/ROADMAP.md", "# Roadmap before\n");
  await write(repo, ".arc/backlog/planned/origin/spec-origin.md", spec);
  await write(repo, ".arc/backlog/planned/origin/meta-origin.md", renderMetaFile("origin", {
    state: "Planning",
    owner: "andrew",
    workClass: "Heavy",
    priority: "P1",
    origin: "internal",
    design: ["spec-origin.md"],
    currentWorkflow: "generate-tasks",
    nextAction: "Begin generate-tasks",
  }));
  if (options.preserveParent) {
    await write(
      repo,
      ".arc/backlog/planned/origin/README.md",
      "# Preserved sibling\n",
    );
  }
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "base"]);
  const baseHead = (await git(repo, ["rev-parse", "HEAD"])).trim();
  const dependencies = await repositoryDependencies(repo);
  const preflight = await createGitV3DecomposePreflight({
    cwd: repo,
    exec: dependencies.exec,
    readBlob: async (ref, path) => await readBlob(repo, ref, path),
  }, "main", "origin");
  if (preflight.status !== "ready") throw new Error(JSON.stringify(preflight));
  const machine = preflight.preflight.starterMap.machine;
  const completedMap = {
    schemaVersion: 3 as const,
    machine,
    authoring: {
      shape: "symmetric" as const,
      placement: { kind: "cohort" as const, cohort: "delivery" },
      destinations: [
        {
          kind: "new-member" as const,
          destinationId: "alpha",
          slug: "alpha",
          workClass: "Heavy" as const,
        },
        {
          kind: "new-member" as const,
          destinationId: "beta",
          slug: "beta",
          workClass: "Light" as const,
        },
      ],
      internalEdges: [],
      externalEdges: [],
      sourceAllocations: machine.sourceUnits.map((unit, index) => {
        const destinationId = index % 2 === 0 ? "alpha" : "beta";
        return {
          sourceId: unit.sourceId,
          ownership: "destination-owned" as const,
          disposition: {
            kind: "target" as const,
            destinationId,
            targetLocator: {
              ...unit.sourceLocator,
              artifact: `spec-${destinationId}.md`,
            },
          },
        };
      }),
      incomingDispositions: [],
      outgoingDispositions: [],
    },
  };
  const cutMapPath = join(repo, "cut-map.json");
  await writeFile(cutMapPath, `${canonicalize(completedMap)}\n`);
  return {
    repo,
    baseHead,
    dependencies,
    completedMap,
    cutMapPath,
    preflight: preflight.preflight,
  };
}

async function copiedRealNotesRepository() {
  const origin = "decompose-transform-integrity";
  const member = "integrity-core";
  const archive = "../../../../.arc/completed/2026-q3/39_decompose-transform-integrity";
  const source = {
    spec: await readFile(new URL(`${archive}/spec-${origin}.md`, import.meta.url), "utf8"),
    tasks: await readFile(new URL(`${archive}/tasks-${origin}.md`, import.meta.url), "utf8"),
    notes: await readFile(new URL(`${archive}/notes-${origin}.md`, import.meta.url), "utf8"),
  };
  const repo = await mkdtemp(join(tmpdir(), "arc-v3-real-notes-"));
  roots.push(repo);
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.name", "ARC Test"]);
  await git(repo, ["config", "user.email", "arc@example.test"]);
  const sourceDirectory = `.arc/backlog/planned/${origin}`;
  await write(repo, ".arc/backlog/ROADMAP.md", "# Roadmap before\n");
  await write(repo, ".arc/system/arc-config.yml", "branch.base: main\npm.mode: arc-in-git\n");
  await write(repo, ".arc/reference/shared.txt", "shared\n");
  await write(repo, `${sourceDirectory}/spec-${origin}.md`, source.spec);
  await write(repo, `${sourceDirectory}/tasks-${origin}.md`, source.tasks);
  await write(repo, `${sourceDirectory}/notes-${origin}.md`, source.notes);
  await write(repo, `${sourceDirectory}/meta-${origin}.md`, renderMetaFile(origin, {
    state: "Planning",
    owner: "andrew",
    workClass: "Heavy",
    priority: "P1",
    origin: "internal",
    design: [`spec-${origin}.md`],
    taskList: `tasks-${origin}.md`,
    currentWorkflow: "generate-tasks",
    nextAction: "Begin generate-tasks",
  }));
  await git(repo, ["add", "."]);
  await git(repo, ["commit", "-m", "copy real origin"]);

  const dependencies = await repositoryDependencies(repo);
  const preflight = await createGitV3DecomposePreflight({
    cwd: repo,
    exec: dependencies.exec,
    readBlob: async (ref, path) => await readBlob(repo, ref, path),
  }, "main", origin);
  if (preflight.status !== "ready") throw new Error(JSON.stringify(preflight));
  const machine = preflight.preflight.starterMap.machine;
  const completedMap = {
    schemaVersion: 3 as const,
    machine,
    authoring: {
      shape: "heterogeneous" as const,
      placement: { kind: "direct-member" as const },
      destinations: [
        {
          kind: "existing-home" as const,
          destinationId: "existing",
          target: { kind: "document" as const, path: ".arc/reference/shared.txt" },
        },
        {
          kind: "new-member" as const,
          destinationId: "member",
          slug: member,
          workClass: "Heavy" as const,
        },
      ],
      internalEdges: [],
      externalEdges: [],
      sourceAllocations: machine.sourceUnits.map((unit) => ({
        sourceId: unit.sourceId,
        ownership: "destination-owned" as const,
        disposition: unit.sourcePath.endsWith(`/tasks-${origin}.md`)
          ? { kind: "drop" as const, reason: "the completed delivery record is historical" }
          : {
              kind: "target" as const,
              destinationId: "member",
              targetLocator: {
                ...unit.sourceLocator,
                artifact: unit.sourceLocator.artifact.replace(origin, member),
              },
            },
      })),
      incomingDispositions: [],
      outgoingDispositions: [],
    },
  };
  const cutMapPath = join(repo, "cut-map.json");
  await writeFile(cutMapPath, `${canonicalize(completedMap)}\n`);
  return {
    repo,
    origin,
    member,
    source,
    sourceDirectory,
    dependencies,
    preflight: preflight.preflight,
    completedMap,
    cutMapPath,
  };
}

async function claimFiles(repo: string): Promise<string[]> {
  try {
    return await readdir(join(repo, ".git", "arc", "transient-claims"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { recursive: true, force: true })));
});

describe("Git v3 repository plan", () => {
  it("retains a completed external edge in meta but omits it from ROADMAP blockers", async () => {
    const fixture = await startedRepository({ completedTarget: true });
    fixture.completedMap.authoring.externalEdges = [{ from: "member", to: "foundation" }];

    const result = await composeGitV3RepositoryPlan(
      fixture.dependencies,
      "main",
      fixture.completedMap,
    );

    expect(result.status, JSON.stringify(result)).toBe("composed");
    if (result.status !== "composed") return;
    const member = result.plan.mutations.find(
      ({ path }) => path === ".arc/backlog/planned/member/meta-member.md",
    );
    const roadmap = result.plan.mutations.find(({ path }) => path === ".arc/backlog/ROADMAP.md");
    if (member?.after.kind !== "file" || roadmap?.after.kind !== "file") {
      throw new Error("member and ROADMAP mutations must contain staged files");
    }
    const memberDigest = member.after.contentDigest;
    const roadmapDigest = roadmap.after.contentDigest;
    const memberBlob = result.blobs.find(({ contentDigest }) => contentDigest === memberDigest);
    const roadmapBlob = result.blobs.find(({ contentDigest }) => contentDigest === roadmapDigest);
    expect(new TextDecoder().decode(memberBlob?.bytes)).toContain("**Depends On:** `foundation`");
    expect(new TextDecoder().decode(roadmapBlob?.bytes)).not.toContain("foundation");
  });

  it.each([
    ["draft", false],
    ["draft", true],
    ["single-spec", false],
    ["single-spec", true],
    ["paired-spec", false],
    ["paired-spec", true],
  ] as const)("composes an additive %s result with provisional-task=%s", async (profile, provisionalTask) => {
    const fixture = await activeExtractionRepository(profile, provisionalTask);

    const result = await composeGitV3ExtractionRepositoryPlan(
      fixture.dependencies,
      "main",
      fixture.completedMap,
    );

    expect(result.status, JSON.stringify(result)).toBe("composed");
    if (result.status !== "composed") return;
    expect(result.plan.expectedBaseHead).toBe(fixture.baseHead);
    expect(result.plan.sourceHead).toBe(fixture.sourceHead);
    expect(result.plan.prospectiveOverlay).toBeUndefined();
    expect(result.plan.mutations.some((mutation) => mutation.kind === "exclusive"
      && (mutation.role === "retiring-source" || mutation.role === "predecessor-retirement"))).toBe(false);
    expect(result.plan.allowedPaths).not.toContain(".arc/active/meta-origin.md");
    expect(result.plan.allowedPaths.some((path) => path.endsWith("tasks-member.md")))
      .toBe(provisionalTask);
    expect(result.extractionFacts).toMatchObject({
      anchor: {
        kind: "surviving-origin",
        origin: "origin",
        path: ".arc/active/meta-origin.md",
      },
      retainedOrigin: { allocations: [expect.objectContaining({ ownership: "destination-owned" })] },
      reasonedDrops: [expect.objectContaining({ reason: "obsolete framing" })],
    });
    const roadmap = result.plan.mutations.find((mutation) => mutation.path === ".arc/backlog/ROADMAP.md");
    const roadmapAfter = roadmap?.after;
    expect(roadmapAfter?.kind).toBe("file");
    if (roadmapAfter?.kind === "file") {
      const blob = result.blobs.find(({ contentDigest }) => contentDigest === roadmapAfter.contentDigest);
      expect(blob === undefined ? "" : new TextDecoder().decode(blob.bytes)).toContain("origin");
    }
    expect((await git(fixture.repo, ["rev-parse", "feat/origin"])).trim()).toBe(fixture.sourceHead);
    expect((await git(fixture.repo, ["rev-parse", "feat/origin^{tree}"])).trim()).toBe(fixture.sourceTree);
  });

  it("previews finish only after the additive result is committed on the configured base", async () => {
    const fixture = await landedExtractionRepository();

    await expect(previewFinish(fixture)).resolves.toMatchObject({
      status: "previewed",
      preview: {
        liveBase: {
          ref: "refs/heads/main",
          head: fixture.landedHead,
          destinations: expect.arrayContaining([
            expect.objectContaining({ path: fixture.destinationPath, mode: "100644" }),
          ]),
        },
        sources: [expect.objectContaining({
          path: ".arc/active/spec-origin.md",
          before: expect.objectContaining({
            mode: "100644",
            contentDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
          }),
          after: expect.objectContaining({ kind: "file", mode: "100644" }),
          removedLocators: expect.any(Array),
        })],
      },
    });
  });

  it("rebuilds Active finish authority with inventory-only companions", async () => {
    const fixture = await activeExtractionRepository("single-spec", false, false, true);
    const companionPaths = [
      ".arc/active/assurance-origin.md",
      ".arc/active/draft-origin.md",
      ".arc/active/notes-origin.md",
      ".arc/active/tasks-origin.md",
    ];
    expect(fixture.preflight.sourceArtifactInventory.map(({ path }) => path))
      .toEqual([...companionPaths, ".arc/active/meta-origin.md", ".arc/active/spec-origin.md"].sort());
    expect(new Set(fixture.preflight.starterMap.machine.sourceUnits.map(({ sourcePath }) => sourcePath)))
      .toEqual(new Set([".arc/active/spec-origin.md"]));
    const companionBytes = new Map(await Promise.all(companionPaths.map(async (path) => [
      path,
      await readBlob(fixture.repo, "feat/origin", path),
    ] as const)));
    const staged = await executeGitV3ExtractionOperation({
      ...fixture.dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      completedMap: fixture.completedMap,
    });
    if (staged.status !== "staged" || staged.operation.occupation.protection !== "full") {
      throw new Error(JSON.stringify(staged));
    }
    roots.push(staged.operation.occupation.path);
    await git(staged.operation.occupation.path, ["commit", "-m", "land companion extraction"]);
    const candidateHead = (await git(
      staged.operation.occupation.path,
      ["rev-parse", "HEAD"],
    )).trim();
    await git(fixture.repo, ["merge", "--ff-only", candidateHead]);
    await git(fixture.repo, ["switch", "feat/origin"]);
    const cutMapPath = join(fixture.repo, "companion-cut-map.json");
    await writeFile(cutMapPath, `${canonicalize(fixture.completedMap)}\n`);

    const preview = await finishGitV3Extraction(fixture.dependencies, {
      cwd: fixture.repo,
      baseBranch: "main",
      origin: "origin",
      cutMapPath,
      applyAuthority: null,
    });

    expect(preview.status, JSON.stringify(preview)).toBe("previewed");
    if (preview.status !== "previewed") return;
    expect(preview.preview.sources.map(({ path }) => path)).toEqual([".arc/active/spec-origin.md"]);
    for (const [path, bytes] of companionBytes) {
      expect(bytes).not.toBeNull();
      await expect(readFile(join(fixture.repo, path))).resolves.toEqual(Buffer.from(bytes ?? []));
    }
  });

  it("finishes a partially thinned started-Planning extraction with byte-identical companions", async () => {
    const fixture = await landedStartedPlanningCompanionExtractionRepository("paired-spec");
    const companionPaths = [
      ".arc/active/assurance-origin.md",
      ".arc/active/draft-origin.md",
      ".arc/active/notes-origin.md",
      ".arc/active/tasks-origin.md",
    ];
    expect(fixture.completedMap.machine.source.kind).toBe("started-planning");
    for (const path of companionPaths) {
      const units = fixture.completedMap.machine.sourceUnits.filter(({ sourcePath }) => sourcePath === path);
      expect(units.length).toBeGreaterThan(0);
      expect(units.map(({ sourceId }) => fixture.completedMap.authoring.sourceAllocations.find(
        (allocation) => allocation.sourceId === sourceId,
      )?.disposition)).toEqual(units.map(() => ({ kind: "retained-origin" })));
    }
    const companionBefore = new Map(await Promise.all(companionPaths.map(async (path) => {
      const inventory = fixture.preflight.sourceArtifactInventory.find((artifact) => artifact.path === path);
      if (inventory === undefined) throw new Error(`missing companion inventory ${path}`);
      const bytes = await readBlob(fixture.repo, fixture.sourceHead, path);
      if (bytes === null) throw new Error(`missing companion bytes ${path}`);
      return [path, { bytes, mode: inventory.mode }] as const;
    })));

    const firstPreview = await finishGitV3Extraction(fixture.dependencies, {
      cwd: fixture.repo,
      baseBranch: "main",
      origin: "origin",
      cutMapPath: fixture.cutMapPath,
      applyAuthority: null,
    });
    if (firstPreview.status !== "previewed") throw new Error(JSON.stringify(firstPreview));
    expect(firstPreview.preview.sources).toHaveLength(2);
    expect(firstPreview.preview.sources.every(({ path }) => !companionPaths.includes(path))).toBe(true);

    const alreadyThinned = firstPreview.preview.sources[0]!;
    if (alreadyThinned.after.kind === "absent") {
      await rm(join(fixture.repo, alreadyThinned.path));
    } else {
      await writeFile(
        join(fixture.repo, alreadyThinned.path),
        Buffer.from(alreadyThinned.after.contentBase64, "base64"),
      );
      await chmod(join(fixture.repo, alreadyThinned.path), alreadyThinned.after.mode === "100755" ? 0o755 : 0o644);
    }
    await git(fixture.repo, ["add", "-A", "--", alreadyThinned.path]);

    const partialPreview = await finishGitV3Extraction(fixture.dependencies, {
      cwd: fixture.repo,
      baseBranch: "main",
      origin: "origin",
      cutMapPath: fixture.cutMapPath,
      applyAuthority: null,
    });
    if (partialPreview.status !== "previewed") throw new Error(JSON.stringify(partialPreview));
    expect(partialPreview.preview.sources).toEqual(firstPreview.preview.sources.slice(1));

    await expect(finishGitV3Extraction(fixture.dependencies, {
      cwd: fixture.repo,
      baseBranch: "main",
      origin: "origin",
      cutMapPath: fixture.cutMapPath,
      applyAuthority: partialPreview.preview.applyAuthority,
    })).resolves.toEqual({ status: "finished" });
    const stagedPaths = (await git(fixture.repo, ["diff", "--cached", "--name-only"]))
      .trim().split("\n").filter(Boolean);
    expect(stagedPaths).toEqual(firstPreview.preview.sources.map(({ path }) => path).sort());
    for (const [path, before] of companionBefore) {
      await expect(readFile(join(fixture.repo, path))).resolves.toEqual(Buffer.from(before.bytes));
      expect((await git(fixture.repo, ["ls-files", "-s", "--", path])).split(" ")[0]).toBe(before.mode);
    }
    await expect(finishGitV3Extraction(fixture.dependencies, {
      cwd: fixture.repo,
      baseBranch: "main",
      origin: "origin",
      cutMapPath: fixture.cutMapPath,
      applyAuthority: null,
    })).resolves.toEqual({ status: "already-finished" });
  });

  it("ignores committed changes outside the origin artifact group", async () => {
    const fixture = await landedStartedPlanningCompanionExtractionRepository();
    const unrelatedPath = ".arc/active/notes-other.md";
    await write(fixture.repo, unrelatedPath, "# Other notes\n\nUnrelated change.\n");
    await git(fixture.repo, ["add", unrelatedPath]);
    await git(fixture.repo, ["commit", "-m", "change unrelated work unit"]);

    const result = await finishGitV3Extraction(fixture.dependencies, {
      cwd: fixture.repo,
      baseBranch: "main",
      origin: "origin",
      cutMapPath: fixture.cutMapPath,
      applyAuthority: null,
    });
    expect(result.status, JSON.stringify(result)).toBe("previewed");
    if (result.status !== "previewed") return;
    expect(result.preview.sources.every(({ path }) => path !== unrelatedPath)).toBe(true);
  });

  it.each([
    ["addition", "fallback", ".arc/active/context-origin.md", async (
      fixture: StartedPlanningCompanionFixture,
    ) => {
      await write(fixture.repo, ".arc/active/context-origin.md", "# Context\n\nAdded later.\n");
    }],
    ["removal", "fallback", ".arc/active/notes-origin.md", async (
      fixture: StartedPlanningCompanionFixture,
    ) => {
      await rm(join(fixture.repo, ".arc/active/notes-origin.md"));
    }],
    ["movement", "fallback", ".arc/active/journal-origin.md", async (
      fixture: StartedPlanningCompanionFixture,
    ) => {
      await git(fixture.repo, [
        "mv",
        ".arc/active/notes-origin.md",
        ".arc/active/journal-origin.md",
      ]);
    }],
    ["structural rename", "fallback", ".arc/active/tasks-origin.md", async (
      fixture: StartedPlanningCompanionFixture,
    ) => {
      const path = ".arc/active/tasks-origin.md";
      const before = await readFile(join(fixture.repo, path), "utf8");
      await write(fixture.repo, path, before.replace("## Scope 0", "## Renamed scope"));
    }],
    ["byte edit", "refreshed", ".arc/active/notes-origin.md", async (
      fixture: StartedPlanningCompanionFixture,
    ) => {
      await write(fixture.repo, ".arc/active/notes-origin.md", "# Notes\n\nChanged after extraction landing.\n");
    }],
    ["mode change", "refreshed", ".arc/active/notes-origin.md", async (
      fixture: StartedPlanningCompanionFixture,
    ) => {
      await chmod(join(fixture.repo, ".arc/active/notes-origin.md"), 0o755);
    }],
  ] as const)("requires reauthoring for companion %s through the %s authority path", async (
    _mutation,
    _authorityPath,
    expectedLocus,
    mutate,
  ) => {
    const fixture = await landedStartedPlanningCompanionExtractionRepository();
    await mutate(fixture);
    await git(fixture.repo, ["add", "-A"]);
    await git(fixture.repo, ["commit", "-m", "change retained companion"]);

    await expect(finishGitV3Extraction(fixture.dependencies, {
      cwd: fixture.repo,
      baseBranch: "main",
      origin: "origin",
      cutMapPath: fixture.cutMapPath,
      applyAuthority: null,
    })).resolves.toMatchObject({
      status: "refused",
      reason: "source:source-units",
      locus: expectedLocus,
    });
  });

  it("requires reauthoring when a companion becomes a symlink before authority selection", async () => {
    const fixture = await landedStartedPlanningCompanionExtractionRepository();
    const companionPath = ".arc/active/notes-origin.md";
    await rm(join(fixture.repo, companionPath));
    await symlink("draft-origin.md", join(fixture.repo, companionPath));
    await git(fixture.repo, ["add", "-A"]);
    await git(fixture.repo, ["commit", "-m", "change retained companion object kind"]);

    await expect(finishGitV3Extraction(fixture.dependencies, {
      cwd: fixture.repo,
      baseBranch: "main",
      origin: "origin",
      cutMapPath: fixture.cutMapPath,
      applyAuthority: null,
    })).resolves.toMatchObject({
      status: "refused",
      reason: "source:source-units",
      locus: companionPath,
      evidence: {
        expected: { kind: "object", objectKind: "blob", mode: "100644" },
        actual: { kind: "object", objectKind: "symlink", mode: "120000" },
      },
    });
  });

  it.each([
    ["preview", null],
    [
      "apply",
      `sha256:${"a".repeat(64)}`,
    ],
  ] as const)("reports an unavailable ancestry probe during finish %s", async (
    _mode,
    applyAuthority,
  ) => {
    const fixture = await landedExtractionRepository();
    const dependencies = {
      ...fixture.dependencies,
      exec: async (...args: Parameters<typeof fixture.dependencies.exec>) => {
        if (args[1][0] === "merge-base" && args[1][1] === "--is-ancestor") {
          throw Object.assign(new Error("ancestry probe unavailable"), {
            exitCode: 128,
            stderr: "ancestry probe unavailable",
          });
        }
        return await fixture.dependencies.exec(...args);
      },
    };

    const result = await finishGitV3Extraction(dependencies, {
      cwd: fixture.repo,
      baseBranch: "main",
      origin: "origin",
      cutMapPath: fixture.cutMapPath,
      applyAuthority,
    });

    expect(result).toMatchObject({
      status: "refused",
      reason: "base-ancestry-unavailable",
      locus: expect.stringContaining("ancestry probe unavailable"),
      remedy: {
        argv: [
          "arc",
          "decompose",
          "origin",
          "--finish",
          fixture.cutMapPath,
          ...(applyAuthority === null ? [] : ["--apply", applyAuthority]),
        ],
      },
    });
    expect(result).not.toHaveProperty("evidence");
  });

  it("keeps a negative finish ancestry probe distinct from a probe failure", async () => {
    const fixture = await landedExtractionRepository();
    const dependencies = {
      ...fixture.dependencies,
      exec: async (...args: Parameters<typeof fixture.dependencies.exec>) => {
        if (args[1][0] === "merge-base" && args[1][1] === "--is-ancestor") {
          throw Object.assign(new Error("not an ancestor"), { exitCode: 1 });
        }
        return await fixture.dependencies.exec(...args);
      },
    };

    const result = await finishGitV3Extraction(dependencies, {
      cwd: fixture.repo,
      baseBranch: "main",
      origin: "origin",
      cutMapPath: fixture.cutMapPath,
      applyAuthority: null,
    });

    expect(result).toMatchObject({
      status: "refused",
      reason: "base-not-descendant",
      locus: "refs/heads/main",
    });
    expect(result).not.toHaveProperty("evidence");
  });

  it("applies exact source thinning to the index and worktree", async () => {
    const fixture = await landedExtractionRepository();
    const preview = await previewFinish(fixture);
    if (preview.status !== "previewed") throw new Error(JSON.stringify(preview));

    await expect(finishGitV3Extraction(fixture.dependencies, {
      cwd: fixture.repo,
      baseBranch: "main",
      origin: "origin",
      cutMapPath: fixture.cutMapPath,
      applyAuthority: preview.preview.applyAuthority,
    })).resolves.toEqual({ status: "finished" });
    await expect(readFile(join(fixture.repo, ".arc/active/spec-origin.md"), "utf8"))
      .resolves.toBe("## Scope 0\n\nOwned scope 0.\n\n");
    expect((await git(fixture.repo, ["diff", "--cached", "--name-only"])).trim())
      .toBe(".arc/active/spec-origin.md");
    await expect(previewFinish(fixture)).resolves.toEqual({ status: "already-finished" });
    await expect(finishGitV3Extraction(fixture.dependencies, {
      cwd: fixture.repo,
      baseBranch: "main",
      origin: "origin",
      cutMapPath: fixture.cutMapPath,
      applyAuthority: preview.preview.applyAuthority,
    })).resolves.toEqual({ status: "already-finished" });
    await git(fixture.repo, ["commit", "-m", "finish source extraction"]);
    await expect(previewFinish(fixture)).resolves.toEqual({ status: "already-finished" });
  });

  it("accepts finalized cohort and member authoring while preserving extraction claims", async () => {
    const fixture = await landedCohortExtractionRepository();

    const preview = await finishGitV3Extraction(fixture.dependencies, {
      cwd: fixture.repo,
      baseBranch: "main",
      origin: "origin",
      cutMapPath: fixture.cutMapPath,
      applyAuthority: null,
    });
    expect(preview).toMatchObject({
      status: "previewed",
      preview: { applyAuthority: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u) },
    });
    if (preview.status !== "previewed") return;
    expect(preview.preview.liveBase.destinations).toContainEqual({
      path: fixture.memberPath,
      mode: "100644",
      contentDigest: digestBytes(new TextEncoder().encode(fixture.authoredMember)),
    });
  });

  it("reports authored and landed cohort identities for a topology mismatch", async () => {
    const fixture = await landedCohortExtractionRepository();
    await git(fixture.repo, ["switch", "main"]);
    const before = await readFile(join(fixture.repo, fixture.cohortPath), "utf8");
    await write(
      fixture.repo,
      fixture.cohortPath,
      before.replace("# Cohort: `group`", "# Cohort: `other`"),
    );
    await git(fixture.repo, ["add", fixture.cohortPath]);
    await git(fixture.repo, ["commit", "-m", "change landed cohort identity"]);
    await git(fixture.repo, ["switch", "feat/origin"]);

    await expect(finishGitV3Extraction(fixture.dependencies, {
      cwd: fixture.repo,
      baseBranch: "main",
      origin: "origin",
      cutMapPath: fixture.cutMapPath,
      applyAuthority: null,
    })).resolves.toMatchObject({
      status: "refused",
      reason: "topology-claim",
      locus: fixture.cohortPath,
      evidence: { expected: "group", actual: "other" },
    });
  });

  it("keeps a malformed-only topology claim evidence-free", async () => {
    const fixture = await landedCohortExtractionRepository();
    await git(fixture.repo, ["switch", "main"]);
    const before = await readFile(join(fixture.repo, fixture.cohortPath), "utf8");
    await write(
      fixture.repo,
      fixture.cohortPath,
      before.replace(
        "**Purpose:** Coordinate the extracted member with its surviving origin.",
        "**Purpose:** —",
      ),
    );
    await git(fixture.repo, ["add", fixture.cohortPath]);
    await git(fixture.repo, ["commit", "-m", "remove landed cohort purpose"]);
    await git(fixture.repo, ["switch", "feat/origin"]);

    const result = await finishGitV3Extraction(fixture.dependencies, {
      cwd: fixture.repo,
      baseBranch: "main",
      origin: "origin",
      cutMapPath: fixture.cutMapPath,
      applyAuthority: null,
    });
    expect(result).toMatchObject({
      status: "refused",
      reason: "topology-claim",
      locus: fixture.cohortPath,
    });
    expect(result).not.toHaveProperty("evidence");
  });

  it("refuses a mismatched preview authority without source mutation", async () => {
    const fixture = await landedExtractionRepository();
    const sourcePath = ".arc/active/spec-origin.md";
    const before = await readFile(join(fixture.repo, sourcePath), "utf8");
    const preview = await previewFinish(fixture);
    if (preview.status !== "previewed") throw new Error(JSON.stringify(preview));
    const suppliedAuthority = `sha256:${"0".repeat(64)}` as const;

    await expect(finishGitV3Extraction(fixture.dependencies, {
      cwd: fixture.repo,
      baseBranch: "main",
      origin: "origin",
      cutMapPath: fixture.cutMapPath,
      applyAuthority: suppliedAuthority,
    })).resolves.toMatchObject({
      status: "refused",
      reason: "apply-authority",
      locus: "apply",
      evidence: {
        expected: preview.preview.applyAuthority,
        actual: suppliedAuthority,
      },
      remedy: {
        argv: [
          "arc",
          "decompose",
          "origin",
          "--finish",
          fixture.cutMapPath,
          "--apply",
          suppliedAuthority,
        ],
      },
    });
    await expect(readFile(join(fixture.repo, sourcePath), "utf8")).resolves.toBe(before);
    expect(await git(fixture.repo, ["status", "--porcelain=v1", "--", sourcePath])).toBe("");
  });

  it("requires reauthoring after a committed reasoned-drop byte refresh", async () => {
    const fixture = await landedExtractionRepository();
    const preview = await previewFinish(fixture);
    if (preview.status !== "previewed") throw new Error(JSON.stringify(preview));
    const dropAllocation = fixture.completedMap.authoring.sourceAllocations.find(({ disposition }) =>
      disposition.kind === "drop");
    const droppedUnit = fixture.completedMap.machine.sourceUnits.find(({ sourceId }) =>
      sourceId === dropAllocation?.sourceId);
    if (droppedUnit === undefined) throw new Error("extraction fixture needs reasoned-drop scope");
    const sourcePath = join(fixture.repo, droppedUnit.sourcePath);
    const sourceBytes = new Uint8Array(await readFile(sourcePath));
    const scan = scanV3DecomposeContent(droppedUnit.sourceLocator.artifact, sourceBytes);
    if (scan.status !== "scanned") throw new Error(scan.reason);
    const resolved = resolveV3DecomposeContentLocator(
      scan.units,
      droppedUnit.sourceLocator,
      droppedUnit.sourceLocator.artifact,
    );
    if (resolved.status !== "resolved") throw new Error(resolved.reason);
    const changed = Buffer.concat([
      sourceBytes.slice(0, resolved.unit.byteRange.end),
      Buffer.from("Changed after finish preview.\n", "utf8"),
      sourceBytes.slice(resolved.unit.byteRange.end),
    ]);
    await writeFile(sourcePath, changed);
    await git(fixture.repo, ["add", droppedUnit.sourcePath]);
    await git(fixture.repo, ["commit", "-m", "refresh reasoned-drop source bytes"]);
    const refreshedPreview = await previewFinish(fixture);
    expect(refreshedPreview).toMatchObject({
      status: "refused",
      reason: "source:source-units",
      locus: droppedUnit.sourcePath,
      evidence: {
        expected: { before: { contentDigest: digestBytes(sourceBytes) } },
        actual: { contentDigest: digestBytes(changed), byteLength: changed.byteLength },
      },
    });

    await expect(finishGitV3Extraction(fixture.dependencies, {
      cwd: fixture.repo,
      baseBranch: "main",
      origin: "origin",
      cutMapPath: fixture.cutMapPath,
      applyAuthority: preview.preview.applyAuthority,
    })).resolves.toMatchObject({
      status: "refused",
      reason: "source:source-units",
      locus: droppedUnit.sourcePath,
      remedy: {
        argv: ["arc", "decompose", "origin", "--preflight"],
      },
    });
    await expect(readFile(sourcePath)).resolves.toEqual(changed);
    expect(await git(fixture.repo, ["status", "--porcelain=v1", "--", droppedUnit.sourcePath]))
      .toBe("");

  });

  it("authenticates an authored preserved incoming dependency against the live base", async () => {
    const fixture = await activeExtractionRepository("single-spec", false, true);
    const staged = await executeGitV3ExtractionOperation({
      ...fixture.dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      completedMap: fixture.completedMap,
    });
    if (staged.status !== "staged" || staged.operation.occupation.protection !== "full") {
      throw new Error(JSON.stringify(staged));
    }
    const candidatePath = staged.operation.occupation.path;
    roots.push(candidatePath);
    await git(candidatePath, ["commit", "-m", "land preserved dependency extraction"]);
    const candidateHead = (await git(candidatePath, ["rev-parse", "HEAD"])).trim();
    await git(fixture.repo, ["merge", "--ff-only", candidateHead]);
    const cutMapPath = join(fixture.repo, "incoming-cut-map.json");
    await writeFile(cutMapPath, `${canonicalize(fixture.completedMap)}\n`);
    await git(fixture.repo, ["switch", "feat/origin"]);
    await expect(finishGitV3Extraction(fixture.dependencies, {
      cwd: fixture.repo,
      baseBranch: "main",
      origin: "origin",
      cutMapPath,
      applyAuthority: null,
    })).resolves.toMatchObject({ status: "previewed" });

    await git(fixture.repo, ["switch", "main"]);
    await write(fixture.repo, ".arc/backlog/planned/dependent/meta-dependent.md", renderMetaFile("dependent", {
      state: "Planning",
      owner: "andrew",
      workClass: "Light",
      priority: "P2",
      origin: "internal",
      design: ["draft-dependent.md"],
      currentWorkflow: "draft-design",
      nextAction: "Begin draft-design",
    }));
    await git(fixture.repo, ["add", ".arc/backlog/planned/dependent/meta-dependent.md"]);
    await git(fixture.repo, ["commit", "-m", "remove preserved dependency"]);
    await git(fixture.repo, ["switch", "feat/origin"]);

    await expect(finishGitV3Extraction(fixture.dependencies, {
      cwd: fixture.repo,
      baseBranch: "main",
      origin: "origin",
      cutMapPath,
      applyAuthority: null,
    })).resolves.toMatchObject({
      status: "refused",
      reason: "dependency-claim",
      locus: ".arc/backlog/planned/dependent/meta-dependent.md",
      evidence: { expected: ["origin"], actual: [] },
    });
  });

  it("refuses a stale live ROADMAP after the additive result lands", async () => {
    const fixture = await landedExtractionRepository();
    await git(fixture.repo, ["switch", "main"]);
    const roadmapPath = ".arc/backlog/ROADMAP.md";
    const expectedRoadmap = new Uint8Array(await readFile(join(fixture.repo, roadmapPath)));
    const staleRoadmap = new TextEncoder().encode("# Stale roadmap\n");
    await writeFile(join(fixture.repo, roadmapPath), staleRoadmap);
    await git(fixture.repo, ["add", ".arc/backlog/ROADMAP.md"]);
    await git(fixture.repo, ["commit", "-m", "make roadmap stale"]);
    await git(fixture.repo, ["switch", "feat/origin"]);

    await expect(previewFinish(fixture)).resolves.toMatchObject({
      status: "refused",
      reason: "roadmap-current-render",
      locus: roadmapPath,
      evidence: {
        expected: {
          objectKind: "blob",
          contentDigest: digestBytes(expectedRoadmap),
          byteLength: expectedRoadmap.byteLength,
        },
        actual: {
          objectKind: "blob",
          contentDigest: digestBytes(staleRoadmap),
          byteLength: staleRoadmap.byteLength,
        },
      },
    });
  });

  it("refuses a complete result that exists only on its additive candidate branch", async () => {
    const fixture = await stageExtractionRepository();
    await git(fixture.repo, ["switch", "feat/origin"]);

    await expect(previewFinish(fixture)).resolves.toMatchObject({
      status: "refused",
      reason: "destination-missing",
    });
  });

  it.each([
    ["destination-missing", async (fixture: Awaited<ReturnType<typeof landedExtractionRepository>>) => {
      await git(fixture.repo, ["rm", fixture.destinationPath]);
    }],
    ["destination-locator", async (fixture: Awaited<ReturnType<typeof landedExtractionRepository>>) => {
      await write(fixture.repo, fixture.destinationPath, "# Changed after landing\n");
      await git(fixture.repo, ["add", fixture.destinationPath]);
    }],
  ] as const)("refuses %s after a partial or changed base commit", async (reason, mutate) => {
    const fixture = await landedExtractionRepository();
    await git(fixture.repo, ["switch", "main"]);
    await mutate(fixture);
    await git(fixture.repo, ["commit", "-m", "change landed destination"]);
    await git(fixture.repo, ["switch", "feat/origin"]);

    await expect(previewFinish(fixture)).resolves.toMatchObject({ status: "refused", reason });
  });

  it("reports the first changed extraction-owned metadata field", async () => {
    const fixture = await landedExtractionRepository();
    const metaPath = fixture.staged.plan.mutations.find((mutation) =>
      mutation.path.endsWith("meta-member.md"))?.path;
    if (metaPath === undefined) throw new Error("extraction fixture needs a member meta");
    await git(fixture.repo, ["switch", "main"]);
    const before = await readFile(join(fixture.repo, metaPath), "utf8");
    await write(fixture.repo, metaPath, before.replace("`andrew`", "`casey`"));
    await git(fixture.repo, ["add", metaPath]);
    await git(fixture.repo, ["commit", "-m", "change landed member owner"]);
    await git(fixture.repo, ["switch", "feat/origin"]);

    await expect(previewFinish(fixture)).resolves.toMatchObject({
      status: "refused",
      reason: "destination-meta",
      locus: metaPath,
      evidence: {
        expected: { field: "owner", value: "andrew" },
        actual: { field: "owner", value: "casey" },
      },
    });
  });

  it.each([
    ["source-worktree-dirty", async (fixture: Awaited<ReturnType<typeof landedExtractionRepository>>) => {
      await write(fixture.repo, ".arc/active/spec-origin.md", "# Dirty source\n");
    }],
    ["source-index-dirty", async (fixture: Awaited<ReturnType<typeof landedExtractionRepository>>) => {
      await write(fixture.repo, ".arc/active/spec-origin.md", "# Staged source\n");
      await git(fixture.repo, ["add", ".arc/active/spec-origin.md"]);
    }],
    ["source-untracked", async (fixture: Awaited<ReturnType<typeof landedExtractionRepository>>) => {
      await write(fixture.repo, ".arc/active/notes-origin.md", "# Untracked source sibling\n");
    }],
  ] as const)("refuses %s in the relevant source directory", async (reason, dirty) => {
    const fixture = await landedExtractionRepository();
    await dirty(fixture);

    await expect(previewFinish(fixture)).resolves.toMatchObject({ status: "refused", reason });
  });

  it("refuses the wrong source branch and refreshes an identity-stable source head", async () => {
    const wrongBranch = await landedExtractionRepository();
    await git(wrongBranch.repo, ["switch", "main"]);
    await expect(previewFinish(wrongBranch)).resolves.toMatchObject({
      status: "refused",
      reason: "source-branch",
    });

    const changedHead = await landedExtractionRepository();
    await write(changedHead.repo, "unrelated.txt", "changed head\n");
    await git(changedHead.repo, ["add", "unrelated.txt"]);
    await git(changedHead.repo, ["commit", "-m", "change source head"]);
    await expect(previewFinish(changedHead)).resolves.toMatchObject({
      status: "previewed",
      preview: { liveBase: { ref: "refs/heads/main" } },
    });
  });

  it("reports the recorded and invoked finish origins", async () => {
    const fixture = await landedExtractionRepository();

    await expect(finishGitV3Extraction(fixture.dependencies, {
      cwd: fixture.repo,
      baseBranch: "main",
      origin: "other",
      cutMapPath: fixture.cutMapPath,
      applyAuthority: null,
    })).resolves.toMatchObject({
      status: "refused",
      reason: "map:origin",
      locus: "machine.source.origin",
      evidence: { expected: "origin", actual: "other" },
    });
  });

  it("reports the recorded and configured finish base refs", async () => {
    const fixture = await landedExtractionRepository();

    await expect(finishGitV3Extraction(fixture.dependencies, {
      cwd: fixture.repo,
      baseBranch: "develop",
      origin: "origin",
      cutMapPath: fixture.cutMapPath,
      applyAuthority: null,
    })).resolves.toMatchObject({
      status: "refused",
      reason: "base-ref-mismatch",
      locus: "machine.resultBase.ref",
      evidence: { expected: "refs/heads/main", actual: "refs/heads/develop" },
    });
  });

  it("reports disagreeing source ref and HEAD reads", async () => {
    const fixture = await landedExtractionRepository();
    const movedHead = "f".repeat(40);
    const movedDependencies = {
      ...fixture.dependencies,
      exec: async (...args: Parameters<GitExec>) => {
        if (args[0] === "git"
          && args[1][0] === "rev-parse"
          && args[1][2] === "refs/heads/feat/origin^{commit}") {
          return { stdout: `${movedHead}\n` };
        }
        return await fixture.dependencies.exec(...args);
      },
    };

    await expect(finishGitV3Extraction(movedDependencies, {
      cwd: fixture.repo,
      baseBranch: "main",
      origin: "origin",
      cutMapPath: fixture.cutMapPath,
      applyAuthority: null,
    })).resolves.toMatchObject({
      status: "refused",
      reason: "source-ref-moved",
      locus: "refs/heads/feat/origin",
      evidence: { expected: fixture.sourceHead, actual: movedHead },
    });
  });

  it("refuses refreshed transferred bytes that are absent from the landed destination", async () => {
    const fixture = await landedExtractionRepository();
    const allocation = fixture.completedMap.authoring.sourceAllocations.find(({ disposition }) =>
      disposition.kind === "target");
    const sourceUnit = fixture.completedMap.machine.sourceUnits.find(({ sourceId }) =>
      sourceId === allocation?.sourceId);
    if (sourceUnit === undefined) throw new Error("extraction fixture needs transferred source scope");
    const sourcePath = join(fixture.repo, sourceUnit.sourcePath);
    const sourceBytes = new Uint8Array(await readFile(sourcePath));
    const scan = scanV3DecomposeContent(sourceUnit.sourceLocator.artifact, sourceBytes);
    if (scan.status !== "scanned") throw new Error(scan.reason);
    const resolved = resolveV3DecomposeContentLocator(
      scan.units,
      sourceUnit.sourceLocator,
      sourceUnit.sourceLocator.artifact,
    );
    if (resolved.status !== "resolved") throw new Error(resolved.reason);
    const changed = Buffer.concat([
      sourceBytes.slice(0, resolved.unit.byteRange.end),
      Buffer.from("Changed after additive landing.\n", "utf8"),
      sourceBytes.slice(resolved.unit.byteRange.end),
    ]);
    await writeFile(sourcePath, changed);
    await git(fixture.repo, ["add", sourceUnit.sourcePath]);
    await git(fixture.repo, ["commit", "-m", "change transferred source bytes"]);

    await expect(previewFinish(fixture)).resolves.toMatchObject({
      status: "refused",
      reason: "source:source-units",
      locus: sourceUnit.sourcePath,
      evidence: {
        expected: { before: { contentDigest: digestBytes(sourceBytes) } },
        actual: { contentDigest: digestBytes(changed), byteLength: changed.byteLength },
      },
    });
  });

  it("refuses when the configured base moves during destination proof", async () => {
    const fixture = await landedExtractionRepository();
    await git(fixture.repo, ["switch", "main"]);
    await git(fixture.repo, ["switch", "-c", "race-base"]);
    await write(fixture.repo, "race.txt", "race\n");
    await git(fixture.repo, ["add", "race.txt"]);
    await git(fixture.repo, ["commit", "-m", "race base"]);
    const raceHead = (await git(fixture.repo, ["rev-parse", "HEAD"])).trim();
    await git(fixture.repo, ["switch", "feat/origin"]);
    await git(fixture.repo, ["branch", "-f", "main", fixture.landedHead]);
    let baseReads = 0;
    const racedDependencies = {
      ...fixture.dependencies,
      exec: async (...args: Parameters<GitExec>) => {
        if (args[0] === "git"
          && args[1][0] === "rev-parse"
          && args[1][2] === "refs/heads/main^{commit}") {
          baseReads += 1;
          if (baseReads === 2) await git(fixture.repo, ["branch", "-f", "main", raceHead]);
        }
        return await fixture.dependencies.exec(...args);
      },
    };

    await expect(finishGitV3Extraction(racedDependencies, {
      cwd: fixture.repo,
      baseBranch: "main",
      origin: "origin",
      cutMapPath: fixture.cutMapPath,
      applyAuthority: null,
    })).resolves.toMatchObject({
      status: "refused",
      reason: "base-raced",
      locus: "refs/heads/main",
      evidence: { expected: fixture.landedHead, actual: raceHead },
    });
  });

  it("refuses without source mutation when the base moves after verified source capture", async () => {
    const fixture = await landedExtractionRepository();
    const preview = await previewFinish(fixture);
    if (preview.status !== "previewed") throw new Error(JSON.stringify(preview));
    await git(fixture.repo, ["switch", "main"]);
    await git(fixture.repo, ["switch", "-c", "finish-race-base"]);
    await write(fixture.repo, "finish-race.txt", "race\n");
    await git(fixture.repo, ["add", "finish-race.txt"]);
    await git(fixture.repo, ["commit", "-m", "race finish base"]);
    const raceHead = (await git(fixture.repo, ["rev-parse", "HEAD"])).trim();
    await git(fixture.repo, ["switch", "feat/origin"]);
    await git(fixture.repo, ["branch", "-f", "main", fixture.landedHead]);
    const sourcePath = ".arc/active/spec-origin.md";
    const sourceBefore = await readFile(join(fixture.repo, sourcePath), "utf8");
    let baseReads = 0;
    const racedDependencies = {
      ...fixture.dependencies,
      exec: async (...args: Parameters<GitExec>) => {
        if (args[0] === "git"
          && args[1][0] === "rev-parse"
          && args[1][2] === "refs/heads/main^{commit}") {
          baseReads += 1;
          if (baseReads === 3) {
            await git(fixture.repo, ["branch", "-f", "main", raceHead]);
          }
        }
        return await fixture.dependencies.exec(...args);
      },
    };

    await expect(finishGitV3Extraction(racedDependencies, {
      cwd: fixture.repo,
      baseBranch: "main",
      origin: "origin",
      cutMapPath: fixture.cutMapPath,
      applyAuthority: preview.preview.applyAuthority,
    })).resolves.toMatchObject({
      status: "refused",
      reason: "base-raced",
      locus: "refs/heads/main",
      evidence: { expected: fixture.landedHead, actual: raceHead },
    });
    expect(baseReads).toBe(3);
    await expect(readFile(join(fixture.repo, sourcePath), "utf8")).resolves.toBe(sourceBefore);
    expect(await git(fixture.repo, ["status", "--porcelain=v1", "--", sourcePath])).toBe("");
  });

  it("reports source ref and HEAD observations when source moves before apply", async () => {
    const fixture = await landedExtractionRepository();
    const preview = await previewFinish(fixture);
    if (preview.status !== "previewed") throw new Error(JSON.stringify(preview));
    let sourceReads = 0;
    let raceHead: string | null = null;
    const racedDependencies = {
      ...fixture.dependencies,
      exec: async (...args: Parameters<GitExec>) => {
        if (args[0] === "git"
          && args[1][0] === "rev-parse"
          && args[1][2] === "refs/heads/feat/origin^{commit}") {
          sourceReads += 1;
          if (sourceReads === 3) {
            await write(fixture.repo, "source-race-before-apply.txt", "race\n");
            await git(fixture.repo, ["add", "source-race-before-apply.txt"]);
            await git(fixture.repo, ["commit", "-m", "race source before finish apply"]);
            raceHead = (await git(fixture.repo, ["rev-parse", "HEAD"])).trim();
          }
        }
        return await fixture.dependencies.exec(...args);
      },
    };

    const result = await finishGitV3Extraction(racedDependencies, {
      cwd: fixture.repo,
      baseBranch: "main",
      origin: "origin",
      cutMapPath: fixture.cutMapPath,
      applyAuthority: preview.preview.applyAuthority,
    });
    if (raceHead === null) throw new Error("source-race fixture did not move HEAD");
    expect(result).toMatchObject({
      status: "refused",
      reason: "source-raced",
      locus: "refs/heads/feat/origin",
      evidence: {
        expected: {
          ref: fixture.sourceHead,
          branch: "feat/origin",
          head: fixture.sourceHead,
        },
        actual: {
          ref: raceHead,
          branch: "feat/origin",
          head: fixture.sourceHead,
        },
      },
    });
  });

  it("refuses when the surviving source moves during destination proof", async () => {
    const fixture = await landedExtractionRepository();
    let sourceReads = 0;
    let raceHead: string | null = null;
    const racedDependencies = {
      ...fixture.dependencies,
      exec: async (...args: Parameters<GitExec>) => {
        if (args[0] === "git"
          && args[1][0] === "rev-parse"
          && args[1][2] === "refs/heads/feat/origin^{commit}") {
          sourceReads += 1;
          if (sourceReads === 2) {
            await write(fixture.repo, "source-race.txt", "race\n");
            await git(fixture.repo, ["add", "source-race.txt"]);
            await git(fixture.repo, ["commit", "-m", "race source"]);
            raceHead = (await git(fixture.repo, ["rev-parse", "HEAD"])).trim();
          }
        }
        return await fixture.dependencies.exec(...args);
      },
    };

    const result = await finishGitV3Extraction(racedDependencies, {
      cwd: fixture.repo,
      baseBranch: "main",
      origin: "origin",
      cutMapPath: fixture.cutMapPath,
      applyAuthority: null,
    });
    if (raceHead === null) throw new Error("source-race fixture did not move HEAD");
    expect(result).toMatchObject({
      status: "refused",
      reason: "source-raced",
      locus: "refs/heads/feat/origin",
      evidence: {
        expected: {
          ref: fixture.sourceHead,
          branch: "feat/origin",
          head: fixture.sourceHead,
        },
        actual: {
          ref: raceHead,
          branch: "feat/origin",
          head: fixture.sourceHead,
        },
      },
    });
  });

  it("forwards byte input through the repository raw Git boundary", async () => {
    const { repo } = await startedRepository();
    const sentinel = "planning-lane raw input\n";
    const sentinelPath = ".arc/reference/planning-lane-raw-input.txt";
    await write(repo, sentinelPath, sentinel);
    const expectedObjectId = (await git(repo, ["hash-object", sentinelPath])).trim();

    const result = await createRawGitExec(repo)(["hash-object", "--stdin"], {
      input: new TextEncoder().encode(sentinel),
    });

    expect(new TextDecoder().decode(result.stdout).trim()).toBe(expectedObjectId);
  });

  it("keeps local and hosted exact-ref verdicts aligned for generic transition records", async () => {
    const { repo, baseHead, planningHead } = await genericPlanningLaneRepository();
    const runHosted = async (head: string) => await runCli([
      "review",
      "planning-lane",
      baseHead,
      head,
      "--repository",
      repo,
    ], { cwd: repo, timeout: 30_000 });
    const runLocal = async (head: string) => await runScript(CLASSIFY_SCRIPT, [
      "planning-lane",
      baseHead,
      head,
    ], {
      cwd: repo,
      env: { ARC_PLANNING_CLI: CLI_PATH, CLASSIFY_REPOSITORY_DIR: repo },
      timeout: 30_000,
    });

    await expect(runHosted(planningHead)).resolves.toMatchObject({
      exitCode: 0,
      stdout: "planning\n",
      stderr: "",
    });
    await expect(runLocal(planningHead)).resolves.toMatchObject({
      exitCode: 0,
      stdout: "planning\n",
      stderr: "",
    });

    await write(repo, ".arc/system/.internal/scripts/check.sh", "exit 0\n");
    await git(repo, ["add", "."]);
    await git(repo, ["commit", "-m", "add executable rider"]);
    const reviewedHead = (await git(repo, ["rev-parse", "HEAD"])).trim();

    await expect(runHosted(reviewedHead)).resolves.toMatchObject({
      exitCode: 0,
      stdout: "reviewed\n",
      stderr: "",
    });
    await expect(runLocal(reviewedHead)).resolves.toMatchObject({
      exitCode: 0,
      stdout: "reviewed\n",
      stderr: "",
    });
  }, 30_000);

  it("binds a real started source and distinct base predecessor without mutating either checkout", async () => {
    const { repo, baseHead, sourceHead, completedMap, dependencies } = await startedRepository();
    const refsBefore = await git(repo, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads"]);
    const statusBefore = await git(repo, ["status", "--porcelain=v1"]);

    const result = await composeGitV3RepositoryPlan(dependencies, "main", completedMap);

    expect(result.status, JSON.stringify(result)).toBe("composed");
    if (result.status !== "composed") return;
    expect(result.plan.sourceHead).toBe(sourceHead);
    expect(result.plan.expectedBaseHead).toBe(baseHead);
    expect(result.plan.roadmap?.after).toMatchObject({ kind: "file" });
    expect(result.plan.allowedPaths).toContain(".arc/backlog/planned/origin/draft-origin.md");
    expect(result.plan.allowedPaths).toContain(".arc/active/draft-origin.md");
    expect(await git(repo, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads"]))
      .toBe(refsBefore);
    expect(await git(repo, ["status", "--porcelain=v1"])).toBe(statusBefore);
  });

  it("reads each repository-plan tree once and hydrates only its enumerated objects", async () => {
    const { baseHead, sourceHead, completedMap, dependencies } = await startedRepository();
    const fullTreeReads: string[] = [];
    const enumeratedObjects = new Set<string>();
    const hydratedObjects: string[] = [];
    const measured = {
      ...dependencies,
      exec: async (...args: Parameters<typeof dependencies.exec>) => {
        const result = await dependencies.exec(...args);
        const gitArgs = args[1];
        if (gitArgs[0] === "ls-tree"
          && gitArgs.some((arg) => arg.includes("%(objectname)%x09"))) {
          const oid = gitArgs.at(-1);
          if (oid !== undefined) fullTreeReads.push(oid);
          for (const entry of result.stdout.split("\0").filter(Boolean)) {
            const match = /^\d{6} [^ ]+ ([0-9a-f]{40,64})\t/u.exec(entry);
            if (match?.[1] !== undefined) enumeratedObjects.add(match[1]);
          }
        }
        return result;
      },
      readObject: async (oid: string) => {
        hydratedObjects.push(oid);
        return await dependencies.readObject(oid);
      },
    };

    const result = await composeGitV3RepositoryPlan(measured, "main", completedMap);

    expect(result.status, JSON.stringify(result)).toBe("composed");
    expect(fullTreeReads).toHaveLength(3);
    expect(fullTreeReads.filter((oid) => oid === sourceHead)).toHaveLength(1);
    expect(fullTreeReads.filter((oid) => oid === baseHead)).toHaveLength(2);
    expect(hydratedObjects.length).toBeGreaterThan(0);
    expect(hydratedObjects.every((oid) => enumeratedObjects.has(oid))).toBe(true);
  });

  it("keeps a source-private rider outside relocated companion authority", async () => {
    const { completedMap, dependencies } = await startedRepository({
      companionCoverage: true,
      sourceRider: true,
    });

    const result = await composeGitV3RepositoryPlan(dependencies, "main", completedMap);

    expect(result).toEqual({
      status: "refused",
      refusal: {
        stage: "retirement",
        reason: "source-private-added",
        locus: ".arc/reference/supporting-origin.md",
      },
    });
  });

  it("executes and re-advances relocated companions from pinned Git trees", async () => {
    const {
      repo,
      baseHead,
      sourceHead,
      completedMap,
      dependencies,
    } = await startedRepository({ companionCoverage: true });
    const mapBefore = canonicalize(completedMap);
    const predecessorDirectory = ".arc/backlog/planned/origin";
    const assurancePredecessor = `${predecessorDirectory}/assurance-origin.md`;
    const unrelatedSibling = `${predecessorDirectory}/README.md`;
    const memberDirectory = ".arc/backlog/planned/member";
    const memberTasks = `${memberDirectory}/tasks-member.md`;
    const memberNotes = `${memberDirectory}/notes-member.md`;

    expect(await git(repo, ["show", `${baseHead}:${assurancePredecessor}`]))
      .toContain("Preserve the nonstandard guarantee.");
    expect(await git(repo, ["show", `${sourceHead}:.arc/active/assurance-origin.md`]))
      .toContain("Preserve the nonstandard guarantee.");
    await expect(readBlob(repo, sourceHead, assurancePredecessor)).resolves.toBeNull();
    const taskPhases = completedMap.machine.sourceUnits.flatMap((unit) =>
      unit.sourcePath.endsWith("/tasks-origin.md") && unit.sourceLocator.kind === "section"
        ? [{
            headingSource: unit.sourceLocator.headingSource,
            disposition: completedMap.authoring.sourceAllocations.find(
              ({ sourceId }) => sourceId === unit.sourceId,
            )?.disposition,
          }]
        : []);
    expect(taskPhases.map(({ headingSource }) => headingSource).sort()).toEqual([
      "Phase One",
      "Phase Two",
    ]);
    expect(taskPhases.map(({ disposition }) => disposition)).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "target", destinationId: "existing" }),
      expect.objectContaining({ kind: "target", destinationId: "member" }),
    ]));

    const composed = await composeGitV3RepositoryPlan(dependencies, "main", completedMap);

    expect(composed.status, JSON.stringify(composed)).toBe("composed");
    if (composed.status !== "composed") return;
    const composedPlan = canonicalize(composed.plan);
    const predecessorRetirements = composed.plan.mutations.filter((mutation) =>
      mutation.kind === "exclusive" && mutation.path.startsWith(`${predecessorDirectory}/`));
    expect(predecessorRetirements.map(({ path }) => path)).toEqual([
      assurancePredecessor,
      `${predecessorDirectory}/draft-origin.md`,
      `${predecessorDirectory}/meta-origin.md`,
      `${predecessorDirectory}/notes-origin.md`,
      `${predecessorDirectory}/tasks-origin.md`,
    ]);
    expect(predecessorRetirements).toContainEqual(expect.objectContaining({
      path: assurancePredecessor,
      role: "retiring-source",
      before: expect.objectContaining({ kind: "file" }),
      after: { kind: "absent" },
    }));
    expect(predecessorRetirements).toContainEqual(expect.objectContaining({
      path: `${predecessorDirectory}/meta-origin.md`,
      role: "predecessor-retirement",
    }));
    expect(composed.plan.mutations).toContainEqual(expect.objectContaining({
      kind: "exclusive",
      path: ".arc/active/assurance-origin.md",
      role: "retiring-source",
    }));
    expect(composed.plan.allowedPaths).not.toContain(unrelatedSibling);
    expect(composed.plan.mutations.some(({ path }) => path === unrelatedSibling)).toBe(false);

    const staged = await executeGitV3DecomposeOperation({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    });
    expect(staged.status, JSON.stringify(staged)).toBe("staged");
    if (staged.status !== "staged" || staged.operation.occupation.protection !== "full") return;
    expect(canonicalize(staged.plan)).toBe(composedPlan);
    const stagedPlan = canonicalize(staged.plan);
    const stagedReport = canonicalize(staged.operation.report);
    expect(staged.operation.report.destinations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: memberTasks,
        authoring: {
          artifactRole: "tasks",
          contributorKind: "provisional-task",
          disposition: "whole-file",
        },
      }),
      expect.objectContaining({
        path: memberNotes,
        authoring: {
          artifactRole: "notes",
          contributorKind: "provisional-notes",
          disposition: "whole-file",
        },
      }),
      expect.objectContaining({
        path: memberNotes,
        authoring: expect.objectContaining({ contributorKind: "allocation" }),
      }),
      expect.objectContaining({
        path: ".arc/reference/shared.md",
        authoring: expect.objectContaining({ contributorKind: "allocation" }),
      }),
    ]));
    const candidatePath = staged.operation.occupation.path;
    await expect(readFile(join(candidatePath, memberTasks), "utf8"))
      .resolves.toContain("# Task List: member");
    await expect(readFile(join(candidatePath, memberNotes), "utf8"))
      .resolves.toContain("# Notes: member");
    await expect(readFile(join(candidatePath, ".arc/reference/shared.md"), "utf8"))
      .resolves.toContain("Existing companion content.");
    await expect(pathExists(join(candidatePath, assurancePredecessor))).resolves.toBe(false);
    await expect(pathExists(join(candidatePath, unrelatedSibling))).resolves.toBe(true);

    await git(candidatePath, ["commit", "-m", "commit companion decomposition"]);
    const candidateHead = (await git(candidatePath, ["rev-parse", "HEAD"])).trim();
    await write(repo, ".arc/reference/base-growth.txt", "descendant base\n");
    await git(repo, ["add", ".arc/reference/base-growth.txt"]);
    await git(repo, ["commit", "-m", "advance base"]);
    const currentBaseHead = (await git(repo, ["rev-parse", "main"])).trim();

    const advanced = await advanceGitDecomposeTransitionBase(dependencies, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    });

    expect(advanced).toEqual({
      status: "advanced",
      candidateBranch: "chore/decompose-origin",
      candidateHead,
      previousBaseHead: baseHead,
      currentBaseHead,
    });
    expect(canonicalize(completedMap)).toBe(mapBefore);
    expect(canonicalize(staged.plan)).toBe(stagedPlan);
    expect(canonicalize(staged.operation.report)).toBe(stagedReport);
    expect((await git(candidatePath, ["rev-parse", "MERGE_HEAD"])).trim()).toBe(currentBaseHead);
    await expect(readFile(join(candidatePath, ".arc/reference/base-growth.txt"), "utf8"))
      .resolves.toBe("descendant base\n");
    await expect(readFile(join(candidatePath, memberTasks), "utf8"))
      .resolves.toContain("Second phase content.");
    await expect(readFile(join(candidatePath, memberNotes), "utf8"))
      .resolves.toContain("Preserve the motivating evidence.");
    await expect(pathExists(join(candidatePath, assurancePredecessor))).resolves.toBe(false);
    await expect(pathExists(join(candidatePath, unrelatedSibling))).resolves.toBe(true);
    expect((await git(repo, ["rev-parse", "plan/origin"])).trim()).toBe(sourceHead);
  });

  it("retires a copied real notes origin without post-transition repair", async () => {
    const fixture = await copiedRealNotesRepository();
    const inventoryPaths = fixture.preflight.sourceArtifactInventory.map(({ path }) => path);
    const contentPaths = inventoryPaths.filter((path) => !path.endsWith(`/meta-${fixture.origin}.md`));
    const targetedPaths = new Set<string>();
    const droppedPaths = new Set<string>();
    for (const unit of fixture.completedMap.machine.sourceUnits) {
      const allocation = fixture.completedMap.authoring.sourceAllocations.find(
        ({ sourceId }) => sourceId === unit.sourceId,
      );
      if (allocation?.disposition.kind === "target") targetedPaths.add(unit.sourcePath);
      if (allocation?.disposition.kind === "drop") droppedPaths.add(unit.sourcePath);
    }
    expect([...new Set([...targetedPaths, ...droppedPaths])].sort()).toEqual(contentPaths.sort());
    expect([...targetedPaths].sort()).toEqual([
      `${fixture.sourceDirectory}/notes-${fixture.origin}.md`,
      `${fixture.sourceDirectory}/spec-${fixture.origin}.md`,
    ]);
    expect([...droppedPaths]).toEqual([`${fixture.sourceDirectory}/tasks-${fixture.origin}.md`]);
    expect(fixture.source.notes.length).toBeGreaterThan(40_000);
    expect(fixture.source.notes).toContain("## Evidence and Conservation Grounding");
    const scannedTasks = scanV3DecomposeContent(
      `tasks-${fixture.origin}.md`,
      new TextEncoder().encode(fixture.source.tasks),
    );
    expect(scannedTasks.status).toBe("scanned");
    if (scannedTasks.status !== "scanned") return;
    expect(Buffer.concat(scannedTasks.units.map(({ bytes }) => Buffer.from(bytes))).toString())
      .toBe(fixture.source.tasks);
    const taskUnits = fixture.completedMap.machine.sourceUnits.filter((unit) =>
      unit.sourcePath.endsWith(`/tasks-${fixture.origin}.md`));
    expect(taskUnits).toHaveLength(scannedTasks.units.length);
    expect(taskUnits.map((unit) => fixture.completedMap.authoring.sourceAllocations.find(
      ({ sourceId }) => sourceId === unit.sourceId,
    )?.disposition)).toEqual(taskUnits.map(() => ({
      kind: "drop",
      reason: "the completed delivery record is historical",
    })));

    const staged = await executeGitV3DecomposeCommand({
      ...fixture.dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "partial",
      baseBranch: "main",
      origin: fixture.origin,
      cutMapPath: fixture.cutMapPath,
    });

    expect(staged.status, JSON.stringify(staged)).toBe("staged");
    if (staged.status !== "staged") return;
    expect(staged.operation.report.status).toBe("reported");
    const memberDirectory = `.arc/backlog/planned/${fixture.member}`;
    const memberSpec = `${memberDirectory}/spec-${fixture.member}.md`;
    const memberNotes = `${memberDirectory}/notes-${fixture.member}.md`;
    const memberTasks = `${memberDirectory}/tasks-${fixture.member}.md`;
    expect(staged.operation.report.destinations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: memberNotes,
        authoring: {
          artifactRole: "notes",
          contributorKind: "provisional-notes",
          disposition: "whole-file",
        },
      }),
      expect.objectContaining({
        path: memberNotes,
        authoring: expect.objectContaining({ contributorKind: "allocation" }),
      }),
    ]));
    expect(staged.operation.report.destinations.some(({ path }) => path === memberTasks)).toBe(false);
    const retitled = (content: string): string => {
      const lines = content.split("\n");
      if (lines[0]?.includes(fixture.origin) === true) {
        lines[0] = lines[0].replace(fixture.origin, fixture.member);
      }
      return lines.join("\n");
    };
    await expect(readFile(join(fixture.repo, memberSpec), "utf8"))
      .resolves.toBe(retitled(fixture.source.spec));
    await expect(readFile(join(fixture.repo, memberNotes), "utf8"))
      .resolves.toBe(retitled(fixture.source.notes));
    await expect(pathExists(join(fixture.repo, memberTasks))).resolves.toBe(false);
    await expect(readFile(join(fixture.repo, memberDirectory, `meta-${fixture.member}.md`), "utf8"))
      .resolves.toContain("- **Task List:** [none]");
    for (const sourcePath of inventoryPaths) {
      await expect(pathExists(join(fixture.repo, sourcePath))).resolves.toBe(false);
    }
  });

  it("stages the same lean transition through exact full and partial repository loci", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    const full = await executeGitV3DecomposeOperation({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    });
    expect(full.status, JSON.stringify(full)).toBe("staged");
    if (full.status !== "staged") return;
    expect(full.operation.occupation).toMatchObject({
      status: "occupied",
      protection: "full",
      candidateBranch: "chore/decompose-origin",
    });
    expect(full.operation.transitionRecord).toMatchObject({ kind: "decompose", origin: "origin" });
    expect(await git(repo, ["status", "--porcelain=v1"])).toBe("");

    const partial = await executeGitV3DecomposeOperation({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "partial",
      baseBranch: "main",
      completedMap,
    });
    expect(partial.status, JSON.stringify(partial)).toBe("staged");
    if (partial.status !== "staged") return;
    expect(partial.operation.occupation).toEqual({
      status: "occupied",
      protection: "partial",
    });
    expect(partial.plan).toEqual(full.plan);
    expect(partial.operation.report).toEqual(full.operation.report);
    expect(partial.operation.transitionRecord).toEqual(full.operation.transitionRecord);
    const appliedPaths = partial.operation.materialization.paths
      .filter(({ disposition }) => disposition === "applied")
      .map(({ path }) => path)
      .concat(resolveTransitionRecordRelativePath("origin"));
    expect(await git(repo, ["diff", "--cached", "--name-only", "--no-renames"]))
      .toBe(`${appliedPaths.join("\n")}\n`);
  });

  it("advances a committed transition candidate over a descendant base without rewriting it", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    const staged = await executeGitV3DecomposeOperation({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    });
    expect(staged.status, JSON.stringify(staged)).toBe("staged");
    if (staged.status !== "staged" || staged.operation.occupation.protection !== "full") return;
    const candidatePath = staged.operation.occupation.path;
    await git(candidatePath, ["commit", "-m", "commit decomposition transition"]);
    const candidateHead = (await git(candidatePath, ["rev-parse", "HEAD"])).trim();

    await write(repo, ".arc/reference/base-growth.txt", "descendant base\n");
    await git(repo, ["add", ".arc/reference/base-growth.txt"]);
    await git(repo, ["commit", "-m", "advance base"]);
    const currentBaseHead = (await git(repo, ["rev-parse", "main"])).trim();

    const result = await advanceGitDecomposeTransitionBase(dependencies, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    });

    expect(result).toEqual({
      status: "advanced",
      candidateBranch: "chore/decompose-origin",
      candidateHead,
      previousBaseHead: completedMap.machine.resultBase.head,
      currentBaseHead,
    });
    expect((await git(candidatePath, ["rev-parse", "HEAD"])).trim()).toBe(candidateHead);
    expect((await git(candidatePath, ["rev-parse", "MERGE_HEAD"])).trim()).toBe(currentBaseHead);
  });

  it("recomposes once during advancement without completed-target path reads", async () => {
    const started = await startedRepository({ completedTarget: true });
    started.completedMap.authoring.externalEdges = [{ from: "member", to: "foundation" }];
    const staged = await executeGitV3DecomposeOperation({
      ...started.dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      completedMap: started.completedMap,
    });
    expect(staged.status, JSON.stringify(staged)).toBe("staged");
    if (staged.status !== "staged" || staged.operation.occupation.protection !== "full") return;
    await git(staged.operation.occupation.path, ["commit", "-m", "commit external transition"]);
    await write(started.repo, ".arc/reference/base-growth.txt", "descendant base\n");
    await git(started.repo, ["add", ".arc/reference/base-growth.txt"]);
    await git(started.repo, ["commit", "-m", "advance base"]);
    const observedArgs: string[][] = [];
    const measuredBase = {
      ...started.dependencies,
      exec: async (...args: Parameters<typeof started.dependencies.exec>) => {
        observedArgs.push([...args[1]]);
        return await started.dependencies.exec(...args);
      },
    };
    let recompositions = 0;

    const result = await advanceGitDecomposeTransitionBase({
      ...measuredBase,
      composePlan: async (baseRef, map) => {
        recompositions += 1;
        return await composeGitV3RepositoryPlan(measuredBase, baseRef, map);
      },
    }, {
      protection: "full",
      baseBranch: "main",
      completedMap: started.completedMap,
    });

    expect(result.status).toBe("advanced");
    expect(recompositions).toBe(1);
    expect(observedArgs.some((args) => args.some((arg) =>
      arg.includes(".arc/completed") || arg.includes("foundation")))).toBe(false);
  });

  it("re-advances through a validated first-parent base-merge chain", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    const staged = await executeGitV3DecomposeOperation({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    });
    expect(staged.status, JSON.stringify(staged)).toBe("staged");
    if (staged.status !== "staged" || staged.operation.occupation.protection !== "full") return;
    const candidatePath = staged.operation.occupation.path;
    await git(candidatePath, ["commit", "-m", "commit decomposition transition"]);

    await write(repo, ".arc/reference/base-growth.txt", "first descendant\n");
    await git(repo, ["add", ".arc/reference/base-growth.txt"]);
    await git(repo, ["commit", "-m", "first base advance"]);
    const firstBaseHead = (await git(repo, ["rev-parse", "main"])).trim();
    expect(await advanceGitDecomposeTransitionBase(dependencies, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    })).toMatchObject({ status: "advanced", currentBaseHead: firstBaseHead });
    await git(candidatePath, ["commit", "-m", "absorb first base advance"]);
    const candidateHead = (await git(candidatePath, ["rev-parse", "HEAD"])).trim();

    await write(repo, ".arc/reference/base-growth-2.txt", "second descendant\n");
    await git(repo, ["add", ".arc/reference/base-growth-2.txt"]);
    await git(repo, ["commit", "-m", "second base advance"]);
    const currentBaseHead = (await git(repo, ["rev-parse", "main"])).trim();

    expect(await advanceGitDecomposeTransitionBase(dependencies, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    })).toEqual({
      status: "advanced",
      candidateBranch: "chore/decompose-origin",
      candidateHead,
      previousBaseHead: firstBaseHead,
      currentBaseHead,
    });
    expect((await git(candidatePath, ["rev-parse", "HEAD"])).trim()).toBe(candidateHead);
    expect((await git(candidatePath, ["rev-parse", "MERGE_HEAD"])).trim()).toBe(currentBaseHead);
  });

  it.each([
    ["authenticated base", "authored", "current"],
    ["recorded advancement chain", "authored", "first"],
    ["remaining live base", "first", "current"],
  ] as const)("reports an unavailable ancestry probe for the %s", async (
    _site,
    ancestorKey,
    descendantKey,
  ) => {
    const fixture = await reAdvancedTransitionCandidate();
    const authoredBaseHead = fixture.completedMap.machine.resultBase.head;
    const heads = {
      authored: authoredBaseHead,
      first: fixture.firstBaseHead,
      current: fixture.currentBaseHead,
    };
    const failedAncestor = heads[ancestorKey];
    const failedDescendant = heads[descendantKey];
    const dependencies = {
      ...fixture.dependencies,
      exec: async (...args: Parameters<typeof fixture.dependencies.exec>) => {
        if (
          args[1][0] === "merge-base"
          && args[1][1] === "--is-ancestor"
          && args[1][2] === failedAncestor
          && args[1][3] === failedDescendant
        ) {
          throw Object.assign(new Error("ancestry probe unavailable"), {
            exitCode: 128,
            stderr: "ancestry probe unavailable",
          });
        }
        return await fixture.dependencies.exec(...args);
      },
    };

    const result = await advanceGitDecomposeTransitionBase(dependencies, {
      protection: "full",
      baseBranch: "main",
      completedMap: fixture.completedMap,
    });

    expect(result).toMatchObject({
      status: "refused",
      reason: "base-ancestry-unavailable",
      locus: expect.stringContaining("ancestry probe unavailable"),
    });
    expect(result).not.toHaveProperty("evidence");
    expect((await git(fixture.candidatePath, ["rev-parse", "HEAD"])).trim())
      .toBe(fixture.candidateHead);
    expect(await git(fixture.candidatePath, ["status", "--porcelain=v1"])).toBe("");
  });

  it("preserves a composing plan refusal through base advancement", async () => {
    const { completedMap, dependencies } = await committedTransitionCandidate();
    const evidence = { expected: ["member"], actual: ["other-member"] };

    const result = await advanceGitDecomposeTransitionBase({
      ...dependencies,
      composePlan: async () => ({
        status: "refused",
        refusal: {
          stage: "dependency",
          reason: "dependency-target-mismatch",
          locus: "member",
          evidence,
        },
      }),
    }, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    });

    expect(result).toEqual({
      status: "refused",
      reason: "advancement-plan-refused:dependency:dependency-target-mismatch",
      locus: "member",
      evidence,
    });
  });

  it("reports the planned and committed path sets for a candidate mismatch", async () => {
    const { baseHead, candidatePath, candidateHead, completedMap, dependencies } =
      await committedTransitionCandidate();
    const expected = (await git(candidatePath, [
      "diff-tree",
      "--no-commit-id",
      "--name-only",
      "--no-renames",
      "-r",
      baseHead,
      candidateHead,
    ])).trim().split("\n");
    await write(candidatePath, "zz-extra.txt", "unplanned\n");
    await git(candidatePath, ["add", "zz-extra.txt"]);
    await git(candidatePath, ["commit", "--amend", "--no-edit"]);
    const actual = [...expected, "zz-extra.txt"];

    expect(await advanceGitDecomposeTransitionBase(dependencies, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    })).toEqual({
      status: "refused",
      reason: "candidate-transform-mismatch:changed-paths",
      locus: "zz-extra.txt",
      evidence: { expected, actual },
    });
  });

  it("reports the planned and committed path states for a candidate mismatch", async () => {
    const { candidatePath, candidateHead, completedMap, dependencies } =
      await committedTransitionCandidate();
    const path = ".arc/backlog/planned/member/draft-member.md";
    const expectedBytes = await readBlob(candidatePath, candidateHead, path);
    if (expectedBytes === null) throw new Error(`missing expected candidate path: ${path}`);
    const expected = {
      kind: "file" as const,
      mode: "100644" as const,
      contentDigest: digestBytes(expectedBytes),
    };
    await write(candidatePath, path, "# Changed candidate draft\n");
    await git(candidatePath, ["add", path]);
    await git(candidatePath, ["commit", "--amend", "--no-edit"]);
    const actualBytes = await readBlob(candidatePath, "HEAD", path);
    if (actualBytes === null) throw new Error(`missing changed candidate path: ${path}`);
    const actual = {
      kind: "file" as const,
      mode: "100644" as const,
      contentDigest: digestBytes(actualBytes),
    };

    expect(await advanceGitDecomposeTransitionBase(dependencies, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    })).toEqual({
      status: "refused",
      reason: "candidate-transform-mismatch:path-state",
      locus: path,
      evidence: { expected, actual },
    });
  });

  it.each([
    ["candidate", "chore/decompose-origin"],
    ["base", "main"],
  ] as const)("refuses a missing %s binding before merge mutation", async (_binding, missingRef) => {
    const { repo, baseHead, candidatePath, candidateHead, completedMap, dependencies } =
      await committedTransitionCandidate();
    let mergeAttempts = 0;
    const guardedDependencies = {
      ...dependencies,
      exec: async (...args: Parameters<typeof dependencies.exec>) => {
        if (args[1][0] === "merge") mergeAttempts += 1;
        if (args[1][0] === "rev-parse" && args[1][2] === `${missingRef}^{commit}`) {
          throw new Error(`missing ${missingRef}`);
        }
        return await dependencies.exec(...args);
      },
    };

    expect(await advanceGitDecomposeTransitionBase(guardedDependencies, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    })).toEqual({ status: "refused", reason: "binding-unavailable" });
    expect(mergeAttempts).toBe(0);
    expect((await git(candidatePath, ["rev-parse", "HEAD"])).trim()).toBe(candidateHead);
    expect((await git(repo, ["rev-parse", "main"])).trim()).toBe(baseHead);
    expect(await git(candidatePath, ["status", "--porcelain=v1"])).toBe("");
  });

  it("refuses a committed candidate whose lean transition result was altered", async () => {
    const { candidatePath, candidateHead, completedMap, dependencies } =
      await committedTransitionCandidate();
    const recordPath = resolveTransitionRecordRelativePath("origin");
    const expectedBytes = await readBlob(candidatePath, candidateHead, recordPath);
    if (expectedBytes === null) throw new Error("missing expected transition record");
    await writeFile(join(candidatePath, recordPath), "{}\n");
    await git(candidatePath, ["add", recordPath]);
    await git(candidatePath, ["commit", "--amend", "--no-edit"]);
    const actualBytes = await readBlob(candidatePath, "HEAD", recordPath);
    if (actualBytes === null) throw new Error("missing altered transition record");

    expect(await advanceGitDecomposeTransitionBase(dependencies, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    })).toEqual({
      status: "refused",
      reason: "candidate-transform-mismatch:transition-record",
      locus: recordPath,
      evidence: {
        expected: {
          kind: "file",
          mode: "100644",
          contentDigest: digestBytes(expectedBytes),
        },
        actual: {
          kind: "file",
          mode: "100644",
          contentDigest: digestBytes(actualBytes),
        },
      },
    });
  });

  it("reports the expected and observed candidate registration count", async () => {
    const { completedMap, dependencies } = await committedTransitionCandidate();

    expect(await advanceGitDecomposeTransitionBase({
      ...dependencies,
      scanWorktrees: async () => ({ ok: true, worktrees: [] }),
    }, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    })).toEqual({
      status: "refused",
      reason: "candidate-registration-mismatch",
      locus: "chore/decompose-origin",
      evidence: {
        expected: { candidateBranch: "chore/decompose-origin", registrationCount: 1 },
        actual: { candidateBranch: "chore/decompose-origin", registrationCount: 0 },
      },
    });
  });

  it("reports the expected and observed candidate worktree marker", async () => {
    const { candidatePath, completedMap, dependencies } = await committedTransitionCandidate();

    expect(await advanceGitDecomposeTransitionBase({
      ...dependencies,
      readMarker: async () => ({
        kind: "present",
        marker: {
          spawnedByArc: true,
          spawningIdentity: "andrew",
          createdAt: "2026-09-08T00:00:00.000Z",
          createdFor: { kind: "branch", ref: "chore/decompose-other" },
        },
      }),
    }, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    })).toEqual({
      status: "refused",
      reason: "candidate-marker-mismatch",
      locus: candidatePath,
      evidence: {
        expected: {
          kind: "present",
          spawnedByArc: true,
          createdFor: { kind: "branch", ref: "chore/decompose-origin" },
        },
        actual: {
          kind: "present",
          spawnedByArc: true,
          createdFor: { kind: "branch", ref: "chore/decompose-other" },
        },
      },
    });
  });

  it("keeps a malformed candidate worktree marker locus-only", async () => {
    const { candidatePath, completedMap, dependencies } = await committedTransitionCandidate();
    const markerPath = join(candidatePath, ".arc/system/.internal/worktree-marker.json");

    expect(await advanceGitDecomposeTransitionBase({
      ...dependencies,
      readMarker: async () => ({ kind: "malformed", message: "invalid marker", path: markerPath }),
    }, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    })).toEqual({
      status: "refused",
      reason: "candidate-marker-mismatch",
      locus: markerPath,
    });
  });

  it("refuses a non-merge commit appended after the initial transition", async () => {
    const { candidatePath, completedMap, dependencies } = await committedTransitionCandidate();
    await write(candidatePath, ".arc/reference/unrelated-candidate-change.txt", "unrelated\n");
    await git(candidatePath, ["add", ".arc/reference/unrelated-candidate-change.txt"]);
    await git(candidatePath, ["commit", "-m", "append unrelated candidate change"]);

    expect(await advanceGitDecomposeTransitionBase(dependencies, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    })).toMatchObject({ status: "refused", reason: "candidate-advancement-chain-invalid" });
  });

  it("refuses a configured base that regressed behind the authored base", async () => {
    const { repo, completedMap, dependencies } = await committedTransitionCandidate();
    await git(repo, ["reset", "--hard", `${completedMap.machine.resultBase.head}^`]);
    const regressedBaseHead = (await git(repo, ["rev-parse", "main"])).trim();

    expect(await advanceGitDecomposeTransitionBase(dependencies, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    })).toEqual({
      status: "refused",
      reason: "base-not-descendant",
      locus: "main",
      evidence: {
        expected: completedMap.machine.resultBase.head,
        actual: regressedBaseHead,
      },
    });
  });

  it("refuses a descendant base that acquired a new incoming dependency", async () => {
    const { repo, completedMap, dependencies } = await committedTransitionCandidate();
    const addedDependents = ["z-dependent", "a-dependent"];
    for (const dependent of addedDependents) {
      await write(repo, `.arc/backlog/planned/${dependent}/meta-${dependent}.md`, renderMetaFile(dependent, {
        state: "Planning",
        owner: "andrew",
        workClass: "Light",
        priority: "P2",
        dependsOn: ["origin"],
        origin: "internal",
        design: [`draft-${dependent}.md`],
        currentWorkflow: "draft-design",
        nextAction: "Begin draft-design",
      }));
    }
    await git(repo, ["add", ".arc/backlog/planned"]);
    await git(repo, ["commit", "-m", "add incoming dependency"]);
    const expected = sortByCanonicalBytes(completedMap.machine.incomingEdges);
    const actual = sortByCanonicalBytes([
      ...expected,
      ...addedDependents.map((dependent) => ({
        edgeId: v3IncomingEdgeId({ dependent, currentTargets: ["origin"] }),
        dependent,
        currentTargets: ["origin"],
      })),
    ]);
    const locus = actual.find((edge, index) => {
      const expectedEdge = expected[index];
      return expectedEdge === undefined || canonicalize(edge) !== canonicalize(expectedEdge);
    })?.dependent;
    if (locus === undefined) throw new Error("missing incoming-dependency mismatch locus");

    const result = await advanceGitDecomposeTransitionBase(dependencies, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    });
    expect(result).toEqual({
      status: "refused",
      reason: "base-acquired-incoming-dependency",
      locus,
      evidence: { expected, actual },
    });
  });

  it("restores the pinned candidate after a conflicting base merge", async () => {
    const { repo, candidatePath, candidateHead, completedMap, dependencies } =
      await committedTransitionCandidate();
    await write(repo, ".arc/backlog/ROADMAP.md", "# Conflicting base roadmap\n");
    await git(repo, ["add", ".arc/backlog/ROADMAP.md"]);
    await git(repo, ["commit", "-m", "change base roadmap"]);

    expect(await advanceGitDecomposeTransitionBase(dependencies, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    })).toMatchObject({ status: "refused", reason: "merge-refused" });
    expect((await git(candidatePath, ["rev-parse", "HEAD"])).trim()).toBe(candidateHead);
    expect(await git(candidatePath, ["status", "--porcelain=v1"])).toBe("");
    await expect(git(candidatePath, ["rev-parse", "MERGE_HEAD"])).rejects.toThrow();
  });

  it("restores the pinned candidate when the configured base races post-merge validation", async () => {
    const { repo, candidatePath, candidateHead, completedMap, dependencies } =
      await committedTransitionCandidate();
    await write(repo, ".arc/reference/base-growth.txt", "descendant base\n");
    await git(repo, ["add", ".arc/reference/base-growth.txt"]);
    await git(repo, ["commit", "-m", "advance base"]);
    const expectedBaseHead = (await git(repo, ["rev-parse", "main"])).trim();
    let raced = false;
    let racedBaseHead: string | null = null;
    const racingDependencies = {
      ...dependencies,
      exec: async (...args: Parameters<typeof dependencies.exec>) => {
        if (!raced && args[1][0] === "ls-files" && args[2]?.cwd === candidatePath) {
          raced = true;
          await git(repo, ["commit", "--allow-empty", "-m", "race base after merge"]);
          racedBaseHead = (await git(repo, ["rev-parse", "main"])).trim();
        }
        return await dependencies.exec(...args);
      },
    };

    const result = await advanceGitDecomposeTransitionBase(racingDependencies, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    });
    if (racedBaseHead === null) throw new Error("base binding did not race");
    expect(result).toEqual({
      status: "refused",
      reason: "post-merge-validation-refused:binding-raced",
      locus: "main",
      evidence: {
        expected: { candidateHead, baseHead: expectedBaseHead },
        actual: { candidateHead, baseHead: racedBaseHead },
      },
    });
    expect((await git(candidatePath, ["rev-parse", "HEAD"])).trim()).toBe(candidateHead);
    expect(await git(candidatePath, ["status", "--porcelain=v1"])).toBe("");
    await expect(git(candidatePath, ["rev-parse", "MERGE_HEAD"])).rejects.toThrow();
  });

  it("reports a missing advancement-plan blob at its mutation path", async () => {
    const { repo, candidatePath, candidateHead, completedMap, dependencies } =
      await committedTransitionCandidate();
    await write(repo, ".arc/reference/base-growth.txt", "descendant base\n");
    await git(repo, ["add", ".arc/reference/base-growth.txt"]);
    await git(repo, ["commit", "-m", "advance base"]);
    let missingPath: string | null = null;
    const missingBlobDependencies = {
      ...dependencies,
      composePlan: async (baseRef: string, map: unknown) => {
        const composed = await composeGitV3RepositoryPlan(dependencies, baseRef, map);
        if (composed.status !== "composed") return composed;
        const mutation = composed.plan.mutations.find(({ before, after }) =>
          after.kind === "file" && canonicalize(before) !== canonicalize(after));
        if (mutation?.after.kind !== "file") throw new Error("missing file mutation");
        missingPath = mutation.path;
        const missingDigest = mutation.after.contentDigest;
        return {
          ...composed,
          blobs: composed.blobs.filter(({ contentDigest }) =>
            contentDigest !== missingDigest),
        };
      },
    };

    const result = await advanceGitDecomposeTransitionBase(missingBlobDependencies, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    });
    if (missingPath === null) throw new Error("missing blob path was not selected");
    expect(result).toEqual({
      status: "refused",
      reason: "post-merge-validation-refused:blob-unavailable",
      locus: missingPath,
    });
    expect((await git(candidatePath, ["rev-parse", "HEAD"])).trim()).toBe(candidateHead);
    expect(await git(candidatePath, ["status", "--porcelain=v1"])).toBe("");
    await expect(git(candidatePath, ["rev-parse", "MERGE_HEAD"])).rejects.toThrow();
  });

  it("reports an advancement-plan write failure at its mutation path", async () => {
    const { repo, candidatePath, candidateHead, completedMap, dependencies } =
      await committedTransitionCandidate();
    await write(repo, ".arc/reference/base-growth.txt", "descendant base\n");
    await git(repo, ["add", ".arc/reference/base-growth.txt"]);
    await git(repo, ["commit", "-m", "advance base"]);
    let failedPath: string | null = null;
    const failingDependencies = {
      ...dependencies,
      exec: async (...args: Parameters<typeof dependencies.exec>) => {
        const command = args[1][0];
        if (args[2]?.cwd === candidatePath && (command === "add" || command === "update-index")) {
          failedPath = args[1].at(-1) ?? null;
          throw new Error(`write exploded at ${failedPath ?? "unknown"}`);
        }
        return await dependencies.exec(...args);
      },
    };

    const result = await advanceGitDecomposeTransitionBase(failingDependencies, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    });
    if (failedPath === null) throw new Error("advancement-plan write did not fail");
    expect(result).toEqual({
      status: "refused",
      reason: "post-merge-validation-refused:write-failed",
      locus: failedPath,
    });
    expect(canonicalize(result)).not.toContain("write exploded");
    expect((await git(candidatePath, ["rev-parse", "HEAD"])).trim()).toBe(candidateHead);
    expect(await git(candidatePath, ["status", "--porcelain=v1"])).toBe("");
    await expect(git(candidatePath, ["rev-parse", "MERGE_HEAD"])).rejects.toThrow();
  });

  it("refuses when the candidate ref races before merge mutation", async () => {
    const { candidatePath, candidateHead, completedMap, dependencies } =
      await committedTransitionCandidate();
    let candidateReads = 0;
    let racedHead: string | null = null;
    const racingDependencies = {
      ...dependencies,
      exec: async (...args: Parameters<typeof dependencies.exec>) => {
        if (args[1][0] === "rev-parse" && args[1][2] === "chore/decompose-origin^{commit}") {
          candidateReads += 1;
          if (candidateReads === 2) {
            const tree = (await git(candidatePath, ["rev-parse", `${candidateHead}^{tree}`])).trim();
            racedHead = (await git(candidatePath, [
              "commit-tree",
              tree,
              "-p",
              candidateHead,
              "-m",
              "race candidate",
            ])).trim();
            await git(candidatePath, [
              "update-ref",
              "refs/heads/chore/decompose-origin",
              racedHead,
              candidateHead,
            ]);
          }
        }
        return await dependencies.exec(...args);
      },
    };

    const result = await advanceGitDecomposeTransitionBase(racingDependencies, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    });
    if (racedHead === null) throw new Error("candidate binding did not race");
    expect(result).toEqual({
      status: "refused",
      reason: "binding-raced",
      locus: "chore/decompose-origin",
      evidence: {
        expected: {
          candidateHead,
          baseHead: completedMap.machine.resultBase.head,
        },
        actual: {
          candidateHead: racedHead,
          baseHead: completedMap.machine.resultBase.head,
        },
      },
    });
  });

  it("refuses a root commit masquerading as the initial transition", async () => {
    const { candidatePath, candidateHead, completedMap, dependencies } =
      await committedTransitionCandidate();
    const tree = (await git(candidatePath, ["rev-parse", `${candidateHead}^{tree}`])).trim();
    const root = (await git(candidatePath, ["commit-tree", tree, "-m", "root candidate"])).trim();
    await git(candidatePath, ["reset", "--hard", root]);

    expect(await advanceGitDecomposeTransitionBase(dependencies, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    })).toMatchObject({ status: "refused", reason: "candidate-initial-transition-invalid" });
  });

  it("refuses a valid cut map that does not describe the committed transform", async () => {
    const { completedMap, dependencies } = await committedTransitionCandidate();
    const mismatchedMap = structuredClone(completedMap) as unknown as {
      authoring: { destinations: Array<{ kind: string; workClass?: string }> };
    };
    const member = mismatchedMap.authoring.destinations.find((entry) => entry.kind === "new-member");
    if (member === undefined) throw new Error("expected new member destination");
    member.workClass = "Light";

    const result = await advanceGitDecomposeTransitionBase(dependencies, {
      protection: "full",
      baseBranch: "main",
      completedMap: mismatchedMap,
    });
    expect(result.status).toBe("refused");
    expect(result.status === "refused" ? result.reason : "")
      .toMatch(/^candidate-transform-mismatch:/u);
  });

  it("returns staged execution without a prescribed successor command", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    const cutMapPath = join(repo, "cut-map.json");
    await writeFile(cutMapPath, `${canonicalize(completedMap)}\n`);

    const staged = await executeGitV3DecomposeCommand({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      origin: "origin",
      cutMapPath,
    });

    expect(staged, JSON.stringify(staged)).toMatchObject({ status: "staged" });
    expect(canonicalize(staged)).not.toContain("discard");
    expect(canonicalize(staged)).not.toContain("continuation");
    expect(canonicalize(staged)).not.toContain("receiptId");
  });

  it("threads a discovered retirement companion through execute", async () => {
    const { repo, completedMap, dependencies } = await startedRepository({
      uncoveredCompanion: true,
    });
    const cutMapPath = join(repo, "cut-map.json");
    await writeFile(cutMapPath, `${canonicalize(completedMap)}\n`);
    const result = await executeGitV3DecomposeCommand({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      origin: "origin",
      cutMapPath,
    });

    expect(result.status, JSON.stringify(result)).toBe("staged");
    if (result.status !== "staged") return;
    expect(result.plan.mutations).toContainEqual({
      kind: "exclusive",
      path: ".arc/active/notes-origin.md",
      role: "retiring-source",
      before: { kind: "absent" },
      after: { kind: "absent" },
    });
    expect(await claimFiles(repo)).toEqual([]);
    expect(await git(repo, ["branch", "--list", "chore/decompose-origin"]))
      .toContain("chore/decompose-origin");
  });

  it("threads completed-map origin evidence through execute without repository mutation", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    completedMap.machine.source.origin = "other";
    const { preflightId, ...facts } = completedMap.machine;
    void preflightId;
    completedMap.machine.preflightId = v3PreflightId(facts);
    const cutMapPath = join(repo, "cut-map.json");
    await writeFile(cutMapPath, `${canonicalize(completedMap)}\n`);
    const statusBefore = await git(repo, ["status", "--porcelain=v1"]);

    const result = await executeGitV3DecomposeCommand({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      origin: "origin",
      cutMapPath,
    });

    expect(result).toMatchObject({
      status: "refused",
      stage: "repository-plan",
      reason: "completed-map",
      locus: "machine.source.origin",
      evidence: {
        expected: "origin",
        actual: "other",
      },
      recovery: { kind: "none" },
    });
    expect(await claimFiles(repo)).toEqual([]);
    expect(await git(repo, ["branch", "--list", "chore/decompose-origin"])).toBe("");
    expect(await git(repo, ["status", "--porcelain=v1"])).toBe(statusBefore);
  });

  it("refuses an unpublished source before claiming or materializing a candidate", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    const cutMapPath = join(repo, "cut-map.json");
    await writeFile(cutMapPath, `${canonicalize(completedMap)}\n`);
    await git(repo, ["push", "--force", "origin", "main:plan/origin"]);

    const result = await executeGitV3DecomposeCommand({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      origin: "origin",
      cutMapPath,
    });

    expect(result).toMatchObject({
      status: "refused",
      stage: "repository-plan",
      reason: "source-unpublished",
      locus: "plan/origin",
      evidence: {
        expected: completedMap.machine.source.head,
        actual: completedMap.machine.resultBase.head,
      },
      recovery: { kind: "none" },
      remedy: { argv: ["git", "push", "origin", "plan/origin"] },
    });
    expect(await claimFiles(repo)).toEqual([]);
    expect(await git(repo, ["branch", "--list", "chore/decompose-origin"])).toBe("");
  });

  it("refuses when the source remote cannot be read", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    const cutMapPath = join(repo, "cut-map.json");
    await writeFile(cutMapPath, `${canonicalize(completedMap)}\n`);
    await git(repo, ["remote", "set-url", "origin", join(repo, "missing-remote.git")]);

    const result = await executeGitV3DecomposeCommand({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      origin: "origin",
      cutMapPath,
    });

    expect(result).toMatchObject({
      status: "refused",
      stage: "repository-plan",
      reason: "source-unpublished",
      locus: "plan/origin",
      evidence: {
        expected: completedMap.machine.source.head,
        actual: { kind: "absent" },
      },
      recovery: { kind: "none" },
      remedy: { argv: ["git", "push", "origin", "plan/origin"] },
    });
    expect(await claimFiles(repo)).toEqual([]);
  });

  it("preserves unexpected Git adapter diagnostics in the refusal locus", async () => {
    const { completedMap, dependencies } = await startedRepository();
    const result = await composeGitV3RepositoryPlan({
      ...dependencies,
      exec: async (command, args, options) => {
        if (command === "git" && args[0] === "rev-parse" && args[1] === "--short") {
          throw new Error("synthetic Git read failure");
        }
        return await dependencies.exec(command, args, options);
      },
    }, "main", completedMap);

    expect(result).toEqual({
      status: "refused",
      refusal: {
        stage: "git",
        reason: "repository-plan-failed",
        locus: "synthetic Git read failure",
      },
    });
  });

  it("reports the recorded and observed source ref tips", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    await git(repo, ["branch", "-f", "plan/origin", "main"]);
    const actual = (await git(repo, ["rev-parse", "refs/heads/plan/origin"])).trim();

    const result = await composeGitV3RepositoryPlan(dependencies, "main", completedMap);

    expect(result).toEqual({
      status: "refused",
      refusal: {
        stage: "git",
        reason: "source-ref-moved",
        locus: "refs/heads/plan/origin",
        evidence: {
          expected: completedMap.machine.source.head,
          actual,
        },
      },
    });
  });

  it("reports the recorded and observed result-base ref tips", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    await git(repo, ["commit", "--allow-empty", "-m", "move base"]);
    const actual = (await git(repo, ["rev-parse", "refs/heads/main"])).trim();

    const result = await composeGitV3RepositoryPlan(dependencies, "main", completedMap);

    expect(result).toEqual({
      status: "refused",
      refusal: {
        stage: "git",
        reason: "result-ref-moved",
        locus: "refs/heads/main",
        evidence: {
          expected: completedMap.machine.resultBase.head,
          actual,
        },
      },
    });
  });

  it("keeps a failed one-sided ref read locus-only", async () => {
    const { completedMap, dependencies } = await startedRepository();
    const result = await composeGitV3RepositoryPlan({
      ...dependencies,
      exec: async (command, args, options) => {
        if (command === "git" && args[0] === "rev-parse" && args.at(-1)?.startsWith("refs/heads/plan/origin")) {
          throw new Error("synthetic source-ref read failure");
        }
        return await dependencies.exec(command, args, options);
      },
    }, "main", completedMap);

    expect(result).toEqual({
      status: "refused",
      refusal: {
        stage: "git",
        reason: "source-ref-moved",
        locus: "refs/heads/plan/origin",
      },
    });
  });

  it("refuses moved source or base authority before claiming a candidate", async () => {
    for (const movedRef of ["plan/origin", "main"]) {
      const { repo, completedMap, dependencies } = await startedRepository();
      if (movedRef === "main") await git(repo, ["commit", "--allow-empty", "-m", "move base"]);
      else await git(repo, ["branch", "-f", movedRef, "main"]);
      const result = await executeGitV3DecomposeOperation({
        ...dependencies,
        spawningIdentity: "andrew",
      }, {
        protection: "full",
        baseBranch: "main",
        completedMap,
      });

      expect(result).toMatchObject({
        status: "refused",
        stage: "repository-plan",
        recovery: { kind: "none" },
      });
      expect(await claimFiles(repo)).toEqual([]);
      expect(await git(repo, ["branch", "--list", "chore/decompose-origin"])).toBe("");
    }
  });

  it("preserves the Git preflight refusal code at the command boundary", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    const cutMapPath = join(repo, "cut-map.json");
    await writeFile(cutMapPath, `${canonicalize(completedMap)}\n`);
    await git(repo, ["branch", "-m", "missing-main"]);

    const result = await executeGitV3DecomposeCommand({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      origin: "origin",
      cutMapPath,
    });

    expect(result).toMatchObject({
      status: "refused",
      stage: "repository-plan",
      reason: "git-preflight:missing-base",
      remedy: { argv: ["arc", "decompose", "origin", "--preflight"] },
    });
    expect(await claimFiles(repo)).toEqual([]);
  });

  it("preserves a foreign deterministic candidate branch without acquiring a claim", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    await git(repo, ["branch", "chore/decompose-origin", "main"]);
    const result = await executeGitV3DecomposeOperation({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      completedMap,
    });

    expect(result).toEqual({
      status: "refused",
      stage: "occupation",
      reason: "branch-exists-unregistered",
      recovery: { kind: "none" },
    });
    expect(await claimFiles(repo)).toEqual([]);
    expect((await git(repo, ["rev-parse", "chore/decompose-origin"])).trim())
      .toBe((await git(repo, ["rev-parse", "main"])).trim());
  });

  it("reports only exact candidate recovery when source authority moves after occupation", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    const cutMapPath = join(repo, "cut-map.json");
    await writeFile(cutMapPath, `${canonicalize(completedMap)}\n`);
    let moved = false;
    const driftingExec: GitExec = async (command, args, options) => {
      const result = await dependencies.exec(command, args, options);
      if (!moved && args[0] === "worktree" && args[1] === "add") {
        moved = true;
        await git(repo, ["branch", "-f", "plan/origin", "main"]);
      }
      return result;
    };
    const result = await executeGitV3DecomposeCommand({
      ...dependencies,
      exec: driftingExec,
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      origin: "origin",
      cutMapPath,
    });

    expect(moved).toBe(true);
    expect(result).toMatchObject({
      status: "refused",
      stage: "post-occupation-revalidation",
      recovery: {
        kind: "full-candidate",
        candidateBranch: "chore/decompose-origin",
        expectedHead: completedMap.machine.resultBase.head,
      },
    });
    expect(result).toMatchObject({
      remedy: { argv: ["arc", "teardown", "--branch", "chore/decompose-origin"] },
    });
    expect(result.status === "refused" ? result.remedy.text : "").toContain(cutMapPath);
    expect(result.status === "refused" ? result.remedy.text : "").not.toContain("discard");
    expect(await claimFiles(repo)).toEqual([]);
    expect(await git(repo, ["branch", "--list", "chore/decompose-origin"]))
      .toContain("chore/decompose-origin");
  });

  it("reports the earlier and refreshed repository plan identities", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    const cutMapPath = join(repo, "cut-map.json");
    await writeFile(cutMapPath, `${canonicalize(completedMap)}\n`);
    const roadmapOid = (await git(repo, ["rev-parse", "main:.arc/backlog/ROADMAP.md"])).trim();
    let drift = false;
    const result = await executeGitV3DecomposeCommand({
      ...dependencies,
      exec: async (command, args, options) => {
        const value = await dependencies.exec(command, args, options);
        if (args[0] === "worktree" && args[1] === "add") drift = true;
        return value;
      },
      readObject: async (oid) => {
        const bytes = await dependencies.readObject(oid);
        return drift && oid === roadmapOid
          ? new Uint8Array([...bytes, ...new TextEncoder().encode("refreshed")])
          : bytes;
      },
      spawningIdentity: "andrew",
    }, {
      protection: "full",
      baseBranch: "main",
      origin: "origin",
      cutMapPath,
    });

    expect(drift).toBe(true);
    expect(result).toMatchObject({
      status: "refused",
      stage: "post-occupation-revalidation",
      reason: "repository-plan-drift",
      locus: "planId",
      evidence: {
        expected: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
        actual: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      },
      recovery: { kind: "full-candidate" },
    });
    if (result.status !== "refused" || result.evidence === undefined) return;
    expect(result.evidence.expected).not.toBe(result.evidence.actual);
  });

  it("refuses an untracked partial destination without staging or replacing it", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    const collisionPath = ".arc/backlog/planned/member/draft-member.md";
    await write(repo, collisionPath, "foreign bytes\n");
    const result = await executeGitV3DecomposeOperation({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "partial",
      baseBranch: "main",
      completedMap,
    });

    expect(result).toEqual({
      status: "refused",
      stage: "occupation",
      reason: "partial-projection-dirty",
      recovery: { kind: "none" },
    });
    expect(await readFile(join(repo, collisionPath), "utf8")).toBe("foreign bytes\n");
    expect(await git(repo, ["diff", "--cached", "--name-only"])).toBe("");
    expect(await claimFiles(repo)).toEqual([]);
  });

  it("refuses partial materialization from a same-head non-base branch", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    await git(repo, ["switch", "-c", "alias"]);
    const result = await executeGitV3DecomposeOperation({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "partial",
      baseBranch: "main",
      completedMap,
    });

    expect(result).toEqual({
      status: "refused",
      stage: "occupation",
      reason: "base-moved",
      locus: "main",
      evidence: {
        expected: completedMap.machine.resultBase.head,
        actual: { kind: "absent" },
      },
      recovery: { kind: "none" },
    });
    expect(await git(repo, ["diff", "--cached", "--name-only"])).toBe("");
  });

  it("revalidates partial projection drift after occupation and before materialization", async () => {
    const { repo, completedMap, dependencies } = await startedRepository();
    let occupationSeen = false;
    let injected = false;
    const driftingExec: GitExec = async (command, args, options) => {
      const result = await dependencies.exec(command, args, options);
      if (args[0] === "diff" && args.includes("--cached") && args.includes("--no-renames")) {
        occupationSeen = true;
      } else if (occupationSeen && !injected && args[0] === "ls-tree" && args.includes("--full-tree")) {
        injected = true;
        await write(repo, ".arc/reference/foreign.txt", "foreign staged bytes\n");
        await git(repo, ["add", ".arc/reference/foreign.txt"]);
      }
      return result;
    };
    const result = await executeGitV3DecomposeOperation({
      ...dependencies,
      exec: driftingExec,
      spawningIdentity: "andrew",
    }, {
      protection: "partial",
      baseBranch: "main",
      completedMap,
    });

    expect(injected).toBe(true);
    expect(result).toEqual({
      status: "refused",
      stage: "post-occupation-revalidation",
      reason: "partial-projection-drift",
      locus: "main",
      evidence: {
        expected: {
          baseHead: completedMap.machine.resultBase.head,
          indexClean: true,
          worktreeClean: true,
        },
        actual: {
          baseHead: completedMap.machine.resultBase.head,
          indexClean: false,
          worktreeClean: true,
        },
      },
      recovery: { kind: "none" },
    });
    expect(await git(repo, ["diff", "--cached", "--name-only"]))
      .toBe(".arc/reference/foreign.txt\n");
    expect(await claimFiles(repo)).toEqual([]);
  });

  it("restores the path whose write succeeded when its Git stage fails", async () => {
    const { repo, completedMap, dependencies } = await activeExtractionRepository("single-spec", false);
    let stageCount = 0;
    let failedPath: string | undefined;
    const failingExec: GitExec = async (command, args, options) => {
      if (command === "git" && args[0] === "add" && args[1] === "-A") {
        stageCount += 1;
        if (stageCount === 2) {
          failedPath = args.at(-1)?.replace(/^:\(literal\)/u, "");
          throw new Error("synthetic stage failure after write");
        }
      }
      return await dependencies.exec(command, args, options);
    };

    const result = await executeGitV3ExtractionOperation({
      ...dependencies,
      exec: failingExec,
      spawningIdentity: "andrew",
    }, {
      protection: "partial",
      baseBranch: "main",
      completedMap,
    });

    expect(stageCount).toBeGreaterThanOrEqual(2);
    expect(failedPath).toBeDefined();
    expect(result).toMatchObject({
      status: "refused",
      stage: "materialization",
      reason: "apply-failed",
      recovery: { kind: "partial-restoration", status: "restored" },
    });
    if (result.status !== "refused" || result.recovery.kind !== "partial-restoration") return;
    if (result.recovery.status !== "restored") return;
    expect(result.recovery.restoredPaths).toContain(failedPath);
    expect(await git(repo, ["status", "--porcelain=v1"])).toBe("");
  });

  it("preserves a report and typed restoration through the extraction command boundary", async () => {
    const { repo, completedMap, dependencies } = await activeExtractionRepository("single-spec", false);
    const remote = await mkdtemp(join(tmpdir(), "arc-v3-extraction-command-remote-"));
    roots.push(remote);
    await git(remote, ["init", "--bare"]);
    await git(repo, ["remote", "add", "origin", remote]);
    await git(repo, ["push", "origin", "main", "feat/origin"]);
    const cutMapPath = join(repo, "cut-map.json");
    await writeFile(cutMapPath, `${canonicalize(completedMap)}\n`);
    let stageCount = 0;
    const result = await executeGitV3ExtractionCommand({
      ...dependencies,
      exec: async (command, args, options) => {
        if (command === "git" && args[0] === "add" && args[1] === "-A") {
          stageCount += 1;
          if (stageCount === 2) throw new Error("synthetic stage failure after write");
        }
        return await dependencies.exec(command, args, options);
      },
      spawningIdentity: "andrew",
    }, {
      protection: "partial",
      baseBranch: "main",
      origin: "origin",
      cutMapPath,
    });

    expect(result).toMatchObject({
      status: "refused",
      stage: "materialization",
      reason: "apply-failed",
      report: {
        status: "refused",
        extraction: { anchor: { kind: "surviving-origin", origin: "origin" } },
      },
      recovery: { kind: "partial-restoration", status: "restored" },
      remedy: { argv: ["arc", "decompose", "origin", "--extract", cutMapPath] },
    });
    expect(await git(repo, ["status", "--porcelain=v1"])).toBe("?? cut-map.json\n");
  });

  it("retires and prunes one configured-ref backlog stub on the partial base", async () => {
    const {
      repo,
      baseHead,
      dependencies,
      cutMapPath,
      preflight,
    } = await backlogStubRepository();
    expect(preflight.starterMap.machine).toMatchObject({
      source: {
        kind: "backlog-stub",
        logicalBranch: "main",
        ref: "refs/heads/main",
        head: baseHead,
      },
      planningProfile: { kind: "single-spec", sourceDesign: ["spec-origin.md"] },
    });
    const refsBefore = await git(repo, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads"]);
    const worktreesBefore = await git(repo, ["worktree", "list", "--porcelain"]);

    const staged = await executeGitV3DecomposeCommand({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "partial",
      baseBranch: "main",
      origin: "origin",
      cutMapPath,
    });

    expect(staged, JSON.stringify(staged)).toMatchObject({
      status: "staged",
      operation: {
        occupation: {
          status: "occupied",
          protection: "partial",
        },
        transitionRecord: { kind: "decompose", origin: "origin" },
      },
    });
    if (staged.status !== "staged") return;
    expect(staged.operation.occupation).toEqual({ status: "occupied", protection: "partial" });
    expect(await git(repo, ["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads"]))
      .toBe(refsBefore);
    expect(await git(repo, ["worktree", "list", "--porcelain"])).toBe(worktreesBefore);
    expect(await git(repo, ["branch", "--list", "plan/origin", "chore/decompose-origin"])).toBe("");
    expect(await claimFiles(repo)).toEqual([]);
    expect(await pathExists(join(repo, ".arc", "backlog", "planned", "origin"))).toBe(false);
    expect(await git(repo, ["diff", "--cached", "--name-status", "--no-renames"]))
      .toContain("D\t.arc/backlog/planned/origin/meta-origin.md");
    expect(await git(repo, ["diff", "--cached", "--name-status", "--no-renames"]))
      .toContain("D\t.arc/backlog/planned/origin/spec-origin.md");

    for (const slug of ["alpha", "beta"]) {
      const memberDir = join(repo, ".arc", "backlog", "planned", "delivery", slug);
      const meta = await readFile(join(memberDir, `meta-${slug}.md`), "utf8");
      expect(meta).toContain("- **Cohort:** `delivery`");
      expect(meta).toContain(`- **Design:** \`spec-${slug}.md\``);
      expect(meta).toContain("- **Task List:** [none]");
      expect(meta).toContain("- **Current Workflow:** `generate-tasks`");
      expect(meta).not.toContain("Decomposition Receipt");
      expect(await pathExists(join(memberDir, `spec-${slug}.md`))).toBe(true);
      expect(await pathExists(join(memberDir, `draft-${slug}.md`))).toBe(false);
      expect(await pathExists(join(memberDir, `spec-${slug}-prd.md`))).toBe(false);
      expect(await pathExists(join(memberDir, `spec-${slug}-rfc.md`))).toBe(false);
    }

    expect(await readFile(
      join(repo, ...resolveTransitionRecordRelativePath("origin").split("/")),
      "utf8",
    )).toContain('"kind":"decompose"');
    expect(await claimFiles(repo)).toEqual([]);
    expect(await git(repo, ["branch", "--list", "plan/origin", "chore/decompose-origin"])).toBe("");
    expect(await git(repo, ["worktree", "list", "--porcelain"])).toBe(worktreesBefore);
  });

  it("preserves a nonempty configured-ref backlog-stub parent", async () => {
    const { repo, dependencies, cutMapPath } = await backlogStubRepository({
      preserveParent: true,
    });
    const sourceDir = join(repo, ".arc", "backlog", "planned", "origin");
    const worktreesBefore = await git(repo, ["worktree", "list", "--porcelain"]);

    const staged = await executeGitV3DecomposeCommand({
      ...dependencies,
      spawningIdentity: "andrew",
    }, {
      protection: "partial",
      baseBranch: "main",
      origin: "origin",
      cutMapPath,
    });

    expect(staged.status, JSON.stringify(staged)).toBe("staged");
    expect(await pathExists(join(sourceDir, "meta-origin.md"))).toBe(false);
    expect(await pathExists(join(sourceDir, "spec-origin.md"))).toBe(false);
    expect(await readFile(join(sourceDir, "README.md"), "utf8"))
      .toBe("# Preserved sibling\n");
    expect(await pathExists(sourceDir)).toBe(true);
    expect(await claimFiles(repo)).toEqual([]);
    expect(await git(repo, ["branch", "--list", "plan/origin", "chore/decompose-origin"])).toBe("");
    expect(await git(repo, ["worktree", "list", "--porcelain"])).toBe(worktreesBefore);
  });
});
