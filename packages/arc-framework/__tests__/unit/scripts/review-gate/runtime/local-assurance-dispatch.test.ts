import { describe, expect, it, vi } from "vitest";

import { MetaRecordSchema } from "../../../../../src/lib/active/meta-schema.js";
import type { MetaRecord } from "../../../../../src/lib/active/meta-reader.js";
import type {
  LocalReviewAuthority,
} from "../../../../../src/scripts/review-gate/core/local-review-authority.js";
import type {
  ReviewRubricBindingPort,
} from "../../../../../src/scripts/review-gate/policy/rubric-binding.js";

const meta = (overrides: Partial<MetaRecord> = {}): MetaRecord => MetaRecordSchema.parse({
  state: "Active",
  owner: "andrew",
  branch: "feat/review-surface-binding",
  workClass: "Heavy",
  priority: "P1",
  cohort: null,
  dependsOn: [],
  origin: "internal",
  design: ["spec-review-surface-binding.md"],
  taskList: "tasks-review-surface-binding.md",
  reviewRubric: null,
  decompositionReceipt: null,
  promotionReceipt: null,
  currentWorkflow: null,
  lastCompleted: null,
  nextTask: null,
  blockers: null,
  nextAction: null,
  prUrl: null,
  completed: null,
  ...overrides,
});

const live: { meta: MetaRecord | null; context: never } = { meta: meta(), context: {} as never };
// Methods resolve to package defaults; only the rubric arm varies per case.
const methodFilePort = { readMethodFile: () => undefined };
const rubricPort: ReviewRubricBindingPort = {
  resolveReviewRubricBinding: vi.fn(() => {
    throw new Error("rubric lookup failed");
  }),
};

vi.mock("../../../../../src/scripts/review-gate/hosts/local/live-context.js", () => ({
  readLocalReviewLiveContext: async () => live,
}));
vi.mock("../../../../../src/scripts/review-gate/hosts/local/method-files.js", () => ({
  createLocalReviewMethodFilePort: () => methodFilePort,
  createLocalReviewRubricBindingPort: () => rubricPort,
}));

const { createLocalPrepareDependencies } = await import(
  "../../../../../src/scripts/review-gate/runtime/local-prepare-composition.js"
);

const authority = (vehicle: LocalReviewAuthority["vehicle"]): LocalReviewAuthority => ({
  vehicle,
  authorIdentity: "andrew",
  evaluatorIdentity: "fresh-reviewer",
  attestationRuntimeKind: "arc-cli",
  runtimeIdentity: "arc-cli/0.1.0",
  attestationMechanism: "local-attestation",
});

const DELIVERABLE_ID = `sha256:${"a".repeat(64)}`;
const memberVehicle = { kind: "delivery-member", identity: DELIVERABLE_ID } as const;
const workUnitVehicle = { kind: "work-unit", identity: "review-surface-binding" } as const;

function compose() {
  return createLocalPrepareDependencies({ exec: vi.fn() as never, cwd: "/repo" });
}

describe("local review assurance dispatch", () => {
  it("composes work-unit assurance from the control locus's meta for a member", async () => {
    live.meta = meta();
    const composed = await compose().composeAssurance(authority(memberVehicle));

    expect(composed.status).toBe("resolved");
    if (composed.status !== "resolved") throw new Error("expected resolved assurance");
    expect(composed.assurance.workContext).toBe("work-unit");
  });

  it("carries the owning work unit's work class rather than the Errand arm's absent class", async () => {
    live.meta = meta({ workClass: "Novel" });
    const dependencies = compose();

    const member = await dependencies.composeAssurance(authority(memberVehicle));
    const workUnit = await dependencies.composeAssurance(authority(workUnitVehicle));
    const errand = await dependencies.composeAssurance(
      authority({ kind: "errand", identity: "repair-review-state" }),
    );
    if (member.status !== "resolved"
      || workUnit.status !== "resolved"
      || errand.status !== "resolved") {
      throw new Error("expected resolved assurance on all three arms");
    }

    expect(member.assurance).toEqual(workUnit.assurance);
    expect(member.assurance.workClass).toBe("Novel");
    expect(errand.assurance).toEqual({ workContext: "errand", workClass: "none" });
  });

  it("refuses an absent meta for a member exactly as for a work unit", async () => {
    live.meta = null;
    const dependencies = compose();

    for (const vehicle of [memberVehicle, workUnitVehicle]) {
      await expect(dependencies.composeAssurance(authority(vehicle))).resolves.toMatchObject({
        status: "refused",
      });
    }
    live.meta = meta();
  });

  it("refuses an unresolvable rubric for a member exactly as for a work unit", async () => {
    live.meta = meta({ reviewRubric: "project-review" });
    const dependencies = compose();

    for (const vehicle of [memberVehicle, workUnitVehicle]) {
      await expect(dependencies.composeAssurance(authority(vehicle))).resolves.toMatchObject({
        status: "refused",
      });
    }
    live.meta = meta();
  });
});
