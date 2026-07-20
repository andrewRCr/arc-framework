/**
 * Deterministic repositories and normalization for session-envelope goldens.
 *
 * This helper is deliberately framework-free: it uses only Node builtins and
 * the public E2E helpers, so benchmarks can reuse the unnormalized fixture
 * without importing Vitest or production modules.
 */

import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  cleanupTempDir,
  createTempRepo,
  git,
  removeGitBackedDir,
  runArcNoTty,
} from "../e2e/helpers.js";

/** Successful session-init assembly arms plus the identity error/omission arm. */
export type SessionEnvelopeFixtureKind =
  | "orient"
  | "active-resume"
  | "current-husk"
  | "branch-gone"
  | "identity-missing";

/** Roots whose machine-specific absolute paths are normalized in a golden. */
export interface SessionEnvelopeNormalization {
  roots: ReadonlyArray<readonly [path: string, token: string]>;
}

/** Prepared fixture and its owned teardown. */
export interface SessionEnvelopeFixture {
  primary: string;
  cwd: string;
  normalization: SessionEnvelopeNormalization;
  cleanup(): Promise<void>;
}

interface MutableFixture {
  repo: string;
  ownedPaths: string[];
  roots: Array<readonly [string, string]>;
}

const META = (name: string, fields: {
  state?: string;
  branch: string;
  taskList?: string;
  cohort?: string;
  owner?: string;
  workClass?: string;
}): string => [
  `# Metadata: ${name}`,
  "",
  `- **State:** ${fields.state ?? "Active"}`,
  `- **Owner:** ${fields.owner ?? "test-user"}`,
  `- **Branch:** ${fields.branch}`,
  `- **Class:** ${fields.workClass ?? "Heavy"}`,
  `- **Cohort:** ${fields.cohort ?? "[none]"}`,
  `- **Task List:** ${fields.taskList ?? "[none]"}`,
  "- **Current Workflow:** [none]",
  "- **Last Completed:** [none]",
  fields.taskList === undefined
    ? "- **Next Task:** [none]"
    : "- **Next Task:** Task 1.1 — Exercise the envelope (line ~7)",
  "- **Blockers:** [none]",
  fields.taskList === undefined
    ? "- **Next Action:** Continue integration"
    : "- **Next Action:** Begin Task 1.1 — Exercise the envelope",
  "",
].join("\n");

const TASKS = [
  "# Task List: Envelope Fixture",
  "",
  "- **Design:** `spec-envelope-fixture.md`",
  "",
  "---",
  "",
  "## **Phase 1:** Compatibility",
  "",
  "_Purpose:_ Exercise the complete envelope.",
  "",
  "### `[ ]` **1.1 Exercise the envelope**",
  "",
  "- _Goal:_ Produce a deterministic cursor.",
  "",
].join("\n");

/**
 * Prepare one end-to-end repository state.
 *
 * @param kind - Assembly arm to construct
 * @returns Fixture cwd, normalization roots, and idempotent cleanup
 */
export async function prepareSessionEnvelopeFixture(
  kind: SessionEnvelopeFixtureKind,
): Promise<SessionEnvelopeFixture> {
  const state = await createBaseFixture();
  let cwd = state.repo;

  try {
    if (kind === "orient") {
      await setupOrientFixture(state);
    } else if (kind === "active-resume") {
      cwd = await setupActiveResumeFixture(state);
    } else if (kind === "current-husk") {
      cwd = await setupCurrentHuskFixture(state);
    } else if (kind === "branch-gone") {
      cwd = await setupBranchGoneFixture(state);
    } else {
      await git(state.repo, ["config", "--unset", "arc.identity"]);
    }

    let cleaned = false;
    return {
      primary: state.repo,
      cwd,
      normalization: { roots: state.roots },
      cleanup: async () => {
        if (cleaned) return;
        cleaned = true;
        for (const path of [...state.ownedPaths].reverse()) {
          await removeGitBackedDir(path);
        }
      },
    };
  } catch (error) {
    for (const path of [...state.ownedPaths].reverse()) {
      await removeGitBackedDir(path);
    }
    throw error;
  }
}

async function createBaseFixture(): Promise<MutableFixture> {
  const repo = await createTempRepo("arc-session-envelope-");
  const init = await runArcNoTty(["init", "--yes", "--name", "envelope-fixture"], repo);
  if (init.exitCode !== 0) {
    await cleanupTempDir(repo);
    throw new Error(`arc init failed: ${init.stderr || init.stdout}`);
  }
  await git(repo, ["add", "-A"]);
  await git(repo, ["commit", "-m", "chore: initialize envelope fixture"]);
  return {
    repo,
    ownedPaths: [repo],
    roots: [[repo, "<PRIMARY>"]],
  };
}

async function setupOrientFixture(state: MutableFixture): Promise<void> {
  const worktreeParent = await mkdtemp(join(tmpdir(), "arc-session-envelope-wt-"));
  state.ownedPaths.push(worktreeParent);
  state.roots.push([worktreeParent, "<WORKTREE_PARENT>"]);
  const linked = join(worktreeParent, "heavy-widget");
  state.roots.push([linked, "<WORKTREE>"]);

  await git(state.repo, ["branch", "feat/heavy-widget"]);
  await git(state.repo, ["worktree", "add", linked, "feat/heavy-widget"]);
  await writeActiveFixture(linked, "heavy-widget", {
    state: "Integrating",
    branch: "feat/heavy-widget",
    workClass: "Heavy",
  });
  await git(linked, ["add", ".arc/active/meta-heavy-widget.md"]);
  await git(linked, ["commit", "-m", "feat: add in-flight fixture"]);
}

async function setupActiveResumeFixture(state: MutableFixture): Promise<string> {
  const worktreeParent = await mkdtemp(join(tmpdir(), "arc-session-envelope-wt-"));
  state.ownedPaths.push(worktreeParent);
  state.roots.push([worktreeParent, "<WORKTREE_PARENT>"]);
  const linked = join(worktreeParent, "active-widget");
  state.roots.push([linked, "<WORKTREE>"]);

  await git(state.repo, ["branch", "feat/active-widget"]);
  await git(state.repo, ["worktree", "add", linked, "feat/active-widget"]);
  await writeActiveFixture(linked, "active-widget", {
    branch: "feat/active-widget",
    taskList: "tasks-active-widget.md",
    cohort: "fixture-cohort",
  });
  const cohortDir = join(linked, ".arc", "backlog", "planned", "fixture-cohort");
  await mkdir(cohortDir, { recursive: true });
  await writeFile(join(cohortDir, "cohort-fixture-cohort.md"), "# Cohort: fixture-cohort\n");
  await git(linked, ["add", ".arc/active", ".arc/backlog/planned/fixture-cohort"]);
  await git(linked, ["commit", "-m", "feat: add active cohort fixture"]);
  return linked;
}

async function setupCurrentHuskFixture(state: MutableFixture): Promise<string> {
  const worktreeParent = await mkdtemp(join(tmpdir(), "arc-session-envelope-wt-"));
  state.ownedPaths.push(worktreeParent);
  state.roots.push([worktreeParent, "<WORKTREE_PARENT>"]);
  const linked = join(worktreeParent, "current-husk");
  state.roots.push([linked, "<WORKTREE>"]);

  await git(state.repo, ["branch", "feat/current-husk"]);
  await git(state.repo, ["worktree", "add", linked, "feat/current-husk"]);
  await git(linked, ["switch", "--detach"]);
  const head = await git(linked, ["rev-parse", "HEAD"]);
  const markerDir = join(linked, ".arc", "system", ".internal");
  await mkdir(markerDir, { recursive: true });
  await writeFile(join(markerDir, "worktree-marker.json"), JSON.stringify({
    spawnedByArc: true,
    wuName: "current-husk",
    createdFor: { kind: "work-unit", name: "current-husk" },
    spawningIdentity: "test-user",
    createdAt: "2026-01-02T03:04:05.000Z",
    husk: {
      sha: head,
      at: "2026-01-02T04:05:06.000Z",
      subject: { kind: "work-unit", name: "current-husk" },
      branch: "feat/current-husk",
    },
  }));
  return linked;
}

async function setupBranchGoneFixture(state: MutableFixture): Promise<string> {
  const remote = await mkdtemp(join(tmpdir(), "arc-session-envelope-remote-"));
  state.ownedPaths.push(remote);
  state.roots.push([remote, "<REMOTE>"]);
  await git(remote, ["init", "--bare", "--initial-branch=main"]);
  await git(state.repo, ["remote", "add", "origin", remote]);
  await git(state.repo, ["push", "-u", "origin", "main"]);

  const worktreeParent = await mkdtemp(join(tmpdir(), "arc-session-envelope-wt-"));
  state.ownedPaths.push(worktreeParent);
  state.roots.push([worktreeParent, "<WORKTREE_PARENT>"]);
  const linked = join(worktreeParent, "gone-widget");
  state.roots.push([linked, "<WORKTREE>"]);

  await git(state.repo, ["branch", "feat/gone-widget"]);
  await git(state.repo, ["worktree", "add", linked, "feat/gone-widget"]);
  await writeActiveFixture(linked, "gone-widget", {
    branch: "feat/gone-widget",
    taskList: "tasks-gone-widget.md",
  });
  await git(linked, ["add", ".arc/active"]);
  await git(linked, ["commit", "-m", "feat: add branch-gone fixture"]);
  await git(linked, ["push", "-u", "origin", "feat/gone-widget"]);
  await git(state.repo, ["push", "origin", "--delete", "feat/gone-widget"]);
  // `git push --delete` removes the local tracking ref as a side effect. Put
  // the stale tracking ref back so `@{upstream}` still resolves and the CLI's
  // own bounded fetch observes the authoritative "remote ref gone" failure.
  await git(linked, ["update-ref", "refs/remotes/origin/feat/gone-widget", "HEAD"]);
  return linked;
}

async function writeActiveFixture(
  root: string,
  name: string,
  fields: Parameters<typeof META>[1],
): Promise<void> {
  const activeDir = join(root, ".arc", "active");
  await mkdir(activeDir, { recursive: true });
  await writeFile(join(activeDir, `meta-${name}.md`), META(name, fields));
  if (fields.taskList !== undefined) {
    await writeFile(join(activeDir, fields.taskList), TASKS);
  }
}

/**
 * Normalize only machine/environment-derived values while preserving object
 * insertion order, arrays, and omitted-versus-null fields.
 *
 * @param input - Parsed JSON value; mutated in place and returned
 * @param context - Known fixture roots and their stable tokens
 * @returns The same JSON value with environment-derived strings replaced
 */
export function normalizeSessionEnvelope(
  input: unknown,
  context: SessionEnvelopeNormalization,
): unknown {
  const roots = [...context.roots]
    .sort(([left], [right]) => right.length - left.length)
    .flatMap(([path, token]) => [
      [path, token] as const,
      [path.replaceAll("\\", "/"), token] as const,
    ]);
  const oids = new Map<string, string>();
  const timestamps = new Map<string, string>();
  const dates = new Map<string, string>();

  const tokenFor = (map: Map<string, string>, value: string, label: string): string => {
    const current = map.get(value);
    if (current !== undefined) return current;
    const token = `<${label}_${map.size + 1}>`;
    map.set(value, token);
    return token;
  };

  const visit = (value: unknown, key: string | undefined): unknown => {
    if (typeof value === "string") {
      let next = value;
      for (const [root, token] of roots) next = next.replaceAll(root, token);
      next = next.replace(/\b[0-9a-f]{40}\b/gu, (oid) => tokenFor(oids, oid, "OID"));
      next = next.replace(
        /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z\b/gu,
        (stamp) => tokenFor(timestamps, stamp, "TIMESTAMP"),
      );
      next = next.replace(/\b\d{4}-\d{2}-\d{2}\b/gu, (date) => tokenFor(dates, date, "DATE"));
      if (key === "machineId") return "<MACHINE_ID>";
      return next;
    }
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        value[index] = visit(value[index], undefined);
      }
      return value;
    }
    if (value !== null && typeof value === "object") {
      const record = value as Record<string, unknown>;
      for (const property of Object.keys(record)) {
        record[property] = visit(record[property], property);
      }
    }
    return value;
  };

  return visit(input, undefined);
}
