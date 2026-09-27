/**
 * Unit tests for the `publish` verb — the forward phase move opening review.
 *
 * `publish` flips an `Active` WU to `Integrating`: a `set-phase`-only move (no
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
  runPublish,
  type PublishParams,
} from "../../../../src/lib/work-unit/verbs/publish.js";
import { SlugSchema } from "../../../../src/lib/kernel/index.js";
import {
  CandidatePublishReadyBoundarySchema,
  createStandardReviewReservation,
  projectPublicationBoundary,
  type IntegrationBoundaryLocus,
} from
  "../../../../src/scripts/review-gate/policy/integration-boundary-locus.js";

const CWD = "/repo";
const OWNER_ACCEPTED_TERMINUS = {
  schemaVersion: 1 as const,
  semanticsVersion: "review-terminus/v1" as const,
  kind: "owner-accepted" as const,
  lane: "standard" as const,
  acceptedBy: "andrew",
  completedPasses: 5,
};

interface MetaSpec {
  slug: string;
  state: string;
  branch?: string;
  candidateId?: string;
  currentWorkflow?: string;
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
        `- **Current Workflow:** ${meta.currentWorkflow ?? "[none]"}\n` +
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
    writeCurrentWorkflowField: async (_path, workflow) => {
      calls.push(`workflow:${workflow}`);
    },
    writeDesignField: async () => {},
    writeSoftFields: async (_path, updates) => {
      calls.push("soft-fields");
      softWrites.push(updates as Record<string, string>);
    },
    stageMeta: async () => {
      calls.push("stage-meta");
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
const BASE: PublishParams = {
  name: "foo",
  lastCompleted: "Phase 7 — verification",
  nextAction: "open the PR",
  candidateId: CANDIDATE_ID,
  candidateSubjectDigest: CANDIDATE_SUBJECT,
  candidateCurrent: true,
  refreshCandidateAuthorization: async () => ({
    candidateId: CANDIDATE_ID,
    candidateSubjectDigest: CANDIDATE_SUBJECT,
    candidateCurrent: true,
  }),
  readStandardLaneOwnerVersion: async () => 0,
  claimPublicationBoundary: async () => {},
  boundary: {
    schemaVersion: 1,
    mode: "pre-publication-review",
    workUnit: WORK_UNIT,
    candidateId: CANDIDATE_ID,
    candidateSubjectDigest: CANDIDATE_SUBJECT,
    locus: "candidate-publish-ready",
    standardLaneOwnerVersion: 0,
    nextAction: {
      kind: "publish-candidate",
      command: "arc publish foo --json",
      interactionText: "Submit the current Candidate for publication.",
    },
    policy: null,
    reservation: null,
    terminus: null,
    deliveryReviewTermini: [],
  },
};

function publicationBoundary(
  reservation: IntegrationBoundaryLocus["reservation"] = null,
): IntegrationBoundaryLocus {
  return projectPublicationBoundary({
    workUnit: "foo",
    branch: "feat/foo",
    candidateId: CANDIDATE_ID,
    candidateSubjectDigest: CANDIDATE_SUBJECT,
    standardLaneOwnerVersion: 0,
    reservation,
    changeRequest: null,
  });
}

/** The same submission with neither orientation override supplied. */
const DERIVED: PublishParams = {
  name: BASE.name,
  candidateId: BASE.candidateId,
  candidateSubjectDigest: BASE.candidateSubjectDigest,
  candidateCurrent: BASE.candidateCurrent,
  refreshCandidateAuthorization: BASE.refreshCandidateAuthorization,
  readStandardLaneOwnerVersion: BASE.readStandardLaneOwnerVersion,
  claimPublicationBoundary: BASE.claimPublicationBoundary,
  boundary: BASE.boundary,
};

describe("authorizeSubmission", () => {
  it("refuses readiness when a later same-head standard pass changed the lane owner", () => {
    expect(authorizeSubmission({
      expectedCandidateId: CANDIDATE_ID,
      expectedCandidateSubjectDigest: CANDIDATE_SUBJECT,
      boundary: BASE.boundary,
      currentStandardLaneOwnerVersion: 1,
    })).toEqual({
      status: "refused",
      reason: "Standard review progress changed after publication readiness was recorded.",
    });
  });

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
          command: "arc review pre-publication foo",
          interactionText: "Continue the open standard-review obligation.",
        },
        policy: null,
        reservation: null,
        terminus: null,
        deliveryReviewTermini: [],
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
        locus: "candidate-publish-ready",
        nextAction: {
          kind: "publish-candidate",
          command: "arc publish foo --json",
          interactionText: "Submit the current Candidate for publication.",
        },
        policy: null,
        reservation,
        terminus: null,
        deliveryReviewTermini: [],
      },
    })).toEqual({ status: "authorized", reservation, terminus: null });
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

describe("runPublish — the set-phase-only move", () => {
  it("refuses the transition when a same-head review changed ready lane progress", async () => {
    const { ctx } = buildCtx([ACTIVE]);
    const result = await runPublish(ctx, {
      ...BASE,
      readStandardLaneOwnerVersion: async () => 1,
    });
    expect(result).toMatchObject({
      status: "rejected",
      reason: expect.stringContaining("Standard review progress changed"),
    });
  });

  it("refuses an Active publication-claim retry after later review progress", async () => {
    const { ctx } = buildCtx([ACTIVE]);
    const result = await runPublish(ctx, {
      ...BASE,
      boundary: publicationBoundary(),
      readStandardLaneOwnerVersion: async () => 1,
    });
    expect(result).toMatchObject({
      status: "rejected",
      reason: expect.stringContaining("Standard review progress changed after the publication claim"),
    });
  });

  it("flips Active to Integrating with no location move and no branch rotation", async () => {
    const { ctx, calls } = buildCtx([ACTIVE]);

    const result = await runPublish(ctx, BASE);

    expect(result.status).toBe("published");
    if (result.status !== "published") return;
    if (result.outcome.status === "ok") {
      expect(result.outcome.verb).toBe("publish");
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

  it("persists the exact publication claim before lifecycle mutation", async () => {
    const { ctx, calls } = buildCtx([ACTIVE]);

    await expect(runPublish(ctx, {
      ...BASE,
      claimPublicationBoundary: async () => {
        calls.push("boundary:claim");
      },
    })).resolves.toMatchObject({ status: "published" });

    expect(calls.indexOf("boundary:claim")).toBeLessThan(calls.indexOf("setPhase:Integrating"));
  });

  it("preserves the Owner-accepted conclusion in the publication claim", async () => {
    const { ctx } = buildCtx([ACTIVE]);
    let claimed: IntegrationBoundaryLocus | null = null;
    const boundary = CandidatePublishReadyBoundarySchema.parse({
      ...BASE.boundary,
      terminus: OWNER_ACCEPTED_TERMINUS,
    });

    await expect(runPublish(ctx, {
      ...BASE,
      boundary,
      claimPublicationBoundary: async (value) => {
        claimed = value;
      },
    })).resolves.toMatchObject({ status: "published" });

    expect(claimed).toMatchObject({
      locus: "publication-pending",
      terminus: OWNER_ACCEPTED_TERMINUS,
    });
  });

  it("does not mutate lifecycle state when the publication claim conflicts", async () => {
    const { ctx, calls } = buildCtx([ACTIVE]);

    await expect(runPublish(ctx, {
      ...BASE,
      claimPublicationBoundary: async () => {
        throw new Error("boundary version conflict");
      },
    })).resolves.toMatchObject({ status: "rejected", reason: expect.stringContaining("boundary version conflict") });

    expect(calls).not.toContain("setPhase:Integrating");
  });

  it("refuses a Candidate lineage that is no longer current", async () => {
    const { ctx, calls } = buildCtx([ACTIVE]);

    const result = await runPublish(ctx, { ...BASE, candidateCurrent: false });

    expect(result).toMatchObject({
      status: "rejected",
      reason: "Cannot publish `foo`: the Candidate lineage is not current.",
      remedy: { argv: ["arc", "attest", "foo"] },
    });
    expect(calls).not.toContain("reconcile:prepare");
    expect(calls.some((call) => call.startsWith("setPhase:"))).toBe(false);
  });

  it("routes a stale review boundary back through pre-publication review", async () => {
    const { ctx, calls } = buildCtx([ACTIVE]);

    const result = await runPublish(ctx, {
      ...BASE,
      boundary: { ...BASE.boundary, candidateSubjectDigest: OTHER_SUBJECT },
    });

    expect(result).toMatchObject({
      status: "rejected",
      reason: "Cannot publish `foo`: Submission boundary was written for different reviewable content.",
      remedy: { argv: ["arc", "review", "pre-publication", "foo"] },
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

    const result = await runPublish(ctx, {
      ...BASE,
      boundary: CandidatePublishReadyBoundarySchema.parse({ ...BASE.boundary, reservation }),
    });

    expect(result).toMatchObject({
      status: "published",
      boundary: {
        mode: "integration-boundary",
        locus: "publication-pending",
        reservation,
      },
    });
  });

  it("writes the supplied Last Completed and Next Action, clearing Next Task", async () => {
    const { ctx, softWrites } = buildCtx([ACTIVE]);

    await runPublish(ctx, BASE);

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

    const result = await runPublish(ctx, DERIVED);

    expect(result.status).toBe("published");
    expect(softWrites).toEqual([{
      "Last Completed": "Task 1.2 — Verify the composition",
      "Next Task": "[none]",
      "Next Action": PUBLICATION_POINTER,
    }]);
  });

  it("keeps supplied overrides ahead of both derivations", async () => {
    const { ctx, softWrites } = buildCtx([ACTIVE_WITH_TASKS]);

    await runPublish(ctx, { ...DERIVED, lastCompleted: "Phase 7 — verification", nextAction: "open the PR" });

    expect(softWrites[0]).toMatchObject({
      "Last Completed": "Phase 7 — verification",
      "Next Action": "open the PR",
    });
  });

  it("refuses before any mutation when no completed task is readable", async () => {
    const { ctx, calls } = buildCtx([ACTIVE]);

    const result = await runPublish(ctx, DERIVED);

    expect(result).toMatchObject({
      status: "rejected",
      reason: "Cannot publish `foo`: no completed task is readable from the work unit's task list.",
      remedy: { argv: ["arc", "publish", "foo", "--last-completed", "<work>"] },
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

    const result = await runPublish(ctx, BASE);

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

    const result = await runPublish(ctx, BASE);

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

    const result = await runPublish(ctx, BASE);

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

    const result = await runPublish(ctx, { ...BASE, allowAdvisories: true });

    expect(result).toMatchObject({
      status: "published",
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

    const result = await runPublish(ctx, BASE);

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

    const result = await runPublish(ctx, BASE);

    expect(result).toMatchObject({
      status: "published",
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

describe("runPublish — the illegal-edge lookup", () => {
  it("reports the durable publication resume point when submission already ran", async () => {
    const { ctx, calls } = buildCtx([{
      slug: "foo",
      state: "Integrating",
      branch: "feat/foo",
      currentWorkflow: "integrate-work-unit",
    }]);
    const boundary = publicationBoundary();

    // A repeat over a fully finalized transition is observationally side-effect free.
    const result = await runPublish(ctx, { ...BASE, boundary });

    expect(result).toEqual({ status: "unchanged", boundary });
    expect(calls).toEqual([]);
  });

  it("finishes only the publication projection after the phase transition already landed", async () => {
    const { ctx, calls, softWrites } = buildCtx([{
      slug: "foo",
      state: "Integrating",
      branch: "feat/foo",
      currentWorkflow: "prepare-work-unit",
    }]);
    const boundary = publicationBoundary();

    await expect(runPublish(ctx, { ...BASE, boundary })).resolves.toEqual({
      status: "unchanged",
      boundary,
    });
    expect(calls).toContain("workflow:integrate-work-unit");
    expect(calls).toContain("soft-fields");
    expect(calls).toContain("stage-meta");
    expect(calls).toContain("side:reconcile-roadmap");
    expect(calls).not.toContain("setPhase:Integrating");
    expect(calls).not.toContain("side:reconcile-status-user");
    expect(calls).not.toContain("side:user-workspace");
    expect(softWrites).toEqual([{
      "Last Completed": "Phase 7 — verification",
      "Next Task": "[none]",
      "Next Action": "open the PR",
    }]);
  });

  it.each(["soft-fields", "stage-meta"] as const)(
    "repairs a %s finalization failure after the phase transition landed",
    async (failure) => {
      const boundary = publicationBoundary();
      const first = buildCtx([{
        slug: "foo",
        state: "Integrating",
        branch: "feat/foo",
        currentWorkflow: "prepare-work-unit",
      }]);
      if (failure === "soft-fields") {
        first.ctx.writeSoftFields = async () => {
          throw new Error("soft-field write failed");
        };
      } else {
        first.ctx.stageMeta = async () => {
          throw new Error("meta staging failed");
        };
      }
      await expect(runPublish(first.ctx, { ...BASE, boundary }))
        .resolves.toMatchObject({ status: "rejected" });

      const retry = buildCtx([{
        slug: "foo",
        state: "Integrating",
        branch: "feat/foo",
        currentWorkflow: "prepare-work-unit",
      }]);
      await expect(runPublish(retry.ctx, { ...BASE, boundary }))
        .resolves.toEqual({ status: "unchanged", boundary });
      expect(retry.calls).toContain("workflow:integrate-work-unit");
      expect(retry.calls).toContain("soft-fields");
      expect(retry.calls).toContain("stage-meta");
    },
  );

  it("rejects an invalid work-unit name without mutation", async () => {
    const { ctx, calls, softWrites } = buildCtx([ACTIVE]);

    const result = await runPublish(ctx, { ...BASE, name: "../foo" });

    expect(result.status).toBe("rejected");
    expect(calls).toEqual([]);
    expect(softWrites).toEqual([]);
  });
});
