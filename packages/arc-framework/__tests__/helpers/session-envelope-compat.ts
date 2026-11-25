/**
 * Deterministic repositories and normalization for session-envelope goldens.
 *
 * Benchmarks reuse the unnormalized fixture without importing Vitest.
 */

import { makeHuskStamp } from "./worktree-husk-fixture.js";
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import {
  cleanupTempDir,
  createTempRepo,
  git,
  removeGitBackedDir,
  runArcNoTty,
} from "../e2e/helpers.js";
import { makeMetaFixture } from "./meta-fixture.js";
import { seedStore } from "./store/seed-store.js";
import { integrateAttestedWorkUnit } from "./store/integrating-work-unit.js";
import { seedWorkUnit, seededWorkUnitSubject } from "./store/seed-work-unit.js";
import { ArchiveQuarterSchema, SlugSchema } from "../../src/lib/kernel/index.js";
import { OwnerIdentitySchema, recordReferences } from "../../src/lib/store/identity.js";

// Placeholders are path-shaped rather than angle-bracket tokens because normalized
// envelopes are replayed through schema validation, and several normalized values land
// in fields that must parse as absolute paths. A token that cannot parse would fail the
// replay ahead of whatever the assertion actually targets.

/** Stable placeholder for the primary repository root. */
export const PRIMARY_TOKEN = "/redacted/primary";
/** Stable placeholder for the directory holding linked worktrees. */
export const WORKTREE_PARENT_TOKEN = "/redacted/worktree-parent";
/** Stable placeholder for the linked worktree root. */
export const WORKTREE_TOKEN = "/redacted/worktree";
/** Stable placeholder for the bare remote repository. */
export const REMOTE_TOKEN = "/redacted/remote";

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
  state?: "Active" | "Integrating";
  branch: string;
  taskList?: string;
  cohort?: string;
  owner?: string;
  workClass?: "Light" | "Heavy" | "Novel";
}): string => makeMetaFixture(name, {
  state: fields.state ?? "Active",
  owner: fields.owner ?? "test-user",
  branch: fields.branch,
  workClass: fields.workClass ?? "Heavy",
  cohort: fields.cohort ?? null,
  taskList: fields.taskList ?? null,
  currentWorkflow: fields.state === "Integrating" ? "integrate-work-unit" : null,
  nextTask: fields.taskList === undefined ? null : "Task 1.1 — Exercise the envelope (line ~7)",
  nextAction: fields.taskList === undefined
    ? "Continue integration" : "Begin Task 1.1 — Exercise the envelope",
});

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
      await git(state.repo, ["config", "--unset", "user.name"]);
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
    roots: [[repo, PRIMARY_TOKEN]],
  };
}

/**
 * Create a fixture-owned directory whose path extends the primary repository path.
 *
 * Roster rows sort on their checkout path, so siblings drawn from independently
 * randomized temp roots order nondeterministically against the primary and a captured
 * envelope would lock whichever order that run happened to produce. Extending the
 * primary path makes it a strict prefix of every sibling, fixing their relative order.
 *
 * @param state - Fixture under construction; gains ownership of the new directory
 * @param suffix - Role-naming suffix appended to the primary repository path
 * @returns Absolute path to the created directory
 */
async function createSiblingRoot(state: MutableFixture, suffix: string): Promise<string> {
  const path = `${state.repo}${suffix}`;
  await mkdir(path, { recursive: true });
  state.ownedPaths.push(path);
  return path;
}

async function setupOrientFixture(state: MutableFixture): Promise<void> {
  const worktreeParent = await createSiblingRoot(state, "-wt");
  state.roots.push([worktreeParent, WORKTREE_PARENT_TOKEN]);
  const linked = join(worktreeParent, "heavy-widget");
  state.roots.push([linked, WORKTREE_TOKEN]);

  await git(state.repo, ["branch", "feat/heavy-widget"]);
  await git(state.repo, ["worktree", "add", linked, "feat/heavy-widget"]);
  await seedActiveWorkUnit(state.repo, linked, "heavy-widget", {
    state: "Active",
    branch: "feat/heavy-widget",
    workClass: "Heavy",
    taskList: "tasks-heavy-widget.md",
  }, TASKS.replace("`[ ]`", "`[x]`"));
  await writeFile(join(linked, "heavy-widget.txt"), "In-flight fixture work\n");
  await git(linked, ["add", "heavy-widget.txt"]);
  await git(linked, ["commit", "-m", "feat: add in-flight fixture"]);

  const attested = await runArcNoTty(["attest", "heavy-widget", "--json"], linked);
  if (attested.exitCode !== 0) {
    throw new Error(`arc attest failed: ${attested.stderr || attested.stdout}`);
  }
  // Integrating, with the attested Candidate's publication pending at its idempotent push.
  await integrateAttestedWorkUnit(linked, "heavy-widget", {
    identity: "test-user",
    publicationPending: true,
  });
}

async function setupActiveResumeFixture(state: MutableFixture): Promise<string> {
  const worktreeParent = await createSiblingRoot(state, "-wt");
  state.roots.push([worktreeParent, WORKTREE_PARENT_TOKEN]);
  const linked = join(worktreeParent, "active-widget");
  state.roots.push([linked, WORKTREE_TOKEN]);

  await git(state.repo, ["branch", "feat/active-widget"]);
  await git(state.repo, ["worktree", "add", linked, "feat/active-widget"]);
  await seedStore(state.repo, SlugSchema.parse("test-user"), [{
    reference: recordReferences["cohort/document"](OwnerIdentitySchema.parse({ type: "cohort", name: "fixture-cohort" })),
    content: "# Cohort: fixture-cohort\n\n**Purpose:** Group the envelope fixture.\n\n**Parent:** [none]\n",
  }]);
  await seedActiveWorkUnit(state.repo, linked, "active-widget", {
    branch: "feat/active-widget",
    taskList: "tasks-active-widget.md",
    cohort: "fixture-cohort",
  });
  return linked;
}

async function setupCurrentHuskFixture(state: MutableFixture): Promise<string> {
  const worktreeParent = await createSiblingRoot(state, "-wt");
  state.roots.push([worktreeParent, WORKTREE_PARENT_TOKEN]);
  const linked = join(worktreeParent, "current-husk");
  state.roots.push([linked, WORKTREE_TOKEN]);

  await git(state.repo, ["branch", "feat/current-husk"]);
  await git(state.repo, ["worktree", "add", linked, "feat/current-husk"]);
  await git(linked, ["switch", "--detach"]);
  const head = await git(linked, ["rev-parse", "HEAD"]);
  // The husk of a shipped work unit, stamped with its identity as teardown stamps one, under an authorization this
  // build does not know.
  const { meta } = await seedWorkUnit(state.repo, "current-husk", {
    identity: "test-user",
    meta: { state: "Shipped", owner: "test-user", branch: "feat/current-husk", currentWorkflow: null,
      completed: "2026-01-02", prUrl: "https://example.test/pull/1" },
    placement: { kind: "completed", quarter: ArchiveQuarterSchema.parse("2026-q1") },
    branch: "feat/current-husk",
  });
  const subject = seededWorkUnitSubject(meta);
  const markerDir = join(linked, ".arc", "system", ".internal");
  await mkdir(markerDir, { recursive: true });
  await writeFile(join(markerDir, "worktree-marker.json"), JSON.stringify({
    spawnedByArc: true,
    wuName: "current-husk",
    createdFor: subject,
    spawningIdentity: "test-user",
    createdAt: "2026-01-02T03:04:05.000Z",
    husk: makeHuskStamp({
      sha: head,
      at: "2026-01-02T04:05:06.000Z",
      subject,
      branch: "feat/current-husk",
      authorization: "future-policy",
    }),
  }));
  return linked;
}

async function setupBranchGoneFixture(state: MutableFixture): Promise<string> {
  const remote = await createSiblingRoot(state, "-remote");
  state.roots.push([remote, REMOTE_TOKEN]);
  await git(remote, ["init", "--bare", "--initial-branch=main"]);
  await git(state.repo, ["remote", "add", "origin", remote]);
  await git(state.repo, ["push", "-u", "origin", "main"]);

  const worktreeParent = await createSiblingRoot(state, "-wt");
  state.roots.push([worktreeParent, WORKTREE_PARENT_TOKEN]);
  const linked = join(worktreeParent, "gone-widget");
  state.roots.push([linked, WORKTREE_TOKEN]);

  await git(state.repo, ["branch", "feat/gone-widget"]);
  await git(state.repo, ["worktree", "add", linked, "feat/gone-widget"]);
  await seedActiveWorkUnit(state.repo, linked, "gone-widget", {
    branch: "feat/gone-widget",
    taskList: "tasks-gone-widget.md",
  });
  // The branch carries one commit of work ahead of base, no task closed over it.
  await writeFile(join(linked, "gone-widget.txt"), "Branch-gone fixture work\n");
  await git(linked, ["add", "gone-widget.txt"]);
  await commitAtFixedTime(linked, "feat: add branch-gone fixture");
  await git(linked, ["push", "-u", "origin", "feat/gone-widget"]);
  await git(state.repo, ["push", "origin", "--delete", "feat/gone-widget"]);
  // `git push --delete` removes the local tracking ref as a side effect. Put
  // the stale tracking ref back so `@{upstream}` still resolves and the CLI's
  // own bounded fetch observes the authoritative "remote ref gone" failure.
  await git(linked, ["update-ref", "refs/remotes/origin/feat/gone-widget", "HEAD"]);
  return linked;
}

/**
 * Commit at a fixed author and committer time, so the commit's times and the copy key its author line derives stay the
 * same from run to run.
 */
async function commitAtFixedTime(cwd: string, message: string): Promise<void> {
  const at = "2026-01-02T05:06:07Z";
  await promisify(execFile)("git", ["-c", "core.hooksPath=/dev/null", "commit", "-m", message],
    { cwd, env: { ...process.env, GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at } });
}

/** Hold an active work unit and its task list in the store, its branch linked and the checkout bound to it. */
async function seedActiveWorkUnit(
  primary: string,
  checkout: string,
  name: string,
  fields: Parameters<typeof META>[1],
  tasks = TASKS,
): Promise<void> {
  await seedWorkUnit(primary, name, {
    identity: "test-user",
    content: META(name, fields),
    ...(fields.taskList === undefined ? {} : { taskList: tasks }),
    branch: fields.branch,
    bind: checkout,
  });
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
  const digests = new Map<string, string>();
  const uids = new Map<string, string>();
  const timestamps = new Map<string, string>();
  const dates = new Map<string, string>();

  const tokenFor = (map: Map<string, string>, value: string, label: string): string => {
    const current = map.get(value);
    if (current !== undefined) return current;
    const token = `<${label}_${map.size + 1}>`;
    map.set(value, token);
    return token;
  };

  const digestFor = (value: string): string => {
    const current = digests.get(value);
    if (current !== undefined) return current;
    const digest = `sha256:${(digests.size + 1).toString(16).padStart(64, "0")}`;
    digests.set(value, digest);
    return digest;
  };

  // A stored record's minted UID stays a valid stored UID, so the replayed envelope still parses.
  const uidFor = (value: string): string => {
    const current = uids.get(value);
    if (current !== undefined) return current;
    const uid = `00000000-0000-4000-8000-${(uids.size + 1).toString(16).padStart(12, "0")}`;
    uids.set(value, uid);
    return uid;
  };

  const degradedCommandWarningPrefixes = [
    "Mergeable-sharpening tier degraded to presence (PR source unavailable):",
    "Behind-base read degraded (base ref unresolved):",
  ];
  const normalizeDegradedCommandWarning = (value: string): string => {
    const prefix = degradedCommandWarningPrefixes.find((candidate) => value.startsWith(candidate));
    return prefix === undefined ? value : `${prefix} <COMMAND_ERROR>`;
  };

  const visit = (value: unknown, key: string | undefined): unknown => {
    if (typeof value === "string") {
      let next = value;
      for (const [root, token] of roots) next = next.replaceAll(root, token);
      next = next.replace(/sha256:[0-9a-f]{64}/gu, digestFor);
      next = next.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gu, uidFor);
      next = next.replace(/\b[0-9a-f]{40}\b/gu, (oid) => tokenFor(oids, oid, "OID"));
      next = next.replace(
        /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z\b/gu,
        (stamp) => tokenFor(timestamps, stamp, "TIMESTAMP"),
      );
      next = next.replace(/\b\d{4}-\d{2}-\d{2}\b/gu, (date) => tokenFor(dates, date, "DATE"));
      if (key === "machineId") return "<MACHINE_ID>";
      if (next.startsWith("Unrecognized process boundary:")) {
        return "Unrecognized process boundary: <PROCESS_BOUNDARY>";
      }
      next = next.replace(
        /Unrecognized process boundary: .*$/u,
        "Unrecognized process boundary: <PROCESS_BOUNDARY>",
      );
      return normalizeDegradedCommandWarning(next);
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
