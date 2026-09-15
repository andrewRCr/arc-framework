/** Strict top-level and conditional-presence coverage for session-init envelopes. */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { assertSessionInitProbeResult, SessionInitProbeResultSchema } from "../../../src/commands/status/schema.js";

const FIXTURE_DIR = join(import.meta.dirname, "..", "..", "fixtures", "session-envelope");

function fixture(name: string): Record<string, unknown> {
  const normalized = readFileSync(join(FIXTURE_DIR, `session-init-${name}.json`), "utf8");
  const producerCompatible = normalized.replaceAll(/<DATE_\d+>/gu, "2026-01-02");
  const value = JSON.parse(producerCompatible) as Record<string, unknown>;
  const derivedRow = {
    kind: "free-primary",
    checkout: { path: "/redacted/primary", primary: true },
    subject: null,
    context: null,
    diagnostics: [],
  };
  value.derivedLocusState = {
    ok: true,
    value: {
      roster: [derivedRow],
      entering: { kind: "selected", row: derivedRow },
      primaryAvailability: { kind: "free", checkoutPath: "/redacted/primary" },
      identityDiscovery: { kind: "absent" },
      active: null,
    },
  };
  delete value.deliveryPosition;
  const active = value.active as { ok?: boolean; value?: { resolution?: string; path?: string | null } };
  const baseDistance = value.baseDistance as {
    ok?: boolean;
    value?: { state?: string; remoteEvidence?: string };
  };
  const baseDistanceValue = baseDistance.value;
  if (baseDistance.ok === true && baseDistanceValue !== undefined && baseDistanceValue.remoteEvidence === undefined) {
    const state = baseDistanceValue.state ?? "";
    // `remote-unavailable` admits exact, pending-fetch, and unreachable, each with a
    // different required shape, so no default can be correct — a fixture must say which.
    if (state === "remote-unavailable") {
      throw new Error("A remote-unavailable base-distance fixture must state its remoteEvidence.");
    }
    // The arms that resolve before any snapshot evidence is consulted. Keep this list in
    // step with the base-distance rule in `commands/status/schema.ts`; a state missing
    // here defaults to `exact` and silently passes a fixture the producer cannot emit.
    baseDistanceValue.remoteEvidence = ["skipped", "no-remote", "detached-head"].includes(state)
      ? "not-applicable"
      : "exact";
  }
  if (active.ok === true && active.value?.resolution === "single") {
    const slug = active.value.path?.match(/meta-(.+)\.md$/u)?.[1] ?? "active-work-unit";
    value.currentWuReconcile = {
      ok: true,
      value: {
        status: "clean",
        slug,
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
        recommendedAction: "skip",
        recommendedCommand: null,
        recommendedPromptText: "",
      },
    };
    if ((value.identity as { identity?: string | null }).identity !== null) {
      value.userReferenceReconcile = {
        ok: true,
        value: {
          status: "clean",
          authority: {
            status: "ready",
            ref: "main",
            transitions: [],
            remoteEvidence: "not-applicable",
          },
          plan: { status: "clean", edits: [], advisories: [] },
          recommendedAction: "skip",
          recommendedCommand: null,
          recommendedPromptText: "",
        },
      };
    }
  }
  return value;
}

function owningWorkUnitFixture(): Record<string, unknown> {
  const normalized = readFileSync(join(FIXTURE_DIR, "session-init-active-resume.json"), "utf8");
  return JSON.parse(normalized.replaceAll(/<DATE_\d+>/gu, "2026-01-02")) as Record<string, unknown>;
}

function clone(value: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(value);
}

function expectInvalid(value: Record<string, unknown>): void {
  expect(SessionInitProbeResultSchema.safeParse(value).success).toBe(false);
}

function expectValid(value: Record<string, unknown>): void {
  const parsed = SessionInitProbeResultSchema.safeParse(value);
  expect(parsed.success ? null : parsed.error.message).toBeNull();
}

function withoutKey(value: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([candidate]) => candidate !== key));
}

type MutationPath = readonly (string | number)[];

function setPath(value: Record<string, unknown>, path: MutationPath, replacement: unknown): void {
  let parent: unknown = value;
  for (const segment of path.slice(0, -1)) {
    parent = (parent as Record<string | number, unknown>)[segment];
  }
  const leaf = path.at(-1);
  if (leaf === undefined) throw new Error("mutation path must not be empty");
  (parent as Record<string | number, unknown>)[leaf] = replacement;
}

function expectContractFailure(value: Record<string, unknown>, expectedPath: string): void {
  expect(() => assertSessionInitProbeResult(value)).toThrow(`session-init-envelope: ${expectedPath}:`);
}

function integrationBoundaryFixture(workUnit = "active-widget"): Record<string, unknown> {
  return {
    schemaVersion: 1,
    mode: "integration-boundary",
    workUnit,
    candidateId: `sha256:${"1".repeat(64)}`,
    candidateSubjectDigest: `sha256:${"2".repeat(64)}`,
    terminus: null,
    locus: "publication-pending",
    nextAction: {
      kind: "continue-publication",
      command: `git push -u origin feat/${workUnit}`,
      interactionText: "Continue publication.",
    },
    policy: null,
    reservation: null,
  };
}

describe("session-init envelope schema", () => {
  it("accepts completed-work-unit integration recovery without a live publication boundary", () => {
    const value = owningWorkUnitFixture();
    setPath(value, ["active", "value", "sessionType"], "integration");
    setPath(value, ["active", "value", "currentWorkflow"], "integrate-work-unit");
    setPath(value, ["active", "value", "integrationBoundary"], null);
    setPath(value, ["derivedLocusState", "value", "active", "context", "sessionType"], "integration");
    setPath(value, ["derivedLocusState", "value", "active", "context", "workflow"], "integrate-work-unit");
    setPath(value, ["derivedLocusState", "value", "active", "context", "integrationBoundary"], null);
    setPath(value, ["derivedLocusState", "value", "roster", 1, "lifecycleLocation"], "completed");

    expectValid(value);
  });

  it("accepts task and verification substages without changing the integration session type", () => {
    const taskWork = owningWorkUnitFixture();
    const boundary = integrationBoundaryFixture();
    setPath(taskWork, ["active", "value", "sessionType"], "integration");
    setPath(taskWork, ["active", "value", "currentWorkflow"], "process-task-loop");
    setPath(taskWork, ["active", "value", "integrationBoundary"], boundary);
    setPath(taskWork, ["derivedLocusState", "value", "active", "context", "sessionType"], "integration");
    setPath(taskWork, ["derivedLocusState", "value", "active", "context", "workflow"], "process-task-loop");
    setPath(taskWork, ["derivedLocusState", "value", "active", "context", "integrationBoundary"], boundary);
    expectValid(taskWork);

    const verification = clone(taskWork);
    const closed = { status: "no-open-task" };
    setPath(verification, ["taskCursor", "value"], closed);
    setPath(verification, ["active", "value", "currentWorkflow"], "verify-work-unit");
    setPath(verification, ["derivedLocusState", "value", "active", "context", "workflow"], "verify-work-unit");
    setPath(verification, ["derivedLocusState", "value", "active", "context", "taskCursor"], closed);
    expectValid(verification);

    const changedCandidateVerification = clone(verification);
    setPath(changedCandidateVerification, ["active", "value", "integrationBoundary"], null);
    setPath(
      changedCandidateVerification,
      ["derivedLocusState", "value", "active", "context", "integrationBoundary"],
      null,
    );
    expectValid(changedCandidateVerification);

    const boundarylessIntegration = clone(changedCandidateVerification);
    setPath(boundarylessIntegration, ["active", "value", "currentWorkflow"], "integrate-work-unit");
    setPath(
      boundarylessIntegration,
      ["derivedLocusState", "value", "active", "context", "workflow"],
      "integrate-work-unit",
    );
    expectContractFailure(boundarylessIntegration, "active.value.integrationBoundary");

    const skippedTask = clone(taskWork);
    setPath(skippedTask, ["active", "value", "currentWorkflow"], "integrate-work-unit");
    setPath(
      skippedTask,
      ["derivedLocusState", "value", "active", "context", "workflow"],
      "integrate-work-unit",
    );
    expectContractFailure(skippedTask, "active.value.currentWorkflow");
  });

  it("requires the delivery-position slot exactly at the owning work-unit locus", () => {
    const owning = owningWorkUnitFixture();
    expectValid(owning);

    const missing = clone(owning);
    delete missing.deliveryPosition;
    expectContractFailure(missing, "deliveryPosition");

    const ineligible = fixture("orient");
    ineligible.deliveryPosition = { ok: true, value: null };
    expectContractFailure(ineligible, "deliveryPosition");
  });

  it("accepts null, coherent, and degraded delivery-position probe arms", () => {
    const coherent = owningWorkUnitFixture();
    coherent.deliveryPosition = {
      ok: true,
      value: {
        planId: "123e4567-e89b-42d3-a456-426614174000",
        workUnitId: "active-widget",
        landedCount: 1,
        totalCount: 2,
        activeOperation: { kind: "rewrite", operationId: "op-1" },
        line: "Delivery position: 1/2 landed; active operation: rewrite op-1.",
      },
    };
    expectValid(coherent);

    const mismatched = clone(coherent);
    setPath(mismatched, ["deliveryPosition", "value", "workUnitId"], "other-widget");
    expectContractFailure(mismatched, "deliveryPosition.value.workUnitId");

    const degraded = owningWorkUnitFixture();
    degraded.deliveryPosition = {
      ok: false,
      error: { kind: "runtime", message: "delivery evidence unavailable" },
    };
    expectValid(degraded);

    setPath(coherent, ["deliveryPosition", "value", "landedCount"], 3);
    expectContractFailure(coherent, "deliveryPosition.value.landedCount");
  });
  it("rejects retired session-frame fields", () => {
    const value = fixture("orient");
    setPath(value, ["derivedLocusState", "value", "current"], { kind: "none" });
    expectContractFailure(value, "derivedLocusState.value");
  });

  it("rejects crossed worktree and base-distance evidence fields", () => {
    const worktree = fixture("orient");
    setPath(worktree, ["worktree", "value", "remoteEvidence"], "unreachable");
    expectInvalid(worktree);

    const baseDistance = fixture("orient");
    setPath(baseDistance, ["baseDistance", "value", "remoteEvidence"], "unreachable");
    expectInvalid(baseDistance);

    const inapplicableWorktree = fixture("orient");
    setPath(inapplicableWorktree, ["worktree", "value", "state"], "clean");
    expectInvalid(inapplicableWorktree);

    const inapplicableBaseDistance = fixture("orient");
    setPath(inapplicableBaseDistance, ["baseDistance", "value", "verdict"], "clean");
    expectInvalid(inapplicableBaseDistance);

    const missingExactBase = fixture("branch-gone");
    setPath(missingExactBase, ["baseDistance", "value", "baseOid"], null);
    expectInvalid(missingExactBase);

    const missingHealthyMovement = fixture("branch-gone");
    setPath(missingHealthyMovement, ["baseDistance", "value", "movement"], undefined);
    expectInvalid(missingHealthyMovement);

    const crossedInapplicableMovement = fixture("orient");
    setPath(crossedInapplicableMovement, ["baseDistance", "value", "movement"], "disjoint");
    expectInvalid(crossedInapplicableMovement);

    const crossedBaseRecommendation = fixture("branch-gone");
    setPath(crossedBaseRecommendation, ["baseDistance", "value", "recommendedAction"], "surface");
    setPath(crossedBaseRecommendation, ["baseDistance", "value", "recommendedPromptText"], "wrong");
    expectInvalid(crossedBaseRecommendation);

    const missingWorktreeBranch = fixture("branch-gone");
    setPath(missingWorktreeBranch, ["worktree", "value", "branch"], null);
    expectInvalid(missingWorktreeBranch);

    const crossedSupersession = fixture("branch-gone");
    setPath(crossedSupersession, ["worktree", "value", "supersession"], { superseded: true });
    expectInvalid(crossedSupersession);
  });

  it("accepts typed pending user-reference authority and rejects incomplete unreachable authority", () => {
    const pending = fixture("active-resume");
    setPath(pending, ["userReferenceReconcile", "value"], {
      status: "pending",
      authority: {
        status: "pending",
        ref: "a".repeat(40),
        reason: "base-object-pending-fetch",
        remoteEvidence: "pending-fetch",
      },
      plan: null,
      recommendedAction: "surface",
      recommendedCommand: null,
      recommendedPromptText: "Base evidence is pending.",
    });
    expect(SessionInitProbeResultSchema.safeParse(pending).success).toBe(true);

    const unreachable = clone(pending);
    setPath(unreachable, ["userReferenceReconcile", "value", "status"], "unavailable");
    setPath(unreachable, ["userReferenceReconcile", "value", "authority"], {
      status: "unavailable",
      ref: "origin/main",
      remoteEvidence: "unreachable",
    });
    expectInvalid(unreachable);

    const crossedReady = fixture("active-resume");
    setPath(crossedReady, ["userReferenceReconcile", "value", "authority", "failureReason"], "network");
    expectInvalid(crossedReady);

    const crossedRecommendation = clone(pending);
    setPath(crossedRecommendation, ["userReferenceReconcile", "value", "recommendedAction"], "apply");
    expectInvalid(crossedRecommendation);

    const emptyPendingPlan = fixture("active-resume");
    setPath(emptyPendingPlan, ["userReferenceReconcile", "value"], {
      status: "pending",
      authority: {
        status: "ready",
        ref: "a".repeat(40),
        transitions: [],
        remoteEvidence: "exact",
      },
      plan: { status: "pending", edits: [], advisories: [] },
      recommendedAction: "apply",
      recommendedCommand: ["arc", "user", "reconcile-references", "--apply", "--json"],
      recommendedPromptText: "Apply references.",
    });
    expectInvalid(emptyPendingPlan);

    // One edit makes the plan legitimately pending-shaped — the rule reads only
    // `edits.length`, never element contents — so this payload is valid except for the
    // command. The positive control proves that, and therefore that the rejection below
    // is the command contract rather than a second defect in the same fixture.
    const realApplyCommand = clone(emptyPendingPlan);
    setPath(realApplyCommand, ["userReferenceReconcile", "value", "plan", "edits"], [{}]);
    expectValid(realApplyCommand);

    const fakeApplyCommand = clone(realApplyCommand);
    setPath(fakeApplyCommand, ["userReferenceReconcile", "value", "recommendedCommand"], ["fake", "--apply"]);
    expectInvalid(fakeApplyCommand);
  });

  it("rejects mergeable work units without known base evidence", () => {
    const value = fixture("orient");
    value.workUnitState = {
      ok: true,
      value: {
        inFlight: {
          workUnits: [{
            state: "mergeable",
            behindBase: {
              status: "unavailable",
              remoteEvidence: "pending-fetch",
              reason: "base-object-pending-fetch",
            },
          }],
        },
        nudge: { shouldNudge: false },
      },
    };
    expectInvalid(value);
  });

  it("does not publish the request-only remote context", () => {
    const value = fixture("orient");
    value.remoteContext = { kind: "available", generation: "internal" };
    expectInvalid(value);
  });

  it("asserts full and thin producer defects with the registered contract identity", () => {
    const fullDefect = fixture("orient");
    (fullDefect.identity as { role: string }).role = "";
    expect(() => assertSessionInitProbeResult(fullDefect)).toThrow(/session-init-envelope: identity\.role:/u);

    const thinDefect = fixture("orient");
    (thinDefect.worktree as { value: { recommendedAction: string } }).value.recommendedAction = "guess";
    expect(() => assertSessionInitProbeResult(thinDefect)).toThrow(
      /session-init-envelope: worktree\.value\.recommendedAction:/u,
    );
  });

  it.each([
    ["user state", "orient", ["user", "value", "state"], "unknown", "user.value.state"],
    ["user ref state", "orient", ["user", "value", "refState"], "unknown", "user.value.refState"],
    ["user content relation", "orient", ["user", "value", "contentRelation"], "unknown", "user.value.contentRelation"],
    ["user coherence", "orient", ["user", "value", "coherenceState"], "unknown", "user.value.coherenceState"],
    ["user qualifier", "orient", ["user", "value", "qualifier"], "unknown", "user.value.qualifier"],
    [
      "user note freshness",
      "orient",
      ["user", "value", "localNoteFreshness", "state"],
      "unknown",
      "user.value.localNoteFreshness.state",
    ],
    [
      "user notes drift",
      "branch-gone",
      ["user", "value", "notesDrift", "direction"],
      "unknown",
      "user.value.notesDrift.direction",
    ],
    ["user load-needed gate", "branch-gone", ["user", "value", "loadNeeded"], "yes", "user.value.loadNeeded"],
    [
      "user drift-surface direction",
      "branch-gone",
      ["user", "value", "notesDriftSurface", "direction"],
      "unknown",
      "user.value.notesDriftSurface.direction",
    ],
    [
      "user drift-surface register",
      "branch-gone",
      ["user", "value", "notesDriftSurface", "register"],
      "unknown",
      "user.value.notesDriftSurface.register",
    ],
    [
      "user recommendation",
      "orient",
      ["user", "value", "recommendedAction"],
      "unknown",
      "user.value.recommendedAction",
    ],
    ["worktree state", "orient", ["worktree", "value", "state"], "unknown", "worktree.value.state"],
    ["worktree branch", "orient", ["worktree", "value", "branch"], 42, "worktree.value.branch"],
    [
      "worktree branch omission",
      "orient",
      ["worktree", "value", "branch"],
      undefined,
      "worktree.value.branch",
    ],
    [
      "worktree identity",
      "orient",
      ["worktree", "value", "identity", "kind"],
      "unknown",
      "worktree.value.identity.kind",
    ],
    [
      "worktree supersession",
      "orient",
      ["worktree", "value", "supersession"],
      { superseded: "yes" },
      "worktree.value.supersession.superseded",
    ],
    [
      "worktree recommendation",
      "orient",
      ["worktree", "value", "recommendedAction"],
      "unknown",
      "worktree.value.recommendedAction",
    ],
    ["base-distance verdict", "orient", ["baseDistance", "value", "verdict"], "unknown", "baseDistance.value.verdict"],
    [
      "base-distance recommendation",
      "orient",
      ["baseDistance", "value", "recommendedAction"],
      "unknown",
      "baseDistance.value.recommendedAction",
    ],
    [
      "base-sync recommendation",
      "orient",
      ["baseBranchSync", "value", "recommendedAction"],
      "unknown",
      "baseBranchSync.value.recommendedAction",
    ],
    ["dirty state", "orient", ["dirty", "value", "state"], "unknown", "dirty.value.state"],
    ["extensions mode", "orient", ["extensions", "value", "mode"], "unknown", "extensions.value.mode"],
    ["config mode", "orient", ["config", "value", "mode"], "unknown", "config.value.mode"],
    ["active mode", "orient", ["active", "value", "mode"], "unknown", "active.value.mode"],
    ["active layout", "orient", ["active", "value", "layout"], "unknown", "active.value.layout"],
    ["active resolution", "orient", ["active", "value", "resolution"], "unknown", "active.value.resolution"],
    ["active session type", "orient", ["active", "value", "sessionType"], "unknown", "active.value.sessionType"],
    ["active planning stage", "orient", ["active", "value", "planningStage"], "unknown", "active.value.planningStage"],
    ["domain-rules mode", "orient", ["domainRules", "value", "mode"], "unknown", "domainRules.value.mode"],
    [
      "retired-subdir recommendation",
      "orient",
      ["retiredSubdirs", "value", "recommendedAction"],
      "unknown",
      "retiredSubdirs.value.recommendedAction",
    ],
    [
      "release task route",
      "orient",
      ["releaseRouting", "value", "taskCommit"],
      "unknown",
      "releaseRouting.value.taskCommit",
    ],
    [
      "release workflow route",
      "orient",
      ["releaseRouting", "value", "workflowCommit"],
      "unknown",
      "releaseRouting.value.workflowCommit",
    ],
    [
      "release push route",
      "orient",
      ["releaseRouting", "value", "workflowPush"],
      "unknown",
      "releaseRouting.value.workflowPush",
    ],
    ...[
      "session.remote_sync",
      "session.init_pull.worktree",
      "session.init_pull.notes",
      "session.init_pull.base",
      "session.init_load.notes",
      "user.notes_push",
      "branch.protection",
      "pm.mode",
      "commit.format",
      "commit.context_footer",
      "commit.interlock",
      "push.interlock",
    ].map((key) => [
      `config ${key}`,
      "orient",
      ["config", "value", "settings", key],
      "unknown",
      `config.value.settings.${key}`,
    ]),
  ] as Array<readonly [string, string, MutationPath, unknown, string]>)(
    "rejects the mapped thin routing field: %s",
    (_label, fixtureName, path, replacement, expectedPath) => {
      const value = fixture(fixtureName);
      setPath(value, path, replacement);
      expectContractFailure(value, expectedPath);
    },
  );

  it.each([
    ["load-set-manifest", "orient", ["loadSet", "value", "manifestVersion"], 2, "loadSet.value.manifestVersion"],
    [
      "task-list-cursor-file-result",
      "active-resume",
      ["taskCursor", "value", "status"],
      "unknown",
      "taskCursor.value.status",
    ],
    [
      "task-list-cursor",
      "active-resume",
      ["taskCursor", "value", "cursor", "section", "id"],
      "invalid",
      "taskCursor.value.cursor.section.id",
    ],
    ["inbox-state", "orient", ["inboxState", "value", "routableCount"], -1, "inboxState.value.routableCount"],
    [
      "errand-staleness-sweep",
      "orient",
      ["errandSweep", "value", "stale"],
      [{ slug: "", created: "2026-01-02", ageDays: 30 }],
      "errandSweep.value.stale.0.slug",
    ],
    [
      "notes-compaction-session-advisory",
      "orient",
      ["compactionAdvisory", "value", "historyCommitCount"],
      -1,
      "compactionAdvisory.value.historyCommitCount",
    ],
    [
      "materializable-work-units",
      "orient",
      ["materializableWorkUnits", "value", "candidates"],
      [{ name: "invalid name", branch: "feat/test" }],
      "materializableWorkUnits.value.candidates.0.name",
    ],
    [
      "orphan-branch-sweep",
      "orient",
      ["orphanBranchSweep", "value", "orphans"],
      [{ branch: "", merged: false, shippedWorkUnit: null }],
      "orphanBranchSweep.value.orphans.0.branch",
    ],
    [
      "retired-subdir-detection",
      "orient",
      ["retiredSubdirs", "value", "candidates"],
      ["invalid name"],
      "retiredSubdirs.value",
    ],
    [
      "partial-push-marker-surface",
      "orient",
      ["partialPushMarker", "value", "markers"],
      [
        {
          machineId: "",
          lastAttemptedCommit: "a".repeat(40),
          attemptTimestamp: "2026-01-02T03:04:05Z",
        },
      ],
      "partialPushMarker.value.markers.0.machineId",
    ],
    ["class-composition", "orient", ["inFlightComposition", "heavy"], -1, "inFlightComposition.heavy"],
    ["cascade-resolution", "branch-gone", ["recovery", "value", "kind"], "unknown", "recovery.value.kind"],
    ["base-branch-sync", "orient", ["baseBranchSync", "value", "state"], "unknown", "baseBranchSync.value"],
  ] as Array<readonly [string, string, MutationPath, unknown, string]>)(
    "rejects a representative %s family-root defect in the composed envelope",
    (_root, fixtureName, path, replacement, expectedPath) => {
      const value = fixture(fixtureName);
      setPath(value, path, replacement);
      expectContractFailure(value, expectedPath);
    },
  );

  it.each([
    ["roster object", "orient", ["roster", "value"], [], "roster.value"],
    [
      "current-husk subject",
      "current-husk",
      ["currentHusk", "value", "subject", "kind"],
      "branch",
      "currentHusk.value.subject.kind",
    ],
    [
      "current-husk stamp",
      "current-husk",
      ["currentHusk", "value", "stamp", "kind"],
      "future",
      "currentHusk.value.stamp.kind",
    ],
    [
      "work-unit classification",
      "orient",
      ["workUnitState", "value", "inFlight", "workUnits", 0, "state"],
      "unknown",
      "workUnitState.value.inFlight.workUnits.0.state",
    ],
    [
      "work-unit behind-base",
      "orient",
      ["workUnitState", "value", "inFlight", "workUnits", 0, "behindBase"],
      "yes",
      "workUnitState.value.inFlight.workUnits.0.behindBase",
    ],
    [
      "work-unit nudge",
      "orient",
      ["workUnitState", "value", "nudge", "shouldNudge"],
      "yes",
      "workUnitState.value.nudge.shouldNudge",
    ],
    [
      "errand resume",
      "orient",
      ["errandState", "value", "resume", "resumable"],
      "yes",
      "errandState.value.resume.resumable",
    ],
    [
      "errand nudge",
      "orient",
      ["errandState", "value", "nudge", "shouldNudge"],
      "yes",
      "errandState.value.nudge.shouldNudge",
    ],
  ] as Array<readonly [string, string, MutationPath, unknown, string]>)(
    "rejects the mapped deep routing field: %s",
    (_label, fixtureName, path, replacement, expectedPath) => {
      const value = fixture(fixtureName);
      if (path[0] === "workUnitState") {
        value.workUnitState = structuredClone(fixture("branch-gone").workUnitState);
        setPath(value, ["workUnitState", "value", "inFlight", "workUnits"], [{
          name: "heavy-widget",
          branch: "feat/heavy-widget",
          behindBase: { status: "not-applicable", remoteEvidence: "not-applicable" },
          ageDays: 0,
          state: "awaiting-review",
        }]);
      }
      setPath(value, path, replacement);
      expectContractFailure(value, expectedPath);
    },
  );

  it.each([
    ["stale report kind", { kind: "unknown", decision: { action: "external" } }, "sweep.value.worktrees.0.kind"],
    [
      "branched decision action",
      { kind: "branched", decision: { action: "unknown" } },
      "sweep.value.worktrees.0.decision.action",
    ],
    [
      "branched decision reason",
      {
        kind: "branched",
        decision: { action: "blocked", reason: "unknown" },
      },
      "sweep.value.worktrees.0.decision.reason",
    ],
    [
      "husk subject",
      {
        kind: "husk",
        subject: { kind: "unknown" },
        stamp: { kind: "legacy" },
        decision: { action: "removable" },
      },
      "sweep.value.worktrees.0.subject.kind",
    ],
    [
      "husk stamp",
      {
        kind: "husk",
        subject: { kind: "work-unit" },
        stamp: { kind: "future" },
        decision: { action: "removable" },
      },
      "sweep.value.worktrees.0.stamp.kind",
    ],
    [
      "husk decision action",
      {
        kind: "husk",
        subject: { kind: "work-unit" },
        stamp: { kind: "legacy" },
        decision: { action: "unknown" },
      },
      "sweep.value.worktrees.0.decision.action",
    ],
    [
      "husk blocked reason",
      {
        kind: "husk",
        subject: { kind: "work-unit" },
        stamp: { kind: "legacy" },
        decision: { action: "blocked", reason: "unknown" },
      },
      "sweep.value.worktrees.0.decision.reason",
    ],
    [
      "husk outside reason",
      {
        kind: "husk",
        subject: { kind: "work-unit" },
        stamp: { kind: "legacy" },
        decision: { action: "outside", reason: "unknown" },
      },
      "sweep.value.worktrees.0.decision.reason",
    ],
  ] as const)("rejects the stale-worktree routing field: %s", (_label, report, expectedPath) => {
    const value = fixture("orient");
    setPath(value, ["sweep", "value", "worktrees"], [report]);
    expectContractFailure(value, expectedPath);
  });

  it("accepts typed retirement and rename remedies while rejecting reconstructed argv", () => {
    const value = fixture("orient");
    setPath(value, ["sweep", "value", "remoteEvidence"], "exact");
    setPath(value, ["sweep", "value", "retirements"], [{
      status: "actionable",
      worktreePath: "/wt/retired",
      lifecycle: {
        subject: { slug: "retired", branch: "feat/retired" },
        transition: "abandon",
        cleanup: {
          branch: { status: "pending" },
          worktree: { status: "pending" },
          userWorkspace: { status: "pending" },
        },
        successorReadiness: { candidates: [], actionable: true, remedy: null },
      },
      teardown: { argv: ["arc", "teardown", "retired"], text: "arc teardown retired" },
    }]);
    setPath(value, ["sweep", "value", "renameMoves"], [{
      oldSlug: "old",
      newSlug: "new",
      branch: "feat/new",
      head: "1".repeat(40),
      from: "/wt/old",
      to: "/wt/new",
      remedy: {
        argv: ["git", "worktree", "move", "/wt/old", "/wt/new"],
        text: "git worktree move /wt/old /wt/new",
      },
    }]);
    expect(SessionInitProbeResultSchema.safeParse(value).success).toBe(true);

    setPath(value, ["sweep", "value", "renameMoves", 0, "remedy", "argv", 0], "arc");
    expectContractFailure(value, "sweep.value.renameMoves.0.remedy.argv.0");
  });

  it.each([
    [
      "errand classification",
      ["errandState", "value", "inFlight", "errands"],
      [{ state: "unknown" }],
      "errandState.value.inFlight.errands.0.state",
    ],
    [
      "errand candidate slug",
      ["errandState", "value", "materializable", "candidates"],
      [{
        slug: "",
        claimId: "a".repeat(32),
        branch: "chore/test",
        expectedHead: "b".repeat(40),
        state: "paused",
        originEntry: null,
      }],
      "errandState.value.materializable.candidates.0.slug",
    ],
    [
      "errand candidate branch",
      ["errandState", "value", "materializable", "candidates"],
      [{
        slug: "entry",
        claimId: "a".repeat(32),
        branch: "",
        expectedHead: "b".repeat(40),
        state: "paused",
        originEntry: null,
      }],
      "errandState.value.materializable.candidates.0.branch",
    ],
  ] as Array<readonly [string, MutationPath, unknown, string]>)(
    "rejects the errand routing field: %s",
    (_label, path, replacement, expectedPath) => {
      const value = fixture("orient");
      setPath(value, path, replacement);
      expectContractFailure(value, expectedPath);
    },
  );

  it.each(["orient", "active-resume", "current-husk", "branch-gone", "identity-missing"])(
    "accepts the %s characterization fixture",
    (name) => expect(SessionInitProbeResultSchema.parse(fixture(name))).toEqual(fixture(name)),
  );

  it.each([
    "mode",
    "identity",
    "derivedLocusState",
    "locusGuidance",
    "user",
    "worktree",
    "baseDistance",
    "baseBranchSync",
    "dirty",
    "extensions",
    "config",
    "active",
    "domainRules",
    "releaseRouting",
    "loadSet",
    "recommendedCombinedPrompt",
  ])("requires the unconditional %s slot", (key) => {
    expectInvalid(withoutKey(fixture("orient"), key));
  });

  it("rejects malformed derived entering-checkout routing fields", () => {
    const badSelector = fixture("orient");
    setPath(badSelector, ["derivedLocusState", "value", "entering", "kind"], "ambiguous");
    expectContractFailure(badSelector, "derivedLocusState.value.entering.kind");

    const badRow = fixture("orient");
    setPath(badRow, ["derivedLocusState", "value", "roster", 0, "kind"], "legacy-record");
    expectContractFailure(badRow, "derivedLocusState.value.roster.0.kind");
  });

  it("rejects undeclared top-level keys and malformed probe branches", () => {
    expectInvalid({ ...fixture("orient"), undeclared: true });
    expectInvalid({
      ...fixture("orient"),
      dirty: {
        ok: true,
        value: { state: "clean" },
        error: { kind: "runtime", message: "mixed" },
      },
    });
  });

  it("enforces roster, recovery, and primary sweep gates", () => {
    const branchGone = fixture("branch-gone");
    delete branchGone.roster;
    expectInvalid(branchGone);

    const linkedResume = fixture("active-resume");
    linkedResume.roster = fixture("orient").roster;
    expectInvalid(linkedResume);

    const missingRecovery = fixture("branch-gone");
    delete missingRecovery.recovery;
    expectInvalid(missingRecovery);
    expectInvalid({
      ...fixture("orient"),
      recovery: fixture("branch-gone").recovery,
    });

    const missingSweep = fixture("orient");
    delete missingSweep.sweep;
    expectInvalid(missingSweep);
  });

  it("requires current-husk at a linked branchless locus and forbids it elsewhere", () => {
    // An eligible locus always emits the slot, so omission there would report a failed
    // probe as an inapplicable locus rather than as the degraded slot it is.
    const omitted = fixture("current-husk");
    delete omitted.currentHusk;
    expectInvalid(omitted);

    expectInvalid({
      ...fixture("orient"),
      currentHusk: fixture("current-husk").currentHusk,
    });
    const failed = {
      ...fixture("current-husk"),
      currentHusk: {
        ok: false,
        error: { kind: "runtime", message: "degraded" },
      },
    };
    expect(SessionInitProbeResultSchema.safeParse(failed).success).toBe(true);
    expectInvalid({ ...fixture("orient"), currentHusk: failed.currentHusk });
  });

  it("enforces orphan and identity-scoped advisory presence", () => {
    const missingOrphan = fixture("active-resume");
    delete missingOrphan.orphanBranchSweep;
    expectInvalid(missingOrphan);

    const identityAbsentLinked = fixture("identity-missing");
    const linkedWorktree = identityAbsentLinked.worktree as {
      value: { identity: { kind: string; path?: string } };
    };
    linkedWorktree.value.identity = { kind: "linked", path: "/linked" };
    expectInvalid(identityAbsentLinked);

    const identityScoped = ["retiredSubdirs", "errandSweep", "inboxState", "partialPushMarker"];
    for (const key of identityScoped) {
      expectInvalid(withoutKey(fixture("orient"), key));

      const impossible = fixture("identity-missing");
      impossible[key] = fixture("orient")[key];
      expectInvalid(impossible);
    }
  });

  it("enforces derived errand, work-unit, and materialization slots", () => {
    const missingErrand = fixture("active-resume");
    delete missingErrand.errandState;
    expectInvalid(missingErrand);

    expectInvalid({
      ...fixture("active-resume"),
      workUnitState: fixture("orient").workUnitState,
    });
    const missingWorkUnit = fixture("orient");
    delete missingWorkUnit.workUnitState;
    expectInvalid(missingWorkUnit);

    expectInvalid({
      ...fixture("active-resume"),
      materializableWorkUnits: fixture("orient").materializableWorkUnits,
    });
    const missingMaterialization = fixture("orient");
    delete missingMaterialization.materializableWorkUnits;
    expectInvalid(missingMaterialization);
  });

  it("keeps one-way advisories optional while rejecting impossible presence", () => {
    const orient = fixture("orient");
    delete orient.compactionAdvisory;
    delete orient.inFlightComposition;
    expect(SessionInitProbeResultSchema.safeParse(orient).success).toBe(true);

    expectInvalid({
      ...fixture("identity-missing"),
      compactionAdvisory: fixture("orient").compactionAdvisory,
    });
    expectInvalid({
      ...fixture("active-resume"),
      inFlightComposition: fixture("orient").inFlightComposition,
    });
  });

  it("enforces cohort and task-cursor visible gates", () => {
    expectInvalid({
      ...fixture("orient"),
      cohortDocPath: ".arc/backlog/planned/x/cohort-x.md",
    });

    const cursorMissing = fixture("active-resume");
    delete cursorMissing.taskCursor;
    expectInvalid(cursorMissing);
    expectInvalid({
      ...fixture("orient"),
      taskCursor: fixture("active-resume").taskCursor,
    });

    const unsafe = clone(fixture("active-resume"));
    const active = unsafe.active as { value: { taskListPath: string } };
    active.value.taskListPath = "../tasks.md";
    expectInvalid(unsafe);
  });

  it("validates but never requires the invocation-only seed-write status", () => {
    const omitted = fixture("orient");
    delete omitted.compactionSeedWrite;
    expect(SessionInitProbeResultSchema.safeParse(omitted).success).toBe(true);
    expect(
      SessionInitProbeResultSchema.safeParse({
        ...omitted,
        compactionSeedWrite: {
          status: "skipped",
          reason: "identity-missing",
        },
      }).success,
    ).toBe(true);
    expect(
      SessionInitProbeResultSchema.safeParse({
        ...omitted,
        compactionSeedWrite: {
          status: "failed",
          reason: "seed-invalid",
          message: "invalid",
        },
      }).success,
    ).toBe(true);
    expectInvalid({
      ...fixture("orient"),
      compactionSeedWrite: { status: "written", path: "" },
    });
    expectInvalid({
      ...fixture("orient"),
      compactionSeedWrite: {
        status: "failed",
        reason: "unknown",
        message: "bad",
      },
    });
  });
});
