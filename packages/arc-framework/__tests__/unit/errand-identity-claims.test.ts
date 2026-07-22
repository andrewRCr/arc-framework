/** Generation-owned grooming and housekeeping identity claims. */

import { describe, expect, it } from "vitest";

import {
  TransientIdentityRecordV3Schema,
  TransientIdentityRecordSchema,
  groomClaimTransform,
  groomAwaitMergeTransform,
  groomResumeTransform,
  rollbackGroomResumeTransform,
  type ChangeRequestLifecycleEvidence,
  type GroomIdentityRecord,
  housekeepClaimTransform,
  housekeepAwaitMergeTransform,
  identityClaimRollbackTransform,
  type HousekeepIdentityRecord,
} from "../../src/lib/errand/index.js";

const createdAt = "2026-07-20T00:00:00.000Z";
const baseHead = "a".repeat(40);
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

  it("resumes an exact same-anchor set without replacing its generation or pinned base", () => {
    const existing = groom();
    const candidate = groom({ claimId: "2".repeat(32), openedBaseHead: "b".repeat(40) });
    const decision = groomClaimTransform(candidate)(new Map([[existing.slug, existing]]));

    expect(decision).toMatchObject({
      kind: "idempotent",
      value: { kind: "resume", record: { claimId: existing.claimId, openedBaseHead: baseHead } },
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

  it("refuses incompatible occupancy", () => {
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

  it("resumes an awaiting-merge generation from open or advisory host truth", () => {
    const previous = groom({ state: "awaiting-merge", changeRequest });
    for (const kind of ["open", "requested-work", "changed-head", "unreachable"] as const) {
      const lifecycle = { kind, changeRequest } as ChangeRequestLifecycleEvidence;
      expect(groomResumeTransform({
        previous,
        lifecycle,
        updatedAt: "2026-07-20T00:02:00.000Z",
      })(new Map([[previous.slug, previous]]))).toMatchObject({
        kind: "applied",
        value: { state: "open", changeRequest: null, claimId: previous.claimId },
      });
    }
    expect(groomResumeTransform({
      previous,
      lifecycle: { kind: "merged", changeRequest } as ChangeRequestLifecycleEvidence,
      updatedAt: "2026-07-20T00:02:00.000Z",
    })(new Map([[previous.slug, previous]]))).toMatchObject({ kind: "refused" });
  });

  it("restores only the exact grooming generation advanced by a failed resume", () => {
    const previous = groom({ state: "awaiting-merge", changeRequest });
    const lifecycle = { kind: "open", changeRequest } as ChangeRequestLifecycleEvidence;
    const resumed = groomResumeTransform({
      previous,
      lifecycle,
      updatedAt: "2026-07-20T00:02:00.000Z",
    })(new Map([[previous.slug, previous]]));
    if (resumed.kind !== "applied") throw new Error("expected applied grooming resume");

    const rollback = rollbackGroomResumeTransform(previous, resumed.value);
    expect(rollback(resumed.records)).toMatchObject({
      kind: "applied",
      value: { state: "awaiting-merge", changeRequest },
    });
    expect(rollback(new Map([[previous.slug, previous]]))).toMatchObject({ kind: "idempotent" });
    expect(rollback(new Map([[
      previous.slug,
      groom({ updatedAt: "2026-07-20T00:03:00.000Z" }),
    ]]))).toMatchObject({ kind: "refused" });
  });
});

describe("housekeep routing identity claims", () => {
  it("creates one global routing claim", () => {
    const candidate = housekeep();
    expect(housekeepClaimTransform(candidate)(new Map())).toMatchObject({
      kind: "applied",
      value: { kind: "claimed", record: { slug: candidate.slug, claimId: candidate.claimId } },
    });
  });

  it("resumes the same live slug and refuses a different slug", () => {
    const winner = housekeep();
    expect(housekeepClaimTransform(housekeep({ claimId: "5".repeat(32) }))(
      new Map([[winner.slug, winner]]),
    )).toMatchObject({
      kind: "idempotent",
      value: { kind: "resume", record: { slug: winner.slug, claimId: winner.claimId } },
    });
    const other = housekeep({ slug: "second-route", claimId: "6".repeat(32), branch: "chore/second-route" });
    expect(housekeepClaimTransform(other)(new Map([[winner.slug, winner]])))
      .toMatchObject({ kind: "refused", reason: expect.stringContaining(winner.slug) });
    expect(housekeepClaimTransform(winner)(new Map([
      [winner.slug, winner],
      [other.slug, other],
    ]))).toMatchObject({ kind: "refused", reason: expect.stringContaining("Multiple") });
  });

  it("returns wait for a matching awaiting-merge routing winner", () => {
    const winner = housekeep({
      state: "awaiting-merge",
      changeRequest: { ...changeRequest, headRef: "chore/route-inbox" },
    });
    expect(housekeepClaimTransform(housekeep())(new Map([[winner.slug, winner]])))
      .toMatchObject({ kind: "idempotent", value: { kind: "wait", record: { claimId: winner.claimId } } });
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
      value: { state: "awaiting-merge", claimId: previous.claimId },
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
