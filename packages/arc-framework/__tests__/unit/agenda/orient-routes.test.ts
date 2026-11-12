/** Discovery routes preserve published commands and their checkout boundaries. */
import { describe, expect, it } from "vitest";
import { TransientIdentityRecordSchema } from "../../../src/lib/errand/identity-record.js";
import { findMaterializableErrands } from "../../../src/lib/session-init/materializable-errands.js";
import { errandStateResult, rosterResult } from "../../helpers/session-init-fixtures.js";
import { entry } from "../../helpers/inbox-harness.js";
import { runInboxState } from "../../../src/lib/session-init/inbox-state.js";
import { classifyUnboundMarker } from "../../../src/lib/locus/unbound-marker.js";
import { compileRouteChoice } from "../../../src/commands/agenda/routes.js";
import { compileSessionInitAgenda } from "../../../src/commands/agenda/compile.js";
import { assertSessionInitAgenda } from "../../../src/commands/agenda/schema.js";
import { createSignalAgendaFixture } from "../../helpers/agenda-signal-fixtures.js";
import { createLifecycleHarness } from "../../helpers/store/lifecycle-harness.js";
import { createTestStatusContext } from "../../helpers/status-context.js";
import { scriptGitExec } from "../../helpers/git-exec-fake.js";
import { deriveStoreInFlight } from "../../../src/lib/git/in-flight-store.js";
import { composeMaterializableDiscoveryRefreshRemedy, findMaterializableWorkUnits, MaterializableWorkUnitDiscoveryResultSchema } from "../../../src/lib/session-init/materializable-work-units.js";

async function releasedTarget() {
  const h = createLifecycleHarness();
  await h.seedMeta("released", { owner: "test-user" });
  const { exec } = scriptGitExec([{ match: { prefix: ["for-each-ref"] }, responses: [{ stdout: "" }] }]);
  const oracle = await deriveStoreInFlight({ store: h.store, exec, identity: "test-user", teamMode: false,
    roster: [], projectId: async () => "project" });
  const materializable = await findMaterializableWorkUnits({ store: h.store, entries: oracle.entries,
    identity: "test-user", findHoldingCheckout: async () => ({ kind: "none" }) });
  return { h, materializable };
}

describe("Orient standing routes", () => {
  it("offers a real released work unit's published spawning command as a handoff", async () => {
    const { h, materializable } = await releasedTarget();
    expect(materializable.candidates).toHaveLength(1);
    const { input } = await createSignalAgendaFixture(undefined, { materializableWorkUnits: async () =>
      MaterializableWorkUnitDiscoveryResultSchema.parse({ ...materializable, remoteEvidence: "not-applicable", pendingBranchCount: 0, refreshRemedy: null }) });
    input.entry = await createTestStatusContext({ store: h.store, identity: "test-user", cwd: "/repo" });
    const result = await compileSessionInitAgenda(input);
    expect(result.ok, JSON.stringify(result)).toBe(true);
    if (!result.ok) throw Error("Expected Orient");
    assertSessionInitAgenda(result.agenda);
    const route = result.agenda.steps.find(step => step.type === "offer" && step.id === "materialize:released");
    expect(route).toEqual({ type: "offer", id: "materialize:released", ask: "orientation", text: expect.any(String), choices: [{
      kind: "actions", label: materializable.candidates[0]?.actions?.[0]?.text, accepts: [],
      actions: materializable.candidates[0]?.actions, then: { kind: "handoff" },
    }] });
    expect(result.agenda.steps).toContainEqual({ type: "render", surface: "materializable-work-units", text: expect.stringContaining("`released`") });
  });
});


it.each([
  { kind: "bind", sameCheckout: true }, { kind: "bind", sameCheckout: false },
  { kind: "rerun", sameCheckout: true }, { kind: "rerun", sameCheckout: false },
] as const)("routes $kind exits with sameCheckout=$sameCheckout", async ({ kind, sameCheckout }) => {
  const h = createLifecycleHarness();
  if (kind === "bind") await h.seedMeta("released", { owner: "test-user" });
  const classified = await classifyUnboundMarker({ store: h.store, cwd: "/holder", identity: "test-user", marker: {
    spawnedByArc: false, createdFor: { kind: "work-unit", name: "released" }, spawningIdentity: "test-user", createdAt: "2026-10-24T00:00:00Z",
  } });
  expect(classified).toMatchObject({ kind: "unbound", exit: { kind } });
  if (classified.kind !== "unbound") throw Error(classified.reason);
  expect(classified.exits).toHaveLength(2);
  for (const action of classified.exits) {
    if (action.argv === undefined) throw Error("Expected published command");
    const choice = compileRouteChoice({ signals: { next: true }, answers: { answered: {}, done: [] },
      entry: { cwd: sameCheckout ? "/holder" : "/repo" } }, { ...action, argv: action.argv });
    const release = action.argv[1] === "locus";
    expect(choice).toMatchObject({ kind: "actions", actions: [action], then: release || sameCheckout
      ? { kind: "recompile", argv: ["arc", "agenda", "session-init", "--json"] } : { kind: "handoff" } });
  }
});


it.each([false, true])("offers discovery refresh exactly once with candidates=%s", async withCandidate => {
  const materializable = findMaterializableWorkUnits({ identity: "test-user", pendingBranchCount: 1,
    entries: withCandidate ? [{ kind: "work-unit", name: "remote", branch: "feat/remote", owner: "test-user", state: "Active", remoteOnly: true, dependsOn: [] }] : [] });
  const refreshRemedy = composeMaterializableDiscoveryRefreshRemedy();
  const { input } = await createSignalAgendaFixture(undefined, { materializableWorkUnits: async () =>
    MaterializableWorkUnitDiscoveryResultSchema.parse({ ...materializable, remoteEvidence: "pending-fetch", pendingBranchCount: 1, refreshRemedy }) }, false);
  const result = await compileSessionInitAgenda(input);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw Error("Expected Orient");
  const offer = result.agenda.steps.find(step => step.type === "offer" && step.id === (withCandidate ? "materialize:remote" : "materialize:"));
  expect(offer?.type).toBe("offer");
  if (offer?.type !== "offer") throw Error("Expected materialize menu");
  const refresh = offer.choices.filter(choice => choice.kind === "actions" && choice.actions.some(action => action.argv[1] === "active"));
  expect(refresh).toEqual([{ kind: "actions", label: refreshRemedy.text, accepts: [], actions: [refreshRemedy],
    then: { kind: "recompile", argv: ["arc", "agenda", "session-init", "--json", "--done", "fragment:discover-next-work"] } }]);
});


it("adds the legacy in-place materialize and notes-pull sequence", async () => {
  const result = findMaterializableWorkUnits({ identity: "test-user", entries: [{ kind: "work-unit", name: "legacy", branch: "feat/legacy",
    owner: "test-user", state: "Active", remoteOnly: true, dependsOn: [] }] });
  const { input } = await createSignalAgendaFixture(undefined, { materializableWorkUnits: async () =>
    MaterializableWorkUnitDiscoveryResultSchema.parse({ ...result, remoteEvidence: "exact", pendingBranchCount: 0, refreshRemedy: null }) }, false);
  const compiled = await compileSessionInitAgenda(input);
  expect(compiled.ok, JSON.stringify(compiled)).toBe(true);
  if (!compiled.ok) throw Error("Expected Orient");
  const offer = compiled.agenda.steps.find(step => step.type === "offer" && step.id === "materialize:legacy");
  expect(offer).toMatchObject({ type: "offer", choices: [
    { kind: "actions", actions: result.candidates[0]?.actions, then: { kind: "handoff" } },
    { kind: "actions", actions: [
      { argv: ["arc", "materialize", "legacy", "--here"], checkout: "/repo" },
      { argv: ["arc", "user", "pull"] },
    ], then: { kind: "recompile", argv: ["arc", "agenda", "session-init", "--json", "--done", "fragment:discover-next-work"] } },
  ] });
});

it.each(["materializableWorkUnits", "errandState"] as const)("degrades failed %s evidence and supplies no route", async slot => {
  const { input } = await createSignalAgendaFixture(undefined, { [slot]: async () => { throw Error(`${slot} denied`); } });
  expect(input.envelope[slot]).toMatchObject({ ok: false });
  const compiled = await compileSessionInitAgenda(input);
  expect(compiled.ok, JSON.stringify(compiled)).toBe(true);
  if (!compiled.ok) throw Error("Expected degraded Orient");
  expect(compiled.agenda.steps).toContainEqual({ type: "render", surface: "degraded-slot", text: expect.stringContaining(`${slot} denied`) });
  expect(compiled.agenda.steps.filter(step => step.type === "offer" && step.id.startsWith("materialize"))).toEqual([]);
});


function pausedErrandMaterialization() {
  const record = TransientIdentityRecordSchema.parse({ version: 3, kind: "errand", purpose: "errand", slug: "paused",
    claimId: "c".repeat(32), createdAt: "2026-06-01T00:00:00Z", updatedAt: "2026-06-01T00:00:00Z", intent: "Concern", branch: "chore/paused",
    origin: "description", originEntry: null, state: "paused", savedHead: "a".repeat(40), changeRequest: null });
  if (record.kind !== "errand" || record.purpose !== "errand" || record.state !== "paused") throw Error("Expected paused Errand");
  const materializable = findMaterializableErrands({ records: [record], remoteTips: new Map([[record.branch, "a".repeat(40)]]), locallyPresentBranches: new Set() });
  expect(materializable.candidates).toHaveLength(1);
  return materializable;
}

it("hands off an exact materializable Errand generation using its published argv", async () => {
  const materializable = pausedErrandMaterialization();
  const { input } = await createSignalAgendaFixture(undefined, { errandState: async () => errandStateResult({ materializable }) });
  const result = await compileSessionInitAgenda(input);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw Error("Expected Orient");
  expect(result.agenda.steps).toContainEqual({ type: "render", surface: "materializable-errands", text: expect.stringContaining("`paused` (`chore/paused` at `" + "a".repeat(40)) });
  expect(result.agenda.steps).toContainEqual({ type: "offer", id: "materialize-errand:paused", ask: "orientation", text: expect.any(String),
    choices: [{ kind: "actions", label: materializable.candidates[0]?.actions?.[0]?.text, accepts: [],
      actions: materializable.candidates[0]?.actions, then: { kind: "handoff" } }] });
});


it("soft-offers Housekeep from the primary's real routable inbox count", async () => {
  const content = "## Work Unit\n\n" + entry("12345678", "Route this concern");
  const state = runInboxState({ content, queuedEntryIds: new Set() });
  expect(state).toMatchObject({ housekeepNeeded: true, routableCount: 1 });
  const { input } = await createSignalAgendaFixture(content, { inboxState: async () => state });
  const result = await compileSessionInitAgenda(input);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw Error("Expected Orient");
  expect(result.agenda.steps).toContainEqual({ type: "offer", id: "housekeep:drain", ask: "orientation",
    text: "**Housekeep:** no active WU; `USER-INBOX` has 1 pending capture(s) — housekeep?",
    choices: [{ kind: "signal", label: "Housekeep", signal: "housekeep", value: true,
      recompile: ["arc", "agenda", "session-init", "--json", "--housekeep", "--done", "fragment:discover-next-work"] }] });
});


it("places materialization, Housekeep and workload at their ordered orientation surfaces", async () => {
  const { materializable } = await releasedTarget();
  const errands = pausedErrandMaterialization();
  const content = "## Work Unit\n\n" + entry("12345678", "Route this concern");
  const { input } = await createSignalAgendaFixture(content, {
    materializableWorkUnits: async () => MaterializableWorkUnitDiscoveryResultSchema.parse({ ...materializable,
      remoteEvidence: "not-applicable", pendingBranchCount: 0, refreshRemedy: null }),
    errandState: async () => errandStateResult({ materializable: errands }),
    inboxState: async () => runInboxState({ content, queuedEntryIds: new Set() }),
    roster: async () => rosterResult({ entries: [{ worktreePath: "/wt/other", branch: "feat/other",
      metaFilePath: "/wt/other/.arc/active/meta-other.md", class: "Heavy" }] }),
  });
  const result = await compileSessionInitAgenda(input);
  expect(result.ok, JSON.stringify(result)).toBe(true);
  if (!result.ok) throw Error("Expected Orient");
  const names = result.agenda.steps.flatMap(step => step.type === "render" || step.type === "note" ? [step.surface]
    : step.type === "offer" ? [step.id] : []);
  const expected = ["materializable-work-units", "materialize:released", "materializable-errands", "materialize-errand:paused", "housekeep:drain", "concurrent-workload"];
  expect(names.filter(name => expected.includes(name))).toEqual(expected);
});
