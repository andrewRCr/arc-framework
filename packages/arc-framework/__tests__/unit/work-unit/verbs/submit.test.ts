/**
 * Unit tests for the `submit` verb — the forward phase move opening review.
 *
 * `submit` flips an `Active` WU to `Integrating`: a `set-phase`-only move (no
 * location move, no branch rotation — the working branch already carries its
 * `<type>/` prefix from `activate`) that marks phase entry, not the merge (the
 * integration-interlock owns merge approval). The verb forwards the two judgment
 * soft-field inputs (`Last Completed` / `Next Action`) and dispatches through the
 * executor; a non-`Active` source falls to the table's illegal-edge rejection. The
 * mutators and side-effects reach the contract as spies, so each behavior is
 * asserted over an in-memory index.
 */

import { describe, it, expect } from "vitest";

import type {
  ExecuteTransitionContext,
  SideEffectHandler,
} from "../../../../src/lib/work-unit/lifecycle-executor.js";
import type { DirEntry, LifecycleIndexFs } from "../../../../src/lib/work-unit/lifecycle-index.js";
import type { SideEffectId } from "../../../../src/lib/work-unit/lifecycle-transitions.js";
import type {
  CurrentWuReconcileHost,
  PreparedCurrentWuReconcile,
} from "../../../../src/lib/work-unit/side-effects/discharge-dep-edges.js";
import {
  authorizeSubmission,
  runSubmit,
  type SubmitParams,
} from "../../../../src/lib/work-unit/verbs/submit.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import { createStandardReviewReservation } from
  "../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";

const CWD = "/repo";

interface MetaSpec {
  slug: string;
  state: string;
  branch?: string;
  candidateId?: string;
  /** Task-list markdown to place beside the meta; absent leaves `Task List` at `[none]`. */
  taskList?: string;
}

/** Build an injectable index fs over a fixed set of `active/` metas. */
function buildIndexFs(metas: MetaSpec[]): LifecycleIndexFs {
  const activeDir = `${CWD}/.arc/active`;
  const entries: DirEntry[] = [];
  const files = new Map<string, string>();

  for (const meta of metas) {
    const filename = `meta-${meta.slug}.md`;
    const taskListName = meta.taskList === undefined ? "[none]" : `tasks-${meta.slug}.md`;
    entries.push({ name: filename, isDirectory: () => false });
    if (meta.taskList !== undefined) files.set(`${activeDir}/${taskListName}`, meta.taskList);
    files.set(
      `${activeDir}/${filename}`,
      `# Metadata: ${meta.slug}\n\n` +
        `| **State** | **Owner** | **Branch** | **Class** | **Priority** |\n` +
        `|-----------|-----------|------------|-----------|--------------|\n` +
        `| \`${meta.state}\` | \`andrew\` | \`${meta.branch ?? "feat/foo"}\` | \`Novel\` | \`P1\` |\n\n` +
        `- **Candidate:** \`${meta.candidateId ?? `sha256:${"a".repeat(64)}`}\`\n` +
        `- **Task List:** ${taskListName}\n` +
        `- **Last Completed:** [none]\n- **Next Task:** continue.\n- **Blockers:** [none]\n\n` +
        `- **Next Action:** continue.\n\n---\n`,
    );
  }

  return {
    readdir: (path) =>
      path === activeDir ? Promise.resolve(entries) : Promise.reject(new Error(`ENOENT: ${path}`)),
    readFile: (path) => {
      const content = files.get(path);
      return content === undefined ? Promise.reject(new Error(`ENOENT: ${path}`)) : Promise.resolve(content);
    },
  };
}

interface Harness {
  ctx: ExecuteTransitionContext & CurrentWuReconcileHost;
  calls: string[];
  softWrites: Record<string, string>[];
}

function buildCtx(metas: MetaSpec[]): Harness {
  const calls: string[] = [];
  const softWrites: Record<string, string>[] = [];

  const sideEffects: Partial<Record<SideEffectId, SideEffectHandler>> = {};
  for (const id of ["reconcile-roadmap", "reconcile-status-user", "user-workspace"] satisfies SideEffectId[]) {
    sideEffects[id] = () => {
      calls.push(`side:${id}`);
      return undefined;
    };
  }

  const prepared: PreparedCurrentWuReconcile = {
    slug: "foo",
    plan: {
      status: "ready",
      dependency: {
        before: [],
        after: [],
        replacements: [],
        drops: [],
        discharged: [],
        live: [],
        conflicts: [],
      },
      trackedReferences: { edits: [] },
      advisories: [],
    },
    edits: [],
  };
  const ctx = {
    cwd: CWD,
    indexFs: buildIndexFs(metas),
    setPhase: async (params) => {
      calls.push(`setPhase:${params.phase}`);
      return { phase: "Integrating" };
    },
    relocateArtifacts: async (params) => {
      calls.push(`relocate:${params.fromDir}->${params.toDir}`);
      return { moved: [] };
    },
    reconcileBranch: async (op) => {
      calls.push(`branch:${op.mutation}`);
    },
    reconcileWorkUnitWorktree: async () => ({ mutation: "spawn", worktreePath: "/wt", branch: "x" }),
    writeBranchField: async () => {},
    writeCurrentWorkflowField: async () => {},
    writeDesignField: async () => {},
    writeSoftFields: async (_path, updates) => {
      softWrites.push(updates as Record<string, string>);
    },
    currentWuReconcile: {
      prepare: async () => {
        calls.push("reconcile:prepare");
        return { status: "clean", prepared };
      },
      apply: async () => {
        calls.push("reconcile:apply");
        return { status: "clean", prepared };
      },
    },
    sideEffects,
  } satisfies ExecuteTransitionContext & CurrentWuReconcileHost;

  return { ctx, calls, softWrites };
}

const ACTIVE: MetaSpec = { slug: "foo", state: "Active", branch: "feat/foo" };

const TASK_LIST = [
  "# Task List: Foo",
  "",
  "## **Phase 1:** Build",
  "",
  "### `[x]` **1.1 Wire the reducer**",
  "",
  "### `[x]` **1.2 Verify the composition**",
].join("\n");

const ACTIVE_WITH_TASKS: MetaSpec = { ...ACTIVE, taskList: TASK_LIST };

/** The pointer `projectPublicationBoundary` writes for an unreserved publication. */
const PUBLICATION_POINTER =
  "Resume publication at the idempotent push, then resolve or open the change request.";

const CANDIDATE_ID = `sha256:${"a".repeat(64)}`;
const CANDIDATE_SUBJECT = `sha256:${"b".repeat(64)}`;
const OTHER_SUBJECT = `sha256:${"c".repeat(64)}`;
const WORK_UNIT = SlugSchema.parse("foo");
const BASE: SubmitParams = {
  name: "foo",
  lastCompleted: "Phase 7 — verification",
  nextAction: "open the PR",
  candidateId: CANDIDATE_ID,
  candidateSubjectDigest: CANDIDATE_SUBJECT,
  candidateCurrent: true,
  boundary: {
    schemaVersion: 1,
    mode: "pre-publication-review",
    workUnit: WORK_UNIT,
    candidateId: CANDIDATE_ID,
    candidateSubjectDigest: CANDIDATE_SUBJECT,
    locus: "candidate-submit-ready",
    nextAction: {
      kind: "submit-candidate",
      command: "arc submit foo --json",
      interactionText: "Submit the current Candidate for publication.",
    },
    policy: null,
    reservation: null,
  },
};

/** The same submission with neither orientation override supplied. */
const DERIVED: SubmitParams = {
  name: BASE.name,
  candidateId: BASE.candidateId,
  candidateSubjectDigest: BASE.candidateSubjectDigest,
  candidateCurrent: BASE.candidateCurrent,
  boundary: BASE.boundary,
};

describe("authorizeSubmission", () => {
  it("refuses an open non-reserved pre-publication obligation", () => {
    expect(authorizeSubmission({
      expectedCandidateId: `sha256:${"a".repeat(64)}`,
      expectedCandidateSubjectDigest: CANDIDATE_SUBJECT,
      boundary: {
        schemaVersion: 1,
        mode: "pre-publication-review",
        workUnit: WORK_UNIT,
        candidateId: `sha256:${"a".repeat(64)}`,
        candidateSubjectDigest: CANDIDATE_SUBJECT,
        locus: "candidate-review-pending",
        nextAction: {
          kind: "continue-pre-publication-review",
          command: "arc review pre-publication foo --json",
          interactionText: "Continue the open standard-review obligation.",
        },
        policy: null,
        reservation: null,
      },
    })).toEqual({
      status: "refused",
      reason: "Candidate pre-publication obligations remain open (candidate-review-pending).",
    });
  });

  it("carries the exact hosted-first reservation without settling or erasing it", () => {
    const candidateId = `sha256:${"a".repeat(64)}`;
    const reservation = createStandardReviewReservation({
      candidateId,
      sourceId: "codex-pr",
      repository: "arc-framework/example",
      headSha: "b".repeat(40),
      obligation: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"c".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
    });

    expect(authorizeSubmission({
      expectedCandidateId: candidateId,
      expectedCandidateSubjectDigest: CANDIDATE_SUBJECT,
      boundary: {
        schemaVersion: 1,
        mode: "pre-publication-review",
        workUnit: WORK_UNIT,
        candidateId,
        candidateSubjectDigest: CANDIDATE_SUBJECT,
        locus: "candidate-submit-ready",
        nextAction: {
          kind: "submit-candidate",
          command: "arc submit foo --json",
          interactionText: "Submit the current Candidate for publication.",
        },
        policy: null,
        reservation,
      },
    })).toEqual({ status: "authorized", reservation });
  });

  it("refuses a boundary written for different reviewable content", () => {
    expect(authorizeSubmission({
      expectedCandidateId: CANDIDATE_ID,
      expectedCandidateSubjectDigest: CANDIDATE_SUBJECT,
      boundary: { ...BASE.boundary, candidateSubjectDigest: OTHER_SUBJECT },
    })).toEqual({
      status: "refused",
      reason: "Submission boundary was written for different reviewable content.",
    });
  });
});

describe("runSubmit — the set-phase-only move", () => {
  it("flips Active to Integrating with no location move and no branch rotation", async () => {
    const { ctx, calls } = buildCtx([ACTIVE]);

    const result = await runSubmit(ctx, BASE);

    expect(result.status).toBe("submitted");
    if (result.status !== "submitted") return;
    if (result.outcome.status === "ok") {
      expect(result.outcome.verb).toBe("submit");
      expect(result.outcome.from).toEqual({ phase: "Active", location: "active" });
      expect(result.outcome.to).toEqual({ phase: "Integrating", location: "active" });
    }
    expect(result.metaPath).toBe(".arc/active/meta-foo.md");
    expect(calls).toContain("setPhase:Integrating");
    expect(calls.indexOf("reconcile:prepare")).toBeLessThan(calls.indexOf("setPhase:Integrating"));
    expect(calls.indexOf("reconcile:apply")).toBeLessThan(calls.indexOf("setPhase:Integrating"));
    // No location move and no branch rotation — the working branch already carries its prefix.
    expect(calls.some((c) => c.startsWith("relocate:") || c.startsWith("branch:"))).toBe(false);
  });

  it("refuses a Candidate lineage that is no longer current", async () => {
    const { ctx, calls } = buildCtx([ACTIVE]);

    const result = await runSubmit(ctx, { ...BASE, candidateCurrent: false });

    expect(result).toMatchObject({
      status: "rejected",
      reason: "Cannot submit `foo`: the Candidate lineage is not current.",
      remedy: { argv: ["arc", "propose", "foo"] },
    });
    expect(calls).not.toContain("reconcile:prepare");
    expect(calls.some((call) => call.startsWith("setPhase:"))).toBe(false);
  });

  it("routes a stale review boundary back through pre-publication review", async () => {
    const { ctx, calls } = buildCtx([ACTIVE]);

    const result = await runSubmit(ctx, {
      ...BASE,
      boundary: { ...BASE.boundary, candidateSubjectDigest: OTHER_SUBJECT },
    });

    expect(result).toMatchObject({
      status: "rejected",
      reason: "Cannot submit `foo`: Submission boundary was written for different reviewable content.",
      remedy: { argv: ["arc", "review", "pre-publication", "foo", "--json"] },
    });
    expect(calls).not.toContain("reconcile:prepare");
    expect(calls.some((call) => call.startsWith("setPhase:"))).toBe(false);
  });

  it("carries a hosted-first reservation into the publication resume boundary", async () => {
    const { ctx } = buildCtx([ACTIVE]);
    const reservation = createStandardReviewReservation({
      candidateId: CANDIDATE_ID,
      sourceId: "codex-pr",
      repository: "arc-framework/example",
      headSha: "b".repeat(40),
      obligation: {
        obligation: "required",
        reasons: ["sensitive-change-set"],
        rubricVersion: "standard-review/v1",
        rubricDigest: `sha256:${"c".repeat(64)}`,
        retrigger: "full-final",
        count: 1,
      },
    });

    const result = await runSubmit(ctx, {
      ...BASE,
      boundary: { ...BASE.boundary, reservation },
    });

    expect(result).toMatchObject({
      status: "submitted",
      boundary: {
        mode: "integration-boundary",
        locus: "publication-pending",
        reservation,
      },
    });
  });

  it("writes the supplied Last Completed and Next Action, clearing Next Task", async () => {
    const { ctx, softWrites } = buildCtx([ACTIVE]);

    await runSubmit(ctx, BASE);

    // Phase entry sets the integration orientation from caller inputs; `Next Task`
    // resets to `[none]` (the active task list is closed), `Blockers` is left.
    expect(softWrites).toHaveLength(1);
    expect(softWrites[0]).toEqual({
      "Last Completed": "Phase 7 — verification",
      "Next Task": "[none]",
      "Next Action": "open the PR",
    });
  });

  it("derives both orientation inputs when neither override is supplied", async () => {
    const { ctx, softWrites } = buildCtx([ACTIVE_WITH_TASKS]);

    const result = await runSubmit(ctx, DERIVED);

    expect(result.status).toBe("submitted");
    expect(softWrites).toEqual([{
      "Last Completed": "Task 1.2 — Verify the composition",
      "Next Task": "[none]",
      "Next Action": PUBLICATION_POINTER,
    }]);
  });

  it("keeps supplied overrides ahead of both derivations", async () => {
    const { ctx, softWrites } = buildCtx([ACTIVE_WITH_TASKS]);

    await runSubmit(ctx, { ...DERIVED, lastCompleted: "Phase 7 — verification", nextAction: "open the PR" });

    expect(softWrites[0]).toMatchObject({
      "Last Completed": "Phase 7 — verification",
      "Next Action": "open the PR",
    });
  });

  it("refuses before any mutation when no completed task is readable", async () => {
    const { ctx, calls } = buildCtx([ACTIVE]);

    const result = await runSubmit(ctx, DERIVED);

    expect(result).toMatchObject({
      status: "rejected",
      reason: "Cannot submit `foo`: no completed task is readable from the work unit's task list.",
      remedy: { argv: ["arc", "submit", "foo", "--last-completed", "<work>"] },
    });
    expect(calls).not.toContain("reconcile:prepare");
    expect(calls.some((call) => call.startsWith("setPhase:"))).toBe(false);
  });

  it("rejects a reconcile conflict before changing phase", async () => {
    const { ctx, calls } = buildCtx([ACTIVE]);
    ctx.currentWuReconcile.prepare = async () => ({
      status: "conflict",
      prepared: {
        slug: "foo",
        plan: {
          status: "conflict",
          dependency: {
            before: ["retired"],
            after: ["retired"],
            replacements: [],
            drops: [],
            discharged: [],
            live: ["retired"],
            conflicts: [{ edge: "retired", subject: "retired", reason: "namespace-corrupt" }],
          },
          trackedReferences: { edits: [] },
          advisories: [],
        },
        edits: [],
      },
      reason: "namespace-corrupt",
    });

    const result = await runSubmit(ctx, BASE);

    expect(result.status).toBe("rejected");
    expect(calls).not.toContain("setPhase:Integrating");
  });

  it("returns a typed reconcile failure when the prepared apply becomes stale", async () => {
    const { ctx, calls } = buildCtx([ACTIVE]);
    ctx.currentWuReconcile.apply = async (prepared) => ({
      status: "conflict",
      prepared,
      reason: "stale-content",
    });

    const result = await runSubmit(ctx, BASE);

    expect(result).toMatchObject({
      status: "reconcile-failed",
      reconcile: { status: "conflict", reason: "stale-content" },
    });
    expect(calls).not.toContain("setPhase:Integrating");
  });

  it("stops on advisory-only pending reconcile before changing phase", async () => {
    const { ctx, calls } = buildCtx([ACTIVE]);
    const inspected = await ctx.currentWuReconcile.prepare({
      slug: "foo",
      metaPath: ".arc/active/meta-foo.md",
    });
    const prepared = {
      ...inspected.prepared,
      plan: {
        ...inspected.prepared.plan,
        advisories: [{
          path: ".arc/active/spec-foo.md",
          line: 12,
          context: "Retain retired-subject for historical context.",
          referenceKind: "narrative" as const,
          subject: "retired-subject",
          suggestedDisposition: "review-rename" as const,
        }],
      },
    };
    ctx.currentWuReconcile.prepare = async () => ({ status: "pending", prepared });
    ctx.currentWuReconcile.apply = async () => ({ status: "pending", prepared });

    const result = await runSubmit(ctx, BASE);

    expect(result).toMatchObject({
      status: "reconcile-pending",
      reconcile: {
        status: "pending",
        prepared: { plan: { advisories: [{ subject: "retired-subject" }] } },
      },
    });
    expect(calls).not.toContain("setPhase:Integrating");
    expect(calls).not.toContain("side:reconcile-roadmap");
  });

  it("enters Integrating when advisory retention is explicitly authorized", async () => {
    const { ctx, calls } = buildCtx([ACTIVE]);
    const inspected = await ctx.currentWuReconcile.prepare({
      slug: "foo",
      metaPath: ".arc/active/meta-foo.md",
    });
    const prepared = {
      ...inspected.prepared,
      plan: {
        ...inspected.prepared.plan,
        advisories: [{
          path: ".arc/active/spec-foo.md",
          line: 12,
          context: "Retain retired-subject for historical context.",
          referenceKind: "narrative" as const,
          subject: "retired-subject",
          suggestedDisposition: "review-rename" as const,
        }],
      },
    };
    ctx.currentWuReconcile.prepare = async () => ({ status: "pending", prepared });
    ctx.currentWuReconcile.apply = async () => ({ status: "pending", prepared });

    const result = await runSubmit(ctx, { ...BASE, allowAdvisories: true });

    expect(result).toMatchObject({
      status: "submitted",
      reconcile: {
        status: "pending",
        prepared: { plan: { advisories: [{ subject: "retired-subject" }] } },
      },
    });
    expect(calls).toContain("setPhase:Integrating");
    expect(calls).toContain("side:reconcile-roadmap");
  });

  it("still requires advisory authority after applying mechanical edits", async () => {
    const { ctx, calls } = buildCtx([ACTIVE]);
    const inspected = await ctx.currentWuReconcile.prepare({
      slug: "foo",
      metaPath: ".arc/active/meta-foo.md",
    });
    const prepared = {
      ...inspected.prepared,
      plan: {
        ...inspected.prepared.plan,
        advisories: [{
          path: ".arc/active/spec-foo.md",
          line: 12,
          context: "Retain retired-subject for historical context.",
          referenceKind: "narrative" as const,
          subject: "retired-subject",
          suggestedDisposition: "review-rename" as const,
        }],
      },
    };
    ctx.currentWuReconcile.prepare = async () => ({ status: "pending", prepared });
    ctx.currentWuReconcile.apply = async () => ({
      status: "applied",
      prepared,
      stagedPaths: [".arc/active/meta-foo.md"],
    });

    const result = await runSubmit(ctx, BASE);

    expect(result).toMatchObject({
      status: "reconcile-pending",
      reconcile: {
        status: "applied",
        prepared: { plan: { advisories: [{ subject: "retired-subject" }] } },
      },
    });
    expect(calls).not.toContain("setPhase:Integrating");
  });

  it("continues into Integrating after applying mechanical reconcile edits", async () => {
    const { ctx, calls } = buildCtx([ACTIVE]);
    ctx.currentWuReconcile.apply = async (prepared) => ({
      status: "applied",
      prepared,
      stagedPaths: [".arc/active/meta-foo.md"],
    });

    const result = await runSubmit(ctx, BASE);

    expect(result).toMatchObject({
      status: "submitted",
      reconcile: { status: "applied", stagedPaths: [".arc/active/meta-foo.md"] },
      boundary: {
        locus: "publication-pending",
        nextAction: {
          kind: "continue-publication",
          command: "git push -u origin feat/foo",
        },
      },
    });
    expect(calls).toContain("setPhase:Integrating");
  });
});

describe("runSubmit — the illegal-edge lookup", () => {
  it("reports the durable publication resume point when submission already ran", async () => {
    const { ctx, calls } = buildCtx([{ slug: "foo", state: "Integrating", branch: "feat/foo" }]);
    const publicationBoundary = {
      ...BASE.boundary,
      mode: "integration-boundary" as const,
      locus: "publication-pending" as const,
      nextAction: {
        kind: "continue-publication" as const,
        command: "git push -u origin feat/foo",
        interactionText: "Resume publication at the idempotent push, then resolve or open the change request.",
      },
    };

    // The short-circuit precedes both orientation reads: an already-submitted WU resumes without
    // needing an override or a task list to derive one from.
    const result = await runSubmit(ctx, { ...DERIVED, boundary: publicationBoundary });

    expect(result).toEqual({ status: "unchanged", boundary: publicationBoundary });
    expect(calls.some((c) => c.startsWith("setPhase:"))).toBe(false);
  });

  it("rejects an invalid work-unit name without mutation", async () => {
    const { ctx, calls, softWrites } = buildCtx([ACTIVE]);

    const result = await runSubmit(ctx, { ...BASE, name: "../foo" });

    expect(result.status).toBe("rejected");
    expect(calls).toEqual([]);
    expect(softWrites).toEqual([]);
  });
});
