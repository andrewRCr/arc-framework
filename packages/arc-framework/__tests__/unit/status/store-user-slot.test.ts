/** Store pull states survive composite isolation and render without notes-policy fields. */
import { expect, it } from "vitest";
import { runSessionHandoffStatus, runSessionInitStatus } from "../../../src/commands/status/run.js";
import type { SessionHandoffProbes, SessionInitProbes } from "../../../src/commands/status/types.js";
import { describeStorePull } from "../../../src/lib/session-init/store-user-pull.js";

async function unavailable(): Promise<never> { throw new Error("Independent probe unavailable"); }
function probes(user: SessionInitProbes["user"]): SessionInitProbes {
  return { user, dirty: unavailable, releaseRouting: unavailable, derivedLocusState: unavailable,
    remoteContext: unavailable, worktree: unavailable, currentWuReconcile: unavailable, userReferenceReconcile: unavailable,
    worktreeIdentity: unavailable, currentHusk: unavailable, baseDistance: unavailable, baseBranchSync: unavailable,
    supersession: unavailable, config: unavailable, domainRules: unavailable, hooksPath: unavailable, roster: unavailable,
    recovery: unavailable, sweep: unavailable, orphanBranchSweep: unavailable, retiredSubdirs: unavailable,
    errandSweep: unavailable, errandState: unavailable, materializableWorkUnits: unavailable, workUnitState: unavailable,
    inboxState: unavailable, partialPushMarker: unavailable };
}
it("retains designation and typed remedy while unrelated probes fail", async () => {
  const value = describeStorePull({ status: "designation-needed", remote: "origin", choices: ["state", "code"],
    remedy: { text: "Designate state", argv: ["arc", "store", "remote", "origin", "state"] } });
  const result = await runSessionInitStatus({ identity: "alice", role: "maintainer", stateOffBranch: true,
    probes: probes(async () => value) });
  expect(result.user).toEqual({ ok: true, value });
  expect(result.recommendedCombinedPrompt).toBeNull();
});
it("preserves a successful empty user slot when synchronization is unbound", async () => {
  const result = await runSessionInitStatus({ identity: "alice", role: "maintainer", stateOffBranch: true,
    probes: probes(async () => null) });
  expect(result.user).toEqual({ ok: true, value: null });
});

it("preserves an empty handoff user slot after notes policy retirement", async () => {
  const handoff: SessionHandoffProbes = { user: async () => null, worktree: unavailable,
    worktreeIdentity: unavailable, dirty: unavailable, releaseRouting: unavailable,
    derivedLocusState: unavailable, syncInterlock: unavailable, head: unavailable,
    pushability: unavailable, restateCandidates: unavailable, inboxState: unavailable };
  const result = await runSessionHandoffStatus({ identity: "alice", role: "maintainer", probes: handoff,
    resolveHandoffSurfaces: unavailable });
  expect(result.user).toEqual({ ok: true, value: null });
});
