/** Dormant session slots obey presence rules and fail independently. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runSessionInitStatus, type SessionInitProbes } from "../../../src/commands/status.js";
import { SessionInitProbeResultSchema } from "../../../src/commands/status/schema.js";
import { DerivedLocusFrameSchema } from "../../../src/lib/locus/derived-schema.js";
import { createSessionEnvelopeRegistry } from "../../../src/lib/session-envelope/registry.js";

async function unavailable(): Promise<never> { throw new Error("unrelated probe unavailable"); }
function probes(scenario = "active-resume", overrides: Partial<SessionInitProbes> = {}): SessionInitProbes {
  const fixture = JSON.parse(readFileSync(join(import.meta.dirname,
    "../../fixtures/session-envelope", `session-init-${scenario}.json`), "utf8")) as { derivedLocusState: { value: unknown } };
  const frame = DerivedLocusFrameSchema.parse(fixture.derivedLocusState.value);
  return {
    derivedLocusState: async () => frame,
    user: unavailable, dirty: unavailable, releaseRouting: unavailable, remoteContext: unavailable,
    worktree: unavailable, currentWuReconcile: unavailable, userReferenceReconcile: unavailable,
    worktreeIdentity: unavailable, currentHusk: unavailable, baseDistance: unavailable,
    baseBranchSync: unavailable, supersession: unavailable, config: unavailable, domainRules: unavailable,
    hooksPath: unavailable, roster: unavailable, recovery: unavailable, sweep: unavailable,
    orphanBranchSweep: unavailable, retiredSubdirs: unavailable, errandSweep: unavailable,
    errandState: unavailable, materializableWorkUnits: unavailable, workUnitState: unavailable,
    inboxState: unavailable, partialPushMarker: unavailable,
    ...overrides,
  };
}

describe("dormant session slots", () => {
  it("emits empty paused and inbound slots for an identified current work unit", async () => {
    const result = await runSessionInitStatus({ identity: "test-user", role: "maintainer", probes: probes() });
    expect(result.pausedWork).toEqual({ ok: true, value: { items: [] } });
    expect(result.inboundBackPressure).toEqual({ ok: true, value: null });
    expect(SessionInitProbeResultSchema.safeParse(result).success).toBe(true);
    const registry = createSessionEnvelopeRegistry();
    expect(registry.get("paused-work")?.safeParse({ items: [] }).success).toBe(true);
    expect(registry.get("inbound-back-pressure")?.safeParse(null).success).toBe(true);
  });
  it("omits inbound figures when no work unit is current", async () => {
    const result = await runSessionInitStatus({ identity: "test-user", role: "maintainer", probes: probes("orient") });
    expect(result.pausedWork).toEqual({ ok: true, value: { items: [] } });
    expect(result).not.toHaveProperty("inboundBackPressure");
    expect(SessionInitProbeResultSchema.safeParse(result).success).toBe(true);
  });
  it("omits both slots without an identity", async () => {
    const result = await runSessionInitStatus({ identity: null, role: null, probes: probes() });
    expect(result).not.toHaveProperty("pausedWork");
    expect(result).not.toHaveProperty("inboundBackPressure");
  });
  it.each(["pausedWork", "inboundBackPressure"] as const)("isolates %s composition failure", async (slot) => {
    const result = await runSessionInitStatus({ identity: "test-user", role: "maintainer",
      probes: probes("active-resume", { [slot]: async () => { throw new Error("slot unavailable"); } }),
    });
    expect(result[slot]).toMatchObject({ ok: false });
    const other = slot === "pausedWork" ? "inboundBackPressure" : "pausedWork";
    expect(result[other]).toMatchObject({ ok: true });
    expect(result.derivedLocusState.ok).toBe(true);
    expect(SessionInitProbeResultSchema.safeParse(result).success).toBe(true);
  });
});

it.each([
  ["paused-work", { items: [{ slug: "paused", reason: "Wait for prerequisite",
    waitsOn: { kind: "work-unit", slug: "prerequisite" }, marks: ["resumable"],
    actions: [{ text: "arc resume paused", argv: ["arc", "resume", "paused"] }],
  }] }],
  ["inbound-back-pressure", { pendingCount: 11, oldestAgeDays: 31,
    countThreshold: 10, ageThresholdDays: 30,
    actions: [{ text: "Run arc inbox current, then re-triage the pending entries." }],
  }],
] as const)("serves the full populated %s contract", (id, value) => {
  const schema = createSessionEnvelopeRegistry().get(id);
  if (schema === undefined) throw new Error(`Missing ${id}`);
  expect(schema.safeParse(value).success).toBe(true);
});

it.each(["pausedWork", "inboundBackPressure"] as const)("requires the eligible %s slot at the output boundary", async (slot) => {
  const result = await runSessionInitStatus({ identity: "test-user", role: "maintainer", probes: probes() });
  const incomplete = Object.fromEntries(Object.entries(result).filter(([key]) => key !== slot));
  expect(SessionInitProbeResultSchema.safeParse(incomplete).success).toBe(false);
});
