/** Strict top-level and conditional-presence coverage for session-init envelopes. */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertSessionInitProbeResult,
  SessionInitProbeResultSchema,
} from "../../../src/commands/status/schema.js";

const FIXTURE_DIR = join(import.meta.dirname, "..", "..", "fixtures", "session-envelope");

function fixture(name: string): Record<string, unknown> {
  const normalized = readFileSync(join(FIXTURE_DIR, `session-init-${name}.json`), "utf8");
  const producerCompatible = normalized.replaceAll(/<DATE_\d+>/gu, "2026-01-02");
  return JSON.parse(producerCompatible) as Record<string, unknown>;
}

function clone(value: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(value);
}

function expectInvalid(value: Record<string, unknown>): void {
  expect(SessionInitProbeResultSchema.safeParse(value).success).toBe(false);
}

function withoutKey(value: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([candidate]) => candidate !== key));
}

describe("session-init envelope schema", () => {
  it("asserts full and thin producer defects with the registered contract identity", () => {
    const fullDefect = fixture("orient");
    (fullDefect.identity as { role: string }).role = "";
    expect(() => assertSessionInitProbeResult(fullDefect)).toThrow(
      /session-init-envelope: identity\.role:/u,
    );

    const thinDefect = fixture("orient");
    (thinDefect.worktree as { value: { recommendedAction: string } }).value.recommendedAction = "guess";
    expect(() => assertSessionInitProbeResult(thinDefect)).toThrow(
      /session-init-envelope: worktree\.value\.recommendedAction:/u,
    );
  });

  it.each(["orient", "active-resume", "current-husk", "branch-gone", "identity-missing"])(
    "accepts the %s characterization fixture",
    (name) => expect(SessionInitProbeResultSchema.parse(fixture(name))).toEqual(fixture(name)),
  );

  it.each([
    "mode",
    "identity",
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

  it("rejects undeclared top-level keys and malformed probe branches", () => {
    expectInvalid({ ...fixture("orient"), undeclared: true });
    expectInvalid({
      ...fixture("orient"),
      dirty: { ok: true, value: { state: "clean" }, error: { kind: "runtime", message: "mixed" } },
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
    expectInvalid({ ...fixture("orient"), recovery: fixture("branch-gone").recovery });

    const missingSweep = fixture("orient");
    delete missingSweep.sweep;
    expectInvalid(missingSweep);
  });

  it("allows current-husk omission but rejects impossible presence and failure probes", () => {
    const omitted = fixture("current-husk");
    delete omitted.currentHusk;
    expect(SessionInitProbeResultSchema.safeParse(omitted).success).toBe(true);

    expectInvalid({ ...fixture("orient"), currentHusk: fixture("current-husk").currentHusk });
    expectInvalid({
      ...fixture("current-husk"),
      currentHusk: { ok: false, error: { kind: "runtime", message: "degraded" } },
    });
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

    expectInvalid({ ...fixture("active-resume"), workUnitState: fixture("orient").workUnitState });
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
    expectInvalid({ ...fixture("orient"), cohortDocPath: ".arc/backlog/planned/x/cohort-x.md" });

    const cursorMissing = fixture("active-resume");
    delete cursorMissing.taskCursor;
    expectInvalid(cursorMissing);
    expectInvalid({ ...fixture("orient"), taskCursor: fixture("active-resume").taskCursor });

    const unsafe = clone(fixture("active-resume"));
    const active = unsafe.active as { value: { taskListPath: string } };
    active.value.taskListPath = "../tasks.md";
    expectInvalid(unsafe);
  });

  it("validates but never requires the invocation-only seed-write status", () => {
    const omitted = fixture("orient");
    delete omitted.compactionSeedWrite;
    expect(SessionInitProbeResultSchema.safeParse(omitted).success).toBe(true);
    expect(SessionInitProbeResultSchema.safeParse({
      ...omitted,
      compactionSeedWrite: { status: "skipped", reason: "identity-missing" },
    }).success).toBe(true);
    expect(SessionInitProbeResultSchema.safeParse({
      ...omitted,
      compactionSeedWrite: { status: "failed", reason: "seed-invalid", message: "invalid" },
    }).success).toBe(true);
    expectInvalid({ ...fixture("orient"), compactionSeedWrite: { status: "written", path: "" } });
    expectInvalid({
      ...fixture("orient"),
      compactionSeedWrite: { status: "failed", reason: "unknown", message: "bad" },
    });
  });
});
