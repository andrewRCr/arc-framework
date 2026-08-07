import { afterEach, describe, expect, it, vi } from "vitest";

import { MetaRecordSchema } from "../../../../../src/lib/active/meta-schema.js";
import type { MetaRecord } from "../../../../../src/lib/active/meta-reader.js";
import type {
  LocalReviewAuthority,
} from "../../../../../src/scripts/review-gate/core/local-review-authority.js";
import type {
  LocalReviewState,
} from "../../../../../src/scripts/review-gate/core/operation-state-schema.js";
import {
  DEFAULT_LOCAL_REVIEW_POLICY_BINDING,
} from "../../../../../src/scripts/review-gate/policy/local-review-policy.js";
import type {
  ReviewRubricBindingPort,
  ReviewRubricBindingResolution,
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
const PROJECT_AUGMENTATION = {
  rubricId: "project-review",
  dimensions: [{
    id: "domain-fit",
    title: "Domain fit",
    instruction: "Check the change against the project's own domain boundaries.",
  }],
} as const;
// Null resolves nothing, which is the unavailable-rubric arm the refusal cases need.
let rubricBinding: ReviewRubricBindingResolution | null = null;
const rubricPort: ReviewRubricBindingPort = {
  resolveReviewRubricBinding: vi.fn(() => {
    if (rubricBinding === null) throw new Error("rubric lookup failed");
    return rubricBinding;
  }),
};

afterEach(() => {
  live.meta = meta();
  rubricBinding = null;
});

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
const { createLocalAttestDependencies } = await import(
  "../../../../../src/scripts/review-gate/runtime/local-attest-composition.js"
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
  });

  it("refuses an unresolvable rubric for a member exactly as for a work unit", async () => {
    live.meta = meta({ reviewRubric: "project-review" });
    const dependencies = compose();

    for (const vehicle of [memberVehicle, workUnitVehicle]) {
      await expect(dependencies.composeAssurance(authority(vehicle))).resolves.toMatchObject({
        status: "refused",
      });
    }
  });

  it("recomputes a member's attested guidance digest from the digest prepare published", async () => {
    live.meta = meta({ reviewRubric: "project-review" });
    rubricBinding = {
      status: "resolved",
      binding: { identity: "project-review", augmentation: PROJECT_AUGMENTATION },
      diagnostics: [],
    };
    const attest = createLocalAttestDependencies({ exec: vi.fn() as never, cwd: "/repo" });
    // Recomposition reads exactly one field out of the persisted operation record.
    const state = {
      policyBindingDigest: DEFAULT_LOCAL_REVIEW_POLICY_BINDING.bindingDigest,
    } as unknown as LocalReviewState;

    const published = await compose().composeAssurance(authority(memberVehicle));
    if (published.status !== "resolved") throw new Error("expected resolved assurance");

    await expect(attest.resolveGuidanceDigest(authority(memberVehicle), state))
      .resolves.toBe(published.guidance.guidanceDigest);
    // Not a tautology: the Errand arm an unrouted member falls to digests differently,
    // which attest reports as changed guidance rather than as a misrouted vehicle.
    await expect(attest.resolveGuidanceDigest(
      authority({ kind: "errand", identity: "repair-review-state" }),
      state,
    )).resolves.not.toBe(published.guidance.guidanceDigest);
  });
});
