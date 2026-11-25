/** Production session-init recommendations remain safe and valid across prerequisite failures. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runSessionInitStatus } from "../../../src/commands/status/run.js";
import type { SessionInitProbes } from "../../../src/commands/status/types.js";
import { assertSessionInitProbeResult } from "../../../src/commands/status/schema.js";
import { ConfigSessionInitResultSchema } from "../../../src/commands/config/status.js";
import { DerivedLocusFrameSchema } from "../../../src/lib/locus/derived-schema.js";
import type { WorktreeSyncState, WorktreeSnapshotAnalysisResult } from "../../../src/lib/git/worktree-sync.js";
import type { SessionRemoteContext } from "../../../src/handlers/status-remote-context.js";

const fixture = JSON.parse(readFileSync(join(import.meta.dirname,
  "../../fixtures/session-envelope/session-init-orient.json"), "utf8")) as {
  derivedLocusState: { value: unknown }; config: { value: unknown };
};
const frame = DerivedLocusFrameSchema.parse(fixture.derivedLocusState.value);
const config = ConfigSessionInitResultSchema.parse(fixture.config.value);
const supersession = { superseded: true, supersededCommits: ["a".repeat(40)], novelCommits: [] };
async function unavailable(): Promise<never> { throw new Error("independent probe unavailable"); }

function worktree(state: WorktreeSyncState): WorktreeSnapshotAnalysisResult {
  const counts = { ahead: ["local-ahead", "diverged"].includes(state) ? 1 : 0,
    behind: ["remote-ahead", "diverged"].includes(state) ? 1 : 0 };
  const base = { state, ...counts, branch: state === "detached-head" ? null : "main" };
  if (state === "remote-unavailable") return { ...base, remoteEvidence: "unreachable", failureReason: "network" };
  return { ...base, remoteEvidence: ["skipped", "no-upstream", "detached-head", "no-remote"].includes(state)
    ? "not-applicable" : "exact" };
}
function remoteContext(state: WorktreeSyncState): SessionRemoteContext {
  if (state === "remote-unavailable") return { kind: "unreachable", snapshot: { kind: "unreachable", failureReason: "network" } };
  if (state === "no-remote") return { kind: "not-needed", reason: "no-remote" };
  if (state === "skipped") return { kind: "not-needed", reason: "remote-sync-disabled" };
  return { kind: "available", snapshot: { kind: "available", scope: "all-heads",
    tips: state === "branch-gone" ? {} : { main: "b".repeat(40) } },
    objectAvailability: { kind: "complete", commits: { ["b".repeat(40)]: true } }, history: { kind: "complete" } };
}
function probes(state: WorktreeSyncState, superseded = false): SessionInitProbes {
  return {
    derivedLocusState: async () => frame,
    remoteContext: async () => remoteContext(state),
    worktree: async () => worktree(state),
    config: async () => config,
    dirty: async () => ({ state: "clean", fileCount: 0 }),
    user: async () => ({ identity: "test-user", state: "remote-ahead", refState: "remote-ahead",
      summary: "Remote notes are ahead", detailLines: [], actionHint: null, shouldPromptToPull: true }),
    supersession: async () => superseded ? supersession : { superseded: false, supersededCommits: [], novelCommits: ["a".repeat(40)] },
    worktreeIdentity: async () => ({ kind: "primary" }),
    releaseRouting: unavailable, currentWuReconcile: unavailable, userReferenceReconcile: unavailable,
    currentHusk: unavailable, baseDistance: unavailable, baseBranchSync: unavailable, domainRules: unavailable,
    hooksPath: unavailable, roster: unavailable, recovery: unavailable, sweep: unavailable,
    orphanBranchSweep: unavailable, retiredSubdirs: unavailable, errandSweep: unavailable,
    errandState: unavailable, materializableWorkUnits: unavailable, workUnitState: unavailable,
    inboxState: unavailable, partialPushMarker: unavailable,
  };
}
const options = { identity: "test-user", role: "maintainer" };
const cases = [
  ["remote-ahead", false], ["local-ahead", false], ["branch-gone", false],
  ["remote-unavailable", false], ["diverged", false], ["diverged", true],
] as const;

describe.each(["config", "dirty", "both"] as const)("session-init with %s evidence unavailable", (failed) => {
  it.each(cases)("serves passive %s guidance (superseded=%s) and recovers ordinary guidance", async (state, superseded) => {
    const healthyProbes = probes(state, superseded);
    const result = await runSessionInitStatus({ ...options, probes: { ...healthyProbes,
      ...(failed !== "dirty" ? { config: unavailable } : {}),
      ...(failed !== "config" ? { dirty: unavailable } : {}),
    } });
    expect(() => assertSessionInitProbeResult(result)).not.toThrow();
    expect(result.worktree).toMatchObject({ ok: true, value: {
      ...worktree(state), recommendedAction: "surface", recommendedPromptText: "",
      supersession: state === "diverged" ? (superseded ? supersession
        : { superseded: false, supersededCommits: [], novelCommits: ["a".repeat(40)] }) : null,
    } });
    expect(result.user).toMatchObject({ ok: true, value: { recommendedAction: "skip", recommendedPromptText: "" } });
    expect(result.recommendedCombinedPrompt).toBeNull();
    if (failed !== "dirty") expect(result.config).toMatchObject({ ok: false });
    if (failed !== "config") expect(result.dirty).toMatchObject({ ok: false });

    const restored = await runSessionInitStatus({ ...options, probes: healthyProbes });
    expect(() => assertSessionInitProbeResult(restored)).not.toThrow();
    expect(restored.worktree).toMatchObject({ ok: true, value: {
      recommendedAction: state === "remote-ahead" ? "prompt" : "surface",
      recommendedPromptText: state === "remote-ahead" || superseded ? expect.stringMatching(/\S/u) : "",
    } });
    expect(restored.user).toMatchObject({ ok: true, value: { recommendedAction: "prompt", recommendedPromptText: expect.stringMatching(/\S/u) } });
    expect(restored.recommendedCombinedPrompt).toEqual(state === "remote-ahead" ? expect.stringMatching(/\S/u) : null);
    if (superseded && restored.worktree.ok) {
      const missingOffer = { ...restored, worktree: { ok: true, value: { ...restored.worktree.value, recommendedPromptText: "" } } };
      expect(() => assertSessionInitProbeResult(missingOffer)).toThrow("worktree.value");
    }
  });
});

describe.each(["config", "dirty"] as const)("fallback validation with failed %s", (failed) => {
  it.each([["remote-ahead", false], ["diverged", true]] as const)("refuses a %s offer without prerequisites", async (state, superseded) => {
    const result = await runSessionInitStatus({ ...options, probes: { ...probes(state, superseded), [failed]: unavailable } });
    if (!result.worktree.ok) throw new Error("expected successful worktree evidence");
    const withOffer = { ...result, worktree: { ok: true, value: { ...result.worktree.value,
      recommendedAction: state === "remote-ahead" ? "prompt" : "surface", recommendedPromptText: "Offer an action?",
    } } };
    expect(() => assertSessionInitProbeResult(withOffer)).toThrow("worktree.value");
  });
  it.each(["user", "combined"] as const)("refuses a %s offer while retaining quiet worktree guidance", async (channel) => {
    const result = await runSessionInitStatus({ ...options, probes: { ...probes("no-remote"), [failed]: unavailable } });
    if (!result.user.ok || result.user.value === null) throw new Error("expected successful notes evidence");
    const withOffer = channel === "combined" ? { ...result, recommendedCombinedPrompt: "Pull both?" }
      : { ...result, user: { ok: true, value: { ...result.user.value, recommendedAction: "prompt", recommendedPromptText: "Pull notes?" } } };
    expect(() => assertSessionInitProbeResult(withOffer)).toThrow(channel === "combined" ? "recommendedCombinedPrompt" : "user.value");
  });
});

it.each(["user", "combined"] as const)("withholds the %s offer when the worktree probe fails", async (channel) => {
  const healthyProbes = probes("no-remote");
  const result = await runSessionInitStatus({ ...options, probes: { ...healthyProbes, worktree: unavailable } });
  expect(() => assertSessionInitProbeResult(result)).not.toThrow();
  expect(result.worktree).toMatchObject({ ok: false });
  expect(result.user).toMatchObject({ ok: true, value: { recommendedAction: "skip", recommendedPromptText: "" } });
  expect(result.recommendedCombinedPrompt).toBeNull();
  if (!result.user.ok || result.user.value === null) throw new Error("expected successful notes evidence");
  const withOffer = channel === "combined" ? { ...result, recommendedCombinedPrompt: "Pull both?" }
    : { ...result, user: { ok: true, value: { ...result.user.value, recommendedAction: "prompt", recommendedPromptText: "Pull notes?" } } };
  expect(() => assertSessionInitProbeResult(withOffer)).toThrow(channel === "combined" ? "recommendedCombinedPrompt" : "user.value");
  const restored = await runSessionInitStatus({ ...options, probes: healthyProbes });
  expect(() => assertSessionInitProbeResult(restored)).not.toThrow();
  expect(restored.user).toMatchObject({ ok: true, value: { recommendedAction: "prompt" } });
});
