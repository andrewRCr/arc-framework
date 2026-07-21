/** Generation-owned grooming and housekeeping identity claims. */

import { describe, expect, it } from "vitest";

import {
  TransientIdentityRecordV3Schema,
  TransientIdentityRecordSchema,
  groomClaimConflictResolver,
  groomClaimTransform,
  groomAwaitMergeTransform,
  type GroomIdentityRecord,
  housekeepClaimTransform,
  housekeepClaimConflictResolver,
  housekeepAwaitMergeTransform,
  identityClaimRollbackTransform,
  mintHousekeepDispatchId,
  type HousekeepIdentityRecord,
} from "../../src/lib/errand/index.js";

const createdAt = "2026-07-20T00:00:00.000Z";
const baseHead = "a".repeat(40);
const digest = `sha256:${"d".repeat(64)}`;
const changeRequest = {
  repositoryRef: "owner/repo",
  hostRef: "github.com",
  baseRef: "main",
  headRef: "chore/groom-alpha",
  headSha: "c".repeat(40),
};

function groom(overrides: Record<string, unknown> = {}): GroomIdentityRecord {
  return TransientIdentityRecordV3Schema.parse({
    version: 3,
    kind: "groom",
    slug: "groom-alpha",
    claimId: "1".repeat(32),
    anchorStub: "alpha",
    members: ["alpha"],
    openedBaseHead: baseHead,
    protection: "full",
    branch: "chore/groom-alpha",
    state: "open",
    changeRequest: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  }) as GroomIdentityRecord;
}

function housekeep(overrides: Record<string, unknown> = {}): HousekeepIdentityRecord {
  return TransientIdentityRecordV3Schema.parse({
    version: 3,
    kind: "errand",
    slug: "route-inbox",
    claimId: "4".repeat(32),
    purpose: "housekeep-routing",
    branch: "chore/route-inbox",
    routingLane: "auto",
    dispatchId: "dispatch-winner",
    routingPlanDigest: digest,
    state: "open",
    savedHead: null,
    changeRequest: null,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  }) as HousekeepIdentityRecord;
}

describe("groom identity claims", () => {
  it("creates one first-writer claim without changing its pinned base", () => {
    const candidate = groom();
    const decision = groomClaimTransform(candidate)(new Map());

    expect(decision).toMatchObject({
      kind: "applied",
      value: { kind: "claimed", record: { claimId: candidate.claimId, openedBaseHead: baseHead } },
    });
  });

  it("adopts an exact-set winner without replacing its generation or pinned base", () => {
    const winner = groom();
    const loser = groom({ claimId: "2".repeat(32), openedBaseHead: "b".repeat(40) });
    const decision = groomClaimTransform(loser)(new Map([[winner.slug, winner]]));

    expect(decision).toMatchObject({
      kind: "idempotent",
      value: { kind: "resume", record: { claimId: winner.claimId, openedBaseHead: baseHead } },
    });
  });

  it("permits disjoint sets and refuses every non-identical member overlap", () => {
    const alpha = groom();
    const beta = groom({
      slug: "groom-beta",
      claimId: "2".repeat(32),
      anchorStub: "beta",
      members: ["beta"],
      branch: "chore/groom-beta",
    });
    const disjoint = groomClaimTransform(alpha)(new Map([[beta.slug, beta]]));
    expect(disjoint).toMatchObject({ kind: "applied" });
    if (disjoint.kind !== "applied") throw new Error("expected disjoint claim");
    expect([...disjoint.records.keys()].sort()).toEqual(["groom-alpha", "groom-beta"]);

    const alphaBeta = groom({ members: ["alpha", "beta"] });
    expect(groomClaimTransform(alphaBeta)(new Map([[beta.slug, beta]])))
      .toMatchObject({ kind: "refused", reason: expect.stringContaining("beta") });

    const sameSetOtherAnchor = groom({
      slug: "groom-beta",
      claimId: "3".repeat(32),
      anchorStub: "beta",
      members: ["alpha", "beta"],
      branch: "chore/groom-beta",
    });
    expect(groomClaimTransform(alphaBeta)(new Map([[sameSetOtherAnchor.slug, sameSetOtherAnchor]])))
      .toMatchObject({ kind: "refused" });

    const partialBeta = groom({
      slug: "groom-beta",
      claimId: "4".repeat(32),
      anchorStub: "beta",
      members: ["beta"],
      protection: "partial",
      branch: null,
    });
    expect(groomClaimTransform(alphaBeta)(new Map([[partialBeta.slug, partialBeta]])))
      .toMatchObject({ kind: "refused" });
    const partialAlphaBeta = groom({ protection: "partial", branch: null, members: ["alpha", "beta"] });
    expect(groomClaimTransform(partialAlphaBeta)(new Map([[beta.slug, beta]])))
      .toMatchObject({ kind: "refused" });
  });

  it("refuses incompatible occupancy and unsanctioned same-key divergence", () => {
    const candidate = groom();
    const legacy = TransientIdentityRecordSchema.parse({
      version: 2,
      slug: candidate.slug,
      origin: "description",
      intent: "legacy",
      branch: candidate.branch,
      createdAt,
    });
    expect(groomClaimTransform(candidate)(new Map([[candidate.slug, legacy]])))
      .toMatchObject({ kind: "refused", reason: expect.stringContaining("occupied") });
    expect(groomClaimConflictResolver(candidate)({
      key: candidate.slug,
      base: undefined,
      local: candidate,
      remote: legacy,
    })).toMatchObject({ kind: "refused" });
  });

  it("moves an exact open generation to awaiting-merge without changing its pinned base", () => {
    const previous = groom();
    const request = {
      previous,
      changeRequest,
      updatedAt: "2026-07-20T00:01:00.000Z",
    };
    const decision = groomAwaitMergeTransform(request)(new Map([[previous.slug, previous]]));
    expect(decision).toMatchObject({
      kind: "applied",
      value: {
        state: "awaiting-merge",
        claimId: previous.claimId,
        openedBaseHead: previous.openedBaseHead,
        changeRequest,
      },
    });
    if (decision.kind !== "applied") throw new Error("expected awaiting-merge transition");
    expect(groomAwaitMergeTransform(request)(decision.records)).toMatchObject({ kind: "idempotent" });
    expect(groomAwaitMergeTransform(request)(new Map([[
      previous.slug,
      groom({ claimId: "8".repeat(32) }),
    ]])))
      .toMatchObject({ kind: "refused" });
  });
});

describe("housekeep routing identity claims", () => {
  it("mints opaque stable-quality dispatch identifiers", () => {
    expect(mintHousekeepDispatchId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(mintHousekeepDispatchId()).not.toBe(mintHousekeepDispatchId());
  });

  it("creates one global routing claim with its minted dispatch and confirmed plan", () => {
    const candidate = housekeep();
    expect(housekeepClaimTransform(candidate)(new Map())).toMatchObject({
      kind: "applied",
      value: {
        kind: "claimed",
        record: { dispatchId: "dispatch-winner", routingLane: "auto", routingPlanDigest: digest },
      },
    });
  });

  it("adopts a same-plan winner across slugs without rotating its dispatch", () => {
    const winner = housekeep();
    const loser = housekeep({
      slug: "second-route",
      claimId: "5".repeat(32),
      branch: "chore/second-route",
      dispatchId: "dispatch-loser",
    });
    expect(housekeepClaimTransform(loser)(new Map([[winner.slug, winner]]))).toMatchObject({
      kind: "idempotent",
      value: { kind: "resume", record: { slug: winner.slug, claimId: winner.claimId, dispatchId: "dispatch-winner" } },
    });
  });

  it("returns wait for a matching awaiting-merge routing winner", () => {
    const winner = housekeep({
      state: "awaiting-merge",
      changeRequest: { ...changeRequest, headRef: "chore/route-inbox" },
    });
    expect(housekeepClaimTransform(housekeep())(new Map([[winner.slug, winner]])))
      .toMatchObject({ kind: "idempotent", value: { kind: "wait", record: { claimId: winner.claimId } } });
  });

  it("refuses a competing plan and only escalates the winning lane", () => {
    const winner = housekeep();
    const changedPlan = housekeep({
      slug: "second-route",
      claimId: "5".repeat(32),
      branch: "chore/second-route",
      dispatchId: "dispatch-loser",
      routingPlanDigest: `sha256:${"e".repeat(64)}`,
    });
    expect(housekeepClaimTransform(changedPlan)(new Map([[winner.slug, winner]])))
      .toMatchObject({ kind: "refused", reason: expect.stringContaining("digest") });

    const reviewed = housekeep({
      slug: "second-route",
      claimId: "5".repeat(32),
      branch: "chore/second-route",
      dispatchId: "dispatch-loser",
      routingLane: "reviewed",
      updatedAt: "2026-07-20T00:01:00.000Z",
    });
    const escalated = housekeepClaimTransform(reviewed)(new Map([[winner.slug, winner]]));
    expect(escalated).toMatchObject({
      kind: "applied",
      value: {
        kind: "resume",
        record: { slug: winner.slug, claimId: winner.claimId, dispatchId: winner.dispatchId, routingLane: "reviewed" },
      },
    });

    const alreadyReviewed = housekeep({ routingLane: "reviewed", updatedAt: "2026-07-20T00:01:00.000Z" });
    const downgrade = housekeepClaimTransform(housekeep())(new Map([[alreadyReviewed.slug, alreadyReviewed]]));
    expect(downgrade).toMatchObject({
      kind: "idempotent",
      value: { record: { routingLane: "reviewed" } },
    });
  });

  it("collapses a different-slug same-plan loser into the winning identity", () => {
    const winner = housekeep();
    const loser = housekeep({
      slug: "second-route",
      claimId: "5".repeat(32),
      branch: "chore/second-route",
      dispatchId: "dispatch-loser",
    });
    const decision = housekeepClaimTransform(loser)(new Map([
      [winner.slug, winner],
      [loser.slug, loser],
    ]));
    expect(decision).toMatchObject({
      kind: "applied",
      value: { kind: "resume", record: { slug: winner.slug, dispatchId: winner.dispatchId } },
    });
    if (decision.kind !== "applied") throw new Error("expected loser adoption");
    expect([...decision.records.keys()]).toEqual([winner.slug]);
  });

  it("refuses same-key adoption when the validated plan does not match", () => {
    const candidate = housekeep();
    const otherPlan = housekeep({ routingPlanDigest: `sha256:${"e".repeat(64)}` });
    expect(housekeepClaimConflictResolver(candidate)({
      key: candidate.slug,
      base: undefined,
      local: candidate,
      remote: otherPlan,
    })).toMatchObject({ kind: "refused" });
  });

  it("persists only an exact open routing generation as awaiting merge", () => {
    const previous = housekeep();
    const decision = housekeepAwaitMergeTransform({
      previous,
      changeRequest: { ...changeRequest, headRef: previous.branch },
      updatedAt: "2026-07-20T00:01:00.000Z",
    })(new Map([[previous.slug, previous]]));
    expect(decision).toMatchObject({
      kind: "applied",
      value: { state: "awaiting-merge", dispatchId: previous.dispatchId, routingPlanDigest: previous.routingPlanDigest },
    });
    expect(housekeepAwaitMergeTransform({
      previous,
      changeRequest: { ...changeRequest, headRef: previous.branch },
      updatedAt: "2026-07-20T00:01:00.000Z",
    })(new Map([[previous.slug, housekeep({ claimId: "9".repeat(32) })]])))
      .toMatchObject({ kind: "refused", reason: expect.stringContaining("changed") });
  });
});

describe("identity claim rollback", () => {
  it("retires only the exact unchanged claimant generation", () => {
    const expected = groom();
    expect(identityClaimRollbackTransform(expected)(new Map([[expected.slug, expected]])))
      .toMatchObject({ kind: "applied", value: null });
    expect(identityClaimRollbackTransform(expected)(new Map()))
      .toMatchObject({ kind: "idempotent", value: null });
    expect(identityClaimRollbackTransform(expected)(new Map([[
      expected.slug,
      groom({ updatedAt: "2026-07-20T00:01:00.000Z" }),
    ]])))
      .toMatchObject({ kind: "refused", reason: expect.stringContaining("changed") });
    expect(identityClaimRollbackTransform(expected)(new Map([[
      expected.slug,
      groom({ claimId: "9".repeat(32) }),
    ]])))
      .toMatchObject({ kind: "refused" });
  });
});
