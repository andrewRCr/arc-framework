/** Unit coverage for total evidence-delta composition. */

import { describe, expect, it } from "vitest";

import {
  EvidenceDeltaProducerSchema,
  EvidenceDeltaSchema,
  HostMergeAdmissionSchema,
  composeEvidenceDelta,
} from "../../../src/lib/evidence-applicability/index.js";

const oid = (character: string): string => character.repeat(40);
const digest = (character: string): string => `sha256:${character.repeat(64)}`;
const coordinates = (base = oid("a"), head = oid("b")) => ({
  repository: "owner/repo",
  changeRequest: 42,
  base,
  head,
});
const target = (revision: string) => ({
  revision,
  subject: { entries: [], subjectDigest: digest(revision[0] ?? "a") },
});
const overlap = {
  status: "available" as const,
  substantivePaths: ["packages/arc-framework/src/example.ts"],
  regenerablePaths: [".arc/backlog/ROADMAP.md"],
};

describe("evidence delta composition", () => {
  it("normalizes a base movement into every total axis", () => {
    expect(composeEvidenceDelta({
      cause: "base-movement",
      observation: { coordinates: coordinates(), overlap },
      hostAdmission: {
        state: "mergeable",
        coordinates: coordinates(),
        evidenceRef: "host://merge/42",
      },
    })).toEqual({
      cause: "base-movement",
      relation: "not-applicable",
      overlap: {
        kind: "overlapping",
        substantivePaths: ["packages/arc-framework/src/example.ts"],
        regenerablePaths: [".arc/backlog/ROADMAP.md"],
      },
      hostAdmission: {
        state: "mergeable",
        coordinates: coordinates(),
        evidenceRef: "host://merge/42",
        detail: null,
      },
      approvedScope: "not-applicable",
      observed: { kind: "base-movement", coordinates: coordinates() },
      residual: ["packages/arc-framework/src/example.ts"],
    });
  });

  it("rejects mismatched host authority into an unresolved admission", () => {
    expect(composeEvidenceDelta({
      cause: "base-movement",
      observation: { coordinates: coordinates(), overlap },
      hostAdmission: {
        state: "mergeable",
        coordinates: coordinates(oid("c"), oid("d")),
        evidenceRef: "host://merge/42",
      },
    })).toMatchObject({
      hostAdmission: {
        state: "unresolved",
        coordinates: null,
        evidenceRef: "host://merge/42",
      },
    });
  });

  it("rejects normalized host authority bound to different coordinates", () => {
    const movement = composeEvidenceDelta({
      cause: "base-movement",
      observation: {
        coordinates: coordinates(),
        overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
      },
      hostAdmission: {
        state: "mergeable",
        coordinates: coordinates(),
      },
    });
    expect(EvidenceDeltaSchema.safeParse({
      ...movement,
      hostAdmission: {
        ...movement.hostAdmission,
        coordinates: { ...coordinates(), changeRequest: 99 },
      },
    }).success).toBe(false);

    const before = coordinates(oid("a"), oid("b"));
    const after = coordinates(oid("c"), oid("b"));
    const merge = composeEvidenceDelta({
      cause: "base-merge",
      before,
      after,
      overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
      hostAdmission: { state: "mergeable", coordinates: after },
    });
    expect(EvidenceDeltaSchema.safeParse({
      ...merge,
      hostAdmission: {
        ...merge.hostAdmission,
        coordinates: { ...after, repository: "other/repo" },
      },
    }).success).toBe(false);
  });

  it("maps D4 proof relations and preserves only bounded residuals", () => {
    const endpoints = {
      before: {
        predecessor: { head: oid("1"), tree: oid("2") },
        member: { head: oid("3"), tree: oid("4") },
      },
      after: {
        predecessor: { head: oid("5"), tree: oid("6") },
        member: { head: oid("7"), tree: oid("8") },
      },
    };
    expect(composeEvidenceDelta({
      cause: "member-rewrite",
      endpoints,
      proof: {
        status: "refused",
        reason: "contribution-diverged",
        paths: ["b.ts", "a.ts", "a.ts"],
      },
    })).toMatchObject({
      cause: "member-rewrite",
      relation: "clean-divergence",
      observed: { kind: "member-rewrite", endpoints },
      residual: ["a.ts", "b.ts"],
    });

    expect(composeEvidenceDelta({
      cause: "member-rewrite",
      endpoints,
      proof: {
        status: "refused",
        reason: "contribution-diverged",
        paths: Array.from({ length: 201 }, (_, index) => `path-${String(index).padStart(3, "0")}.ts`),
      },
    })).toMatchObject({ relation: "clean-divergence", residual: null });
  });

  it("derives approved scope only from the optional approver-bound field", () => {
    const common = {
      cause: "approved-fix" as const,
      response: {
        candidateId: digest("a"),
        dispositionId: digest("b"),
        oldTarget: target(oid("a")),
        newTarget: target(oid("b")),
        applicability: "targeted" as const,
      },
      delta: { added: [], removed: [], changed: ["packages/arc-framework/src/example.ts"] },
    };

    expect(composeEvidenceDelta(common)).toMatchObject({ approvedScope: "full" });
    expect(composeEvidenceDelta({
      ...common,
      response: { ...common.response, approvedVerification: "focused" },
    })).toMatchObject({ approvedScope: "focused" });
  });

  it("normalizes base-merge and unexplained observations without invented axes", () => {
    const before = coordinates(oid("a"), oid("b"));
    const after = coordinates(oid("c"), oid("b"));
    expect(composeEvidenceDelta({
      cause: "base-merge",
      before,
      after,
      overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
    })).toMatchObject({
      cause: "base-merge",
      relation: "not-applicable",
      overlap: { kind: "disjoint" },
      observed: { kind: "base-merge", before, after },
    });

    expect(composeEvidenceDelta({
      cause: "unexplained",
      candidateId: digest("a"),
      priorTarget: target(oid("a")),
      currentTarget: target(oid("b")),
      delta: { added: ["a.ts"], removed: [], changed: [] },
    })).toMatchObject({
      cause: "unexplained",
      relation: "not-applicable",
      overlap: { kind: "not-applicable" },
      hostAdmission: { state: "not-applicable" },
      approvedScope: "not-applicable",
      residual: ["a.ts"],
    });
  });

  it("rejects extra keys and contradictory normalized overlap", () => {
    const normalized = composeEvidenceDelta({
      cause: "base-movement",
      observation: {
        coordinates: coordinates(),
        overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
      },
    });
    expect(EvidenceDeltaSchema.safeParse({ ...normalized, extra: true }).success).toBe(false);
    expect(EvidenceDeltaSchema.safeParse({
      ...normalized,
      overlap: {
        kind: "disjoint",
        substantivePaths: ["unexpected.ts"],
        regenerablePaths: [],
      },
    }).success).toBe(false);
  });

  it("retains exact over-bound overlap while closing the judgment residual", () => {
    const paths = Array.from(
      { length: 201 },
      (_, index) => `path-${String(index).padStart(3, "0")}.ts`,
    );
    expect(composeEvidenceDelta({
      cause: "base-movement",
      observation: {
        coordinates: coordinates(),
        overlap: { status: "available", substantivePaths: paths, regenerablePaths: [] },
      },
    })).toMatchObject({
      overlap: { kind: "overlapping", substantivePaths: paths },
      residual: null,
    });
  });

  it("rejects normalized base movement with an incomplete overlap residual", () => {
    const paths = Array.from(
      { length: 201 },
      (_, index) => `path-${String(index).padStart(3, "0")}.ts`,
    );
    const normalized = composeEvidenceDelta({
      cause: "base-movement",
      observation: {
        coordinates: coordinates(),
        overlap: { status: "available", substantivePaths: paths, regenerablePaths: [] },
      },
    });
    expect(EvidenceDeltaSchema.safeParse({ ...normalized, residual: [paths[0]] }).success)
      .toBe(false);

    const bounded = composeEvidenceDelta({
      cause: "base-movement",
      observation: {
        coordinates: coordinates(),
        overlap: { status: "available", substantivePaths: ["a.ts", "b.ts"], regenerablePaths: [] },
      },
    });
    expect(EvidenceDeltaSchema.safeParse({ ...bounded, residual: ["a.ts"] }).success).toBe(false);
  });

  it("canonicalizes valid Unicode paths by UTF-8 byte order", () => {
    const bmpPath = "\uE000.ts";
    const astralPath = "\u{10000}.ts";
    expect(composeEvidenceDelta({
      cause: "base-movement",
      observation: {
        coordinates: coordinates(),
        overlap: {
          status: "available",
          substantivePaths: [astralPath, bmpPath],
          regenerablePaths: [],
        },
      },
    })).toMatchObject({
      overlap: { substantivePaths: [bmpPath, astralPath] },
      residual: [bmpPath, astralPath],
    });
  });

  it("fails strict producer and host boundaries closed", () => {
    expect(EvidenceDeltaProducerSchema.safeParse({
      cause: "base-movement",
      observation: {
        coordinates: coordinates(),
        overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
      },
      extra: true,
    }).success).toBe(false);
    expect(EvidenceDeltaProducerSchema.safeParse({ cause: "base-movement" }).success).toBe(false);
    expect(EvidenceDeltaProducerSchema.safeParse({
      cause: "member-rewrite",
      endpoints: {},
      proof: { status: "accepted", proof: "unknown" },
    }).success).toBe(false);
    expect(HostMergeAdmissionSchema.safeParse({
      state: "mergeable",
      coordinates: coordinates(),
      providerStatus: 200,
    }).success).toBe(false);
  });

  it("rejects a base merge that changes non-base coordinates", () => {
    expect(EvidenceDeltaProducerSchema.safeParse({
      cause: "base-merge",
      before: coordinates(oid("a"), oid("b")),
      after: { ...coordinates(oid("c"), oid("d")), changeRequest: 43 },
      overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
    }).success).toBe(false);
  });

  it("rejects normalized base-merge coordinate discontinuity", () => {
    const before = coordinates(oid("a"), oid("b"));
    const after = coordinates(oid("c"), oid("b"));
    const normalized = composeEvidenceDelta({
      cause: "base-merge",
      before,
      after,
      overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
    });

    expect(EvidenceDeltaSchema.safeParse({
      ...normalized,
      observed: {
        ...normalized.observed,
        after: {
          ...after,
          repository: "other/repo",
          changeRequest: 99,
          head: oid("d"),
        },
      },
    }).success).toBe(false);
  });

  it("rejects normalized carried D4 relations with divergence residuals", () => {
    const endpoints = {
      before: {
        predecessor: { head: oid("1"), tree: oid("2") },
        member: { head: oid("3"), tree: oid("4") },
      },
      after: {
        predecessor: { head: oid("5"), tree: oid("6") },
        member: { head: oid("7"), tree: oid("8") },
      },
    };
    const proof = {
      status: "refused" as const,
      reason: "contribution-diverged" as const,
      paths: ["security.ts"],
    };
    const rewrite = composeEvidenceDelta({ cause: "member-rewrite", endpoints, proof });
    expect(EvidenceDeltaSchema.safeParse({ ...rewrite, relation: "equal" }).success).toBe(false);

    const before = coordinates(oid("a"), oid("b"));
    const after = coordinates(oid("c"), oid("b"));
    const merge = composeEvidenceDelta({
      cause: "base-merge",
      before,
      after,
      overlap: { status: "available", substantivePaths: [], regenerablePaths: [] },
      projection: { endpoints, proof },
    });
    expect(EvidenceDeltaSchema.safeParse({
      ...merge,
      relation: "mechanical-reapply",
    }).success).toBe(false);
  });
});
