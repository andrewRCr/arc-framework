/** Session advisories preserve rate limits and keep lifecycle commands as text. */
import { describe, expect, it } from "vitest";
import { createAgendaFixtureInput, baseFrame, selectedRow, frameWithRow, workUnitRow } from "../../helpers/agenda-fixtures.js";
import { activeSessionInit, errandStateResult, workUnitStateResult, rosterResult, worktreeSync, sessionInitFixture, type SessionInitProbeOverrides } from "../../helpers/session-init-fixtures.js";
import { TransientIdentityRecordSchema, projectLocusIdentity } from "../../../src/lib/errand/identity-record.js";
import { runErrandState } from "../../../src/lib/session-init/errand-state.js";
import { classifyInFlightErrands } from "../../../src/lib/session-init/in-flight-errand-sweep.js";
import { composeMergeabilityGuidance } from "../../../src/lib/session-init/recommended-action.js";
import { InFlightWorkUnitReportSchema } from "../../../src/lib/session-init/work-unit-state-schema.js";
import { runErrandStalenessSweep } from "../../../src/lib/session-init/errand-staleness-sweep.js";
import { compileAdvisoryOrientation } from "../../../src/commands/agenda/advisories.js";
import { orderOrientationSurfaces } from "../../../src/commands/agenda/orientation.js";

async function input(probes: SessionInitProbeOverrides = {}) {
  return createAgendaFixtureInput(await sessionInitFixture({ active: async () => activeSessionInit({ resolution: "single",
    path: ".arc/active/meta-work.md", sessionType: "execution" }), ...probes }));
}
const stale = runErrandStalenessSweep({ entries: [{ key: "captured concern", created: "2026-05-01" }],
  thresholdDays: 1, now: "2026-06-01T00:00:00Z" });
const nudge = { shouldNudge: true, markerPath: ".arc/user/andrew/.internal/reminder", today: "2026-06-01" };

describe("agenda primary reminder", () => {
  it("renders flagged captures with the exact once-per-day marker", async () => {
    const value = await input({ errandSweep: async () => stale, errandState: async () => errandStateResult({ nudge }) });
    expect(orderOrientationSurfaces(compileAdvisoryOrientation(value))).toEqual([{ type: "render", surface: "reminder",
      text: "**Reminder:** 1 flagged capture(s) pending past the reminder threshold — drain via `arc-housekeep`:\n- `captured concern` — created 2026-05-01 (31d ago)",
      marker: { path: nudge.markerPath, value: nudge.today } }]);
  });
});


const inFlightNudge = { ...nudge, markerPath: ".arc/user/andrew/.internal/work-unit-reminder" };
const guidance = composeMergeabilityGuidance({ status: "unavailable", remoteEvidence: "unreachable", failureReason: "auth" });
function inFlightReport(state: "awaiting-review" | "stale" | "blocked" | "mergeable" | "merged-needs-archival" | "mergeability-unavailable") {
  const actions = state === "mergeable" ? [{ text: "Merge base `main` into `feat/other` first. Complete the integration workflow for `other`." }]
    : state === "merged-needs-archival" ? [{ text: "Archive work unit `other` after its merged pull request." }]
      : state === "mergeability-unavailable" ? [{ text: guidance }]
        : state === "blocked" ? [{ text: "The owner of `other` must address its pull request's requested changes or failing checks." }]
          : state === "stale" ? [{ text: "Nudge the owner about review of `other` (`feat/other`, 4d), once today." }] : undefined;
  return InFlightWorkUnitReportSchema.parse({ name: "other", branch: "feat/other", ageDays: 4, state, actions,
    behindBase: state === "mergeability-unavailable" ? { status: "unavailable", remoteEvidence: "unreachable", failureReason: "auth" }
      : { status: "known", value: state === "mergeable", remoteEvidence: "exact" },
    ...(state === "mergeability-unavailable" ? { mergeabilityGuidance: guidance } : {}),
  });
}

describe("agenda work units in flight", () => {
  it.each(["awaiting-review", "stale", "blocked", "mergeable", "merged-needs-archival", "mergeability-unavailable"] as const)(
    "renders %s guidance without offering lifecycle actions", async state => {
      const report = inFlightReport(state);
      const value = await input({ workUnitState: async () => workUnitStateResult({ inFlight: { workUnits: [report] }, nudge: inFlightNudge }) });
      const steps = orderOrientationSurfaces(compileAdvisoryOrientation(value));
      expect(steps).toEqual([expect.objectContaining({ type: "render", surface: "in-flight-work-units",
        text: expect.stringContaining(`- \`feat/other\` — ${state} (4d)`) })]);
      if (state === "stale") expect(steps[0]).toMatchObject({ marker: { path: inFlightNudge.markerPath, value: inFlightNudge.today } });
      else expect(steps[0]).not.toHaveProperty("marker");
      for (const action of report.actions ?? []) expect(steps[0]).toMatchObject({ text: expect.stringContaining(action.text) });
      if (state === "mergeable") expect(steps[0]).toMatchObject({ text: expect.stringContaining("merge the base in first") });
      if (state === "merged-needs-archival") expect(steps[0]).toMatchObject({ text: expect.stringContaining("archive it") });
    });
});


async function workload(classes: string[]) {
  const envelope = await sessionInitFixture({ roster: async () => rosterResult({ entries: classes.map((cls, index) => ({
    worktreePath: `/repo/other-${index}`, branch: `feat/other-${index}`, metaFilePath: `.arc/active/meta-other-${index}.md`, class: cls,
  })) }) });
  return createAgendaFixtureInput(envelope);
}

describe("agenda concurrent workload", () => {
  it.each([
    { classes: ["Heavy", "Light"], counts: "1 Heavy" },
    { classes: ["Novel", "Light"], counts: "1 Novel" },
    { classes: ["Heavy", "Novel"], counts: "1 Novel / 1 Heavy" },
  ])("renders $counts and omits zero classes", async ({ classes, counts }) => {
    const value = await workload(classes);
    expect(orderOrientationSurfaces(compileAdvisoryOrientation(value, { concurrentWorkload: true }))).toEqual([
      { type: "note", surface: "concurrent-workload", text: `**Concurrent workload:** heavier work is already in flight (${counts}). ARC scales concurrency to the attention you can give it — consider a lighter next pick, or take on more heavier work deliberately.` },
    ]);
  });
});


describe("agenda advisory suppression", () => {
  it("omits already-nudged captures", async () => {
    const value = await input({ errandSweep: async () => stale, errandState: async () => errandStateResult({ nudge: { ...nudge, shouldNudge: false } }) });
    expect(orderOrientationSurfaces(compileAdvisoryOrientation(value))).toEqual([]);
  });

  it("omits an empty capture list without attaching a marker", async () => {
    const value = await input({ errandState: async () => errandStateResult({ nudge }) });
    expect(orderOrientationSurfaces(compileAdvisoryOrientation(value))).toEqual([]);
  });

  it("omits primary reminders on a linked checkout", async () => {
    const original = workUnitRow();
    const row = { ...original, checkout: { ...original.checkout, primary: false, path: "/repo/work" } };
    const value = await input({ derivedLocusState: async () => frameWithRow(row),
      worktree: async () => worktreeSync({ branch: "feat/work" }), worktreeIdentity: async () => ({ kind: "linked", path: "/repo/work" }),
      errandSweep: async () => stale, errandState: async () => errandStateResult({ nudge }) });
    expect(value.envelope).not.toHaveProperty("errandSweep");
    expect(orderOrientationSurfaces(compileAdvisoryOrientation(value))).toEqual([]);
  });

  it.each([false, true])("omits stale work units after the nudge, with another visible entry %s", async another => {
    const reports = [inFlightReport("stale"), ...(another ? [inFlightReport("awaiting-review")] : [])];
    const value = await input({ workUnitState: async () => workUnitStateResult({ inFlight: { workUnits: reports }, nudge: { ...inFlightNudge, shouldNudge: false } }) });
    const steps = orderOrientationSurfaces(compileAdvisoryOrientation(value));
    if (!another) expect(steps).toEqual([]);
    else {
      expect(steps).toEqual([expect.objectContaining({ surface: "in-flight-work-units", text: expect.stringContaining("awaiting-review") })]);
      expect(steps[0]).not.toHaveProperty("marker");
      expect(steps[0]).toMatchObject({ text: expect.not.stringContaining("— stale") });
    }
  });

  it.each([{ classes: [] }, { classes: ["Light"] }])("omits absent or all-light workload $classes", async ({ classes }) => {
    expect(orderOrientationSurfaces(compileAdvisoryOrientation(await workload(classes), { concurrentWorkload: true }))).toEqual([]);
  });

  it("leaves workload out when the caller is not orienting discovery", async () => {
    expect(orderOrientationSurfaces(compileAdvisoryOrientation(await workload(["Heavy"])))).toEqual([]);
  });

  it("carries no workload slot on a work-unit resume", async () => {
    const value = await input({ roster: async () => rosterResult({ entries: [{ worktreePath: "/repo/other", branch: "feat/other",
      metaFilePath: ".arc/active/meta-other.md", class: "Heavy" }] }) });
    expect(value.envelope).not.toHaveProperty("inFlightComposition");
    expect(orderOrientationSurfaces(compileAdvisoryOrientation(value, { concurrentWorkload: true }))).toEqual([]);
  });
});


describe("agenda dormant Errand surfaces", () => {
  it("does not render a current Errand's resume or residue", async () => {
    const record = TransientIdentityRecordSchema.parse({ version: 3, slug: "fix-typo", claimId: "c".repeat(32),
      createdAt: "2026-06-01T00:00:00Z", updatedAt: "2026-06-01T00:00:00Z", kind: "errand", purpose: "errand", intent: "fix typo",
      branch: "chore/fix-typo", origin: "description", originEntry: null, state: "open", savedHead: null, changeRequest: null });
    const original = selectedRow(baseFrame());
    const row = { ...original, kind: "transient" as const, subject: { kind: "errand" as const, key: record.slug, claimId: record.claimId },
      markerGeneration: `sha256:${"d".repeat(64)}`, identity: projectLocusIdentity(record),
      checkout: { ...original.checkout, path: "/repo/errand", branch: record.branch, primary: false } };
    const envelope = await sessionInitFixture({ derivedLocusState: async () => frameWithRow(row),
      worktree: async () => worktreeSync({ branch: record.branch }), worktreeIdentity: async () => ({ kind: "linked", path: "/repo/errand" }),
      errandState: async (_context, selection) => runErrandState({ ...selection, records: [record], recordsComplete: true, entries: null,
        exec: async () => { throw new Error("Unexpected Git read"); }, remoteTips: new Map(), baseBranch: "main", staleThresholdDays: 3,
        nudge: { ...nudge, shouldNudge: false }, residue: [{ branch: "chore/leftover", slug: "leftover", reason: "no-record-or-meta" }] }),
    });
    expect(envelope.errandState).toMatchObject({ ok: true, value: { resume: { resumable: true }, residue: [{ slug: "leftover" }] } });
    expect(orderOrientationSurfaces(compileAdvisoryOrientation(createAgendaFixtureInput(envelope)))).toEqual([]);
  });

  it("does not render discovery Errands, residue or warning arrays", async () => {
    const inFlight = classifyInFlightErrands({ branches: [{ slug: "other", branch: "chore/other", ageDays: 0, hasOpenPr: false, merged: false }], staleThresholdDays: 3 });
    const envelope = await sessionInitFixture({ errandState: async () => errandStateResult({ inFlight,
      residue: [{ branch: "chore/leftover", slug: "leftover", reason: "no-record-or-meta" }], warnings: ["Errand discovery warning"] }),
      workUnitState: async () => workUnitStateResult({ warnings: ["Work-unit discovery warning"] }),
    });
    expect(orderOrientationSurfaces(compileAdvisoryOrientation(createAgendaFixtureInput(envelope)))).toEqual([]);
  });
});
