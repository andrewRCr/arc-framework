/** Work-unit resumes compile context and stop at the appropriate session boundary. */
import { describe, expect, it } from "vitest";
import { createAgendaFixtureInput, frameWithRow, workUnitRow } from "../../helpers/agenda-fixtures.js";
import { activeSessionInit, baseDistance, baseBranchSync, errandStateResult, workUnitStateResult, cleanCurrentWuReconcile, derivedFrameFromActive, configSessionInit, dirtyState, domainRulesSessionInit, sessionInitFixture, userSessionInit, worktreeSync, type SessionInitProbeOverrides } from "../../helpers/session-init-fixtures.js";
import { runErrandStalenessSweep } from "../../../src/lib/session-init/errand-staleness-sweep.js";
import { projectRenameMoveRemedy } from "../../../src/lib/session-init/lifecycle-residue-sweep.js";
import { missingRegistrationActions } from "../../../src/lib/session-init/missing-worktree-folders.js";
import { StaleWorktreeSweepResultSchema } from "../../../src/lib/session-init/stale-worktree-sweep-schema.js";
import { SlugSchema } from "../../../src/lib/kernel/index.js";
import { describeStorePull } from "../../../src/lib/session-init/store-user-pull.js";
import { projectUserReferenceSessionResult } from "../../../src/lib/user-reference-reconcile.js";
import { runHooksPathSessionAdvisory } from "../../../src/lib/session-init/hooks-path-advisory.js";
import { makeMetaFixture } from "../../helpers/meta-fixture.js";
import { resolveTaskListCursor } from "../../../src/lib/task-list/cursor.js";
import { compileSessionInitAgenda } from "../../../src/commands/agenda/compile.js";
import { assertSessionInitAgenda, type AgendaSignals, type SessionInitAgenda } from "../../../src/commands/agenda/schema.js";
import type { AgendaCompileInput } from "../../../src/commands/agenda/compile-input.js";
import { writeMetaSessionContext, writeMetaStateAtHandoff } from "../../../src/lib/store/kinds/meta/writers.js";
import { createReferenceFixture } from "../../helpers/store/reference-fixture.js";
import { seed, success, update } from "../../helpers/store/suite-tools.js";
import { OwnerIdentitySchema, recordReferences } from "../../../src/lib/store/identity.js";
import { ENTRY_CONFIGS } from "../../../src/lib/store/kinds/entry-configs.js";
import { PRODUCTION_REGISTRATIONS } from "../../../src/lib/store/kinds/registrations.js";
import { createKindRegistry } from "../../../src/lib/store/registry.js";
import { setMetaBulletFields } from "../../../src/lib/active/meta-reader.js";

async function input(probes: SessionInitProbeOverrides = {}, signals: AgendaSignals = {}, stateOffBranch = false): Promise<AgendaCompileInput> {
  const active = activeSessionInit({ resolution: "single", path: ".arc/active/meta-work.md", sessionType: "execution", taskListPath: ".arc/active/tasks-work.md" });
  const envelope = await sessionInitFixture({
    active: async () => active,
    ...(stateOffBranch ? { derivedLocusState: async () => derivedFrameFromActive(active, "andrew", null, { status: "no-open-task" }, null, true) } : {}),
    taskCursor: async () => resolveTaskListCursor("# Tasks\n\n## **Phase 1:** Work\n\n### `[ ]` **1.1 Implement behavior**\n"),
    worktree: async () => worktreeSync({ branch: "feat/work" }), ...probes,
  }, { stateOffBranch });
  return createAgendaFixtureInput(envelope, { signals, read: {
    exists: async () => true, size: async () => 1000,
    read: async path => path.endsWith("SESSION-NOTES.md") ? "**Commit at Handoff:** aaaaaaa\n" : makeMetaFixture("work", { currentWorkflow: "process-task-loop" }),
    git: async args => { if (args[0] === "rev-parse") return "a".repeat(40); throw new Error("Unexpected Git read"); },
  } });
}
async function compile(value: AgendaCompileInput): Promise<SessionInitAgenda> {
  const result = await compileSessionInitAgenda(value);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw new Error("Expected a compiled resume");
  assertSessionInitAgenda(result.agenda);
  return result.agenda;
}

describe("agenda work-unit resume", () => {
  it("compiles context, unchanged residuals and a bare-clean proceed gate under next", async () => {
    const value = await input({}, { next: true });
    const agenda = await compile(value);
    expect(agenda.orientation).toEqual({ shape: "work-state" });
    expect(agenda.residual).toEqual({ config: value.envelope.config, releaseRouting: value.envelope.releaseRouting,
      domainRules: value.envelope.domainRules, inboxState: value.envelope.inboxState });
    expect(agenda.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "read", path: ".arc/active/meta-work.md" }),
      expect.objectContaining({ type: "read", path: ".arc/active/tasks-work.md", cursor: expect.any(Object) }),
      { type: "render", surface: "header", text: "**ARC session initialized** · `feat/work` · clean" },
    ]));
    expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "proceed", autoProceed: true });
  });

  it("withholds automatic proceed for a pending projected blocker in a clean checkout", async () => {
    const value = await input({}, { next: true }, true);
    const f = createReferenceFixture(ENTRY_CONFIGS, createKindRegistry(PRODUCTION_REGISTRATIONS));
    const reference = recordReferences["work-item/meta"](OwnerIdentitySchema.parse({ type: "work-item", name: "work" }));
    const saved = writeMetaSessionContext(makeMetaFixture("work", { currentWorkflow: "process-task-loop" }), "Resume the parser.");
    const record = await seed(f, reference, saved);
    const baseline = success(await f.store.version());
    const anchored = writeMetaStateAtHandoff(saved, baseline);
    success(await f.store.write({ ...update(f, record, anchored), provenance: { verb: "handoff-write", lifecycleAction: "handoff" } }));
    value.entry.store = f.store;
    value.read.read = async () => anchored;
    expect((await compile(value)).steps.at(-1)).toEqual({ type: "gate", kind: "proceed", autoProceed: true });

    value.read.read = async path => path === ".arc/active/meta-work.md"
      ? setMetaBulletFields(anchored, { Blockers: "Waiting for an answer" }) : anchored;
    expect((await compile(value)).steps.at(-1)).toEqual({ type: "gate", kind: "proceed", autoProceed: false });
  });

  it.each(["partialPushMarker", "compactionAdvisory", "retiredSubdirs"] as const)("auto-proceeds on a clean --next resume when %s fails", async slot => {
    const agenda = await compile(await input({
      [slot]: async () => { throw new Error("Retired notes probe failed"); },
    }, { next: true }));
    expect(agenda.steps.filter(step => step.type === "gate" || (step.type === "render" && step.surface === "degraded-slot")))
      .toEqual([{ type: "gate", kind: "proceed", autoProceed: true }]);
  });

  it.each(["no-next", "dirty", "freshness", "blockers", "seed", "offer", "domain-warning", "degraded"] as const)("withholds automatic proceed for %s", async cause => {
      const probes: SessionInitProbeOverrides = {};
      if (cause === "dirty") probes.dirty = async () => dirtyState({ state: "dirty", fileCount: 2 });
      if (cause === "offer") probes.worktree = async () => worktreeSync({ branch: "feat/work", state: "remote-ahead", behind: 2 });
      if (cause === "domain-warning") probes.domainRules = async () => domainRulesSessionInit({ warnings: ["Rule warning", "Other warning"] });
      if (cause === "degraded") probes.worktree = async () => { throw new Error("Worktree probe failed"); };
      const value = await input(probes, cause === "no-next" ? {} : { next: true, ...(cause === "seed" ? { seed: "new concern" } : {}) });
      if (cause === "freshness" || cause === "blockers") value.read.read = async path => path.endsWith("SESSION-NOTES.md")
        ? cause === "freshness" ? "" : "**Commit at Handoff:** aaaaaaa\n"
        : makeMetaFixture("work", { currentWorkflow: "process-task-loop", blockers: cause === "blockers" ? "Waiting for an answer" : null });
      const agenda = await compile(value);
      expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "proceed", autoProceed: false });
      if (cause === "domain-warning") expect(agenda.steps.filter(step => step.type === "note" && step.surface === "domain-rules"))
        .toEqual([{ type: "note", surface: "domain-rules", text: "Rule warning" }, { type: "note", surface: "domain-rules", text: "Other warning" }]);
      if (cause === "degraded") expect(agenda.steps).toEqual(expect.arrayContaining([
        { type: "render", surface: "degraded-slot", text: expect.stringContaining("worktree unavailable (runtime): Worktree probe failed") },
      ]));
      if (cause === "dirty") expect(agenda.steps).toEqual(expect.arrayContaining([
        { type: "render", surface: "header", text: "**ARC session initialized** · `feat/work` · uncommitted changes" },
      ]));
      if (cause === "seed") expect(agenda.steps).toEqual(expect.arrayContaining([
        { type: "note", surface: "unconsumed-signal", text: expect.stringContaining("new worktree") },
      ]));
    });

  it("permits the answered note beside the header for automatic proceed", async () => {
    const value = await input({}, { next: true });
    value.answers.answered["old:pick"] = "decline";
    const agenda = await compile(value);
    expect(agenda.steps).toEqual(expect.arrayContaining([expect.objectContaining({ type: "note", surface: "answered" })]));
    expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "proceed", autoProceed: true });
  });

  it("names a linked checkout in the header and omits primary-only residual state", async () => {
    const row = workUnitRow();
    const value = await input({ derivedLocusState: async () => frameWithRow({ ...row, checkout: { ...row.checkout, primary: false, path: "/linked" } }),
      worktreeIdentity: async () => ({ kind: "linked", path: "/linked" }) });
    const agenda = await compile(value);
    expect(agenda.steps).toEqual(expect.arrayContaining([{ type: "render", surface: "header",
      text: "**ARC session initialized** · `feat/work` · `worktree: /linked` · clean" }]));
    expect(agenda.residual).not.toHaveProperty("inboxState");
  });

  it("orders delivery, locus, degraded probes and published guidance while keeping remedies as text", async () => {
    const references = projectUserReferenceSessionResult({ status: "ready", ref: "main", remoteEvidence: "exact",
      transitions: [{ subject: "origin", outcome: { kind: "decompose" } }],
    }, { userInbox: { path: "USER-INBOX.md", content: "# User Inbox\n\n## Work Unit\n\n### `[ ]` **Concern**\n\n- _WU_Target:_ `origin`\n" } });
    expect(references.recommendedAction).toBe("surface");
    const row = workUnitRow();
    const value = await input({ derivedLocusState: async () => frameWithRow({ ...row, diagnostics: [{ code: "context-unavailable", message: "Inspect a local concern" }] }),
      deliveryPosition: async (_remote, { workUnitId }) => ({ planId: "123e4567-e89b-42d3-a456-426614174000", workUnitId: SlugSchema.parse(workUnitId),
        landedCount: 1, totalCount: 2, activeOperation: null, line: "Delivery position: 1/2 landed; active operation: none." }),
      worktree: async () => { throw new Error("Worktree probe failed"); },
      currentWuReconcile: async params => ({ ...await cleanCurrentWuReconcile(params), status: "pending",
        dependency: { before: ["old"], after: ["new"], replacements: [], drops: [], discharged: [], live: [], conflicts: [] },
        actions: [{ text: "arc wu reconcile work --json", argv: ["arc", "wu", "reconcile", "work", "--json"] },
          { text: "arc wu reconcile work --apply --json", argv: ["arc", "wu", "reconcile", "work", "--apply", "--json"], checkout: "/repo" }],
        recommendedAction: "surface", recommendedCommand: ["arc", "wu", "reconcile", "work", "--apply", "--json"],
        recommendedPromptText: "Review the pending tracked reconcile." }),
      userReferenceReconcile: async () => references,
      hooksPath: async () => runHooksPathSessionAdvisory({ cwd: "/repo", exec: async () => ({ stdout: "/missing" }), pathExists: () => false }),
    });
    const agenda = await compile(value);
    const surfaces = agenda.steps.filter(step => step.type === "render" || step.type === "note");
    expect(surfaces.map(step => step.surface)).toEqual(["header", "delivery-position", "locus", "degraded-slot", "current-wu-reconcile", "user-references", "hooks-path"]);
    expect(surfaces.find(step => step.surface === "delivery-position")?.text).toBe("Delivery position: 1/2 landed; active operation: none.");
    expect(surfaces.find(step => step.surface === "current-wu-reconcile")?.text).toContain("Review the pending tracked reconcile.");
    expect(surfaces.find(step => step.surface === "current-wu-reconcile")?.text).toContain("arc wu reconcile work --apply --json");
    expect(surfaces.find(step => step.surface === "user-references")?.text).toContain(references.recommendedPromptText);
    expect(surfaces.find(step => step.surface === "user-references")?.text).toContain("arc user reconcile-references --json");
    const hooks = value.envelope.hooksPath;
    if (!hooks?.ok || hooks.value.recommendedAction !== "surface") throw new Error("Expected hooks advisory");
    expect(surfaces.find(step => step.surface === "hooks-path")?.text).toBe(hooks.value.recommendedPromptText);
    expect(agenda.steps.some(step => step.type === "exec" || step.type === "offer")).toBe(false);
  });

  it("omits a successful null delivery position", async () => {
    const agenda = await compile(await input({ deliveryPosition: async () => null }));
    expect(agenda.steps).not.toEqual(expect.arrayContaining([expect.objectContaining({ surface: "delivery-position" })]));
  });

  it.each(["pulled", "noop", "no-remote"] as const)("renders a %s store pull with its notice and command as text", async status => {
    const pull = describeStorePull({ status, advisories: [{ condition: "A remote move remains unfinished.",
      remedy: { text: "Finish the move.", argv: ["arc", "store", "migrate"] } }] });
    const agenda = await compile(await input({ user: async () => pull }, {}, true));
    expect(agenda.steps).toEqual(expect.arrayContaining([{ type: "note", surface: "store-sync", text: expect.stringContaining(pull.summary) }]));
    const notice = agenda.steps.find(step => step.type === "note" && step.surface === "store-sync");
    expect(notice).toMatchObject({ text: expect.stringContaining("Finish the move.") });
    expect(agenda.steps.some(step => step.type === "exec" || step.type === "offer")).toBe(false);
  });

  it.each(["noop", "no-remote"] as const)("leaves a quiet %s store pull out", async status => {
    const agenda = await compile(await input({ user: async () => describeStorePull({ status }) }, {}, true));
    expect(agenda.steps).not.toEqual(expect.arrayContaining([expect.objectContaining({ surface: "store-sync" })]));
  });

  it.each(["user", "worktree", "baseBranchSync", "userReferenceReconcile", "currentWuReconcile", "sweep", "orphanBranchSweep", "errandSweep"] as const)("isolates a failed %s slot while healthy synchronization remains available", async name => {
    const fail = async (): Promise<never> => { throw new Error(`${name} probe failed`); };
    const value = await input({ worktree: async () => worktreeSync({ branch: "feat/work", state: "remote-ahead", behind: 2 }),
      baseBranchSync: async () => baseBranchSync({ state: "remote-ahead", behind: 3 }), [name]: fail });
    const agenda = await compile(value);
    expect(agenda.steps).toEqual(expect.arrayContaining([{ type: "render", surface: "degraded-slot", text: expect.stringContaining(`${name} unavailable (runtime): ${name} probe failed`) }]));
    expect(agenda.steps.some(step => step.type === "offer")).toBe(true);
    expect(agenda.steps.some(step => step.type === "exec")).toBe(false);
    expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "proceed", autoProceed: false });
  });

  it("does not surface dormant slots that the resume never consumes", async () => {
    const fail = async (): Promise<never> => { throw new Error("Dormant projection unavailable"); };
    const agenda = await compile(await input({ pausedWork: fail, inboundBackPressure: fail }, { next: true }));
    expect(agenda.steps).not.toEqual(expect.arrayContaining([expect.objectContaining({ surface: "degraded-slot" })]));
    expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "proceed", autoProceed: true });
  });

  it("includes checkout-local attention in the shared ordered resume assembly", async () => {
    const agenda = await compile(await input({ worktree: async () => worktreeSync({ state: "diverged", branch: "feat/work", ahead: 2, behind: 3 }),
      dirty: async () => dirtyState({ state: "dirty", fileCount: 2 }) }));
    const surfaces = agenda.steps.filter(step => step.type === "render");
    expect(surfaces.map(step => step.surface)).toEqual(["header", "worktree-diverged", "dirty"]);
    expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "proceed", autoProceed: false });
  });

  it("assembles cleanup attention as standing offers before the proceed gate", async () => {
    const sweep = StaleWorktreeSweepResultSchema.parse({ remoteEvidence: "exact", missingFolders: [], renameMoves: [], retirements: [], warnings: [],
      worktrees: [{ kind: "branched", branch: "feat/ended", worktreePath: "/repo/ended", decision: { action: "removable" },
        teardown: { text: "arc teardown ended", argv: ["arc", "teardown", "ended"] } }],
    });
    const agenda = await compile(await input({ sweep: async () => sweep }, { next: true }));
    expect(agenda.steps.filter(step => step.type === "render").map(step => step.surface)).toEqual(["header", "stale-worktrees"]);
    const offer = agenda.steps.find(step => step.type === "offer");
    expect(offer).toMatchObject({ ask: "orientation", choices: [{ kind: "actions", accepts: [], then: { kind: "recompile",
      argv: ["arc", "agenda", "session-init", "--json"] } }] });
    expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "proceed", autoProceed: false });
  });

  it("orders simultaneous checkout, cleanup and reminder surfaces, rendering none of the notes slots", async () => {
    const config = configSessionInit();
    config.settings["session.init_pull.base"] = "manual";
    const moving = { path: "/repo/old-name", head: "a".repeat(40), branch: "feat/new-name", detached: false, primary: false, folderPresent: true };
    const move = projectRenameMoveRemedy(moving, { kind: "present", marker: { spawnedByArc: true, wuName: "new-name",
      createdFor: { kind: "work-unit", name: "new-name" }, spawningIdentity: "andrew", createdAt: "2026-06-01T00:00:00Z",
      renameMovePending: { oldSlug: "old-name", newSlug: "new-name", branch: moving.branch, head: moving.head, from: moving.path, to: "/repo/new-name" },
    } }, [moving]);
    if (move === null) throw new Error("Expected a rename fixture");
    const sweep = StaleWorktreeSweepResultSchema.parse({ remoteEvidence: "exact", warnings: [], renameMoves: [move],
      retirements: [{ status: "blocked", worktreePath: "/repo/retired", subject: { slug: "retired", branch: "feat/retired" }, reason: "uncommitted" }],
      worktrees: [{ kind: "branched", branch: "feat/ended", worktreePath: "/repo/ended", decision: { action: "removable" },
        teardown: { text: "arc teardown ended", argv: ["arc", "teardown", "ended"] } }],
      missingFolders: [{ worktreePath: "/repo/gone", branch: "feat/gone", outcome: "missing", actions: missingRegistrationActions("/repo/gone", { lock: undefined, workUnitName: "gone" }) }],
    });
    const nudge = { shouldNudge: true, markerPath: ".arc/user/andrew/.internal/reminder", today: "2026-06-01" };
    const agenda = await compile(await input({ config: async () => config,
      worktree: async () => worktreeSync({ branch: "feat/work", state: "diverged", ahead: 1, behind: 2 }),
      dirty: async () => dirtyState({ state: "dirty", fileCount: 2 }),
      baseDistance: async () => baseDistance({ verdict: "reconcile", state: "diverged", ahead: 1, behind: 2, register: { kind: "calm", text: "Base changed." } }),
      baseBranchSync: async () => baseBranchSync({ state: "remote-ahead", behind: 2 }),
      hooksPath: async () => runHooksPathSessionAdvisory({ cwd: "/repo", exec: async () => ({ stdout: "/missing" }), pathExists: () => false }),
      partialPushMarker: async () => ({ markers: [{ machineId: "sibling", lastAttemptedCommit: "b".repeat(40), attemptTimestamp: "2026-06-01T00:00:00Z" }] }),
      compactionAdvisory: async () => ({ historyCommitCount: 501, threshold: 500, shouldSuggest: true, nudge: { ...nudge, markerPath: ".arc/user/andrew/.internal/compact" } }),
      user: async () => userSessionInit({ state: "conflict", refState: "diverged", contentRelation: "conflicting", summary: "Contested notes", detailLines: ["Inspect both entries."] }),
      sweep: async () => sweep,
      orphanBranchSweep: async () => ({ remoteEvidence: "exact", orphans: [{ branch: "fix/merged", merged: true, shippedWorkUnit: null,
        actions: [{ text: "git branch -D fix/merged", argv: ["git", "branch", "-D", "fix/merged"] }] }] }),
      retiredSubdirs: async () => ({ candidates: [SlugSchema.parse("shipped")] }),
      errandSweep: async () => runErrandStalenessSweep({ entries: [{ key: "captured concern", created: "2026-05-01" }], thresholdDays: 1, now: "2026-06-01T00:00:00Z" }),
      errandState: async () => errandStateResult({ nudge }),
      workUnitState: async () => workUnitStateResult({ inFlight: { workUnits: [{ name: "other", branch: "feat/other", state: "stale", ageDays: 4,
        behindBase: { status: "known", value: false, remoteEvidence: "exact" } }] }, nudge: { ...nudge, markerPath: ".arc/user/andrew/.internal/wu-reminder" } }),
    }, { next: true }));
    const surfaces = agenda.steps.filter(step => step.type === "render" || step.type === "note");
    expect(surfaces.map(step => step.surface)).toEqual(["header", "worktree-diverged", "base-drift", "stale-base", "hooks-path",
      "dirty", "retirements", "rename-moves", "stale-worktrees", "missing-folders", "branch-orphans", "reminder", "in-flight-work-units"]);
    expect(surfaces.flatMap(step => step.type === "render" && step.marker ? [step.marker.path] : [])).toEqual([
      ".arc/user/andrew/.internal/reminder", ".arc/user/andrew/.internal/wu-reminder",
    ]);
    expect(agenda.steps.at(-1)).toEqual({ type: "gate", kind: "proceed", autoProceed: false });
  });

  it("keeps populated dormant store surfaces and unrelated warnings out of resume orientation", async () => {
    const baseline = await compile(await input({ user: async () => describeStorePull({ status: "noop" }) }, {}, true));
    const agenda = await compile(await input({ user: async () => describeStorePull({ status: "noop" }),
      pausedWork: async () => ({ items: [{ slug: SlugSchema.parse("paused"), open: false, reason: "Wait for prerequisite",
        waitsOn: { kind: "work-unit", slug: SlugSchema.parse("prerequisite") }, marks: ["resumable"],
        actions: [{ text: "arc resume paused", argv: ["arc", "resume", "paused"] }] }] }),
      inboundBackPressure: async () => ({ pendingCount: 11, oldestAgeDays: 31, countThreshold: 10, ageThresholdDays: 30,
        actions: [{ text: "Owner 'andrew' should re-triage inbound work with arc inbox work." }] }),
      errandState: async () => errandStateResult({ residue: [{ branch: "chore/leftover", slug: "leftover", reason: "no-record-or-meta" }], warnings: ["Errand warning"] }),
      workUnitState: async () => workUnitStateResult({ warnings: ["Work-unit warning"] }),
      sweep: async () => StaleWorktreeSweepResultSchema.parse({ remoteEvidence: "exact", warnings: ["Cleanup warning"], worktrees: [], missingFolders: [], renameMoves: [], retirements: [] }),
    }, {}, true));
    expect(agenda.steps.filter(step => step.type === "render" || step.type === "note")).toEqual(
      baseline.steps.filter(step => step.type === "render" || step.type === "note"));
  });
});
