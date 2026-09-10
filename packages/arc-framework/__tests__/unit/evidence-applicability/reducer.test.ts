/** Closed-row coverage for deterministic evidence applicability. */

import { describe, expect, it } from "vitest";

import {
  EvidenceApplicabilityResultSchema,
  EvidenceKindSchema,
  reduceEvidenceApplicability,
} from "../../../src/lib/evidence-applicability/reducer.js";
import { composeEvidenceDelta } from "../../../src/lib/evidence-applicability/compose.js";

const oid = (character: string): string => character.repeat(40);
const digest = (character: string): string => `sha256:${character.repeat(64)}`;
const coordinates = () => ({
  repository: "owner/repo",
  changeRequest: 42,
  base: oid("a"),
  head: oid("b"),
});
const target = (revision: string) => ({
  revision,
  subject: { entries: [], subjectDigest: digest(revision[0] ?? "a") },
});
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

function baseMovement(input: {
  paths?: string[];
  unavailable?: boolean;
  admitted?: boolean;
}) {
  return composeEvidenceDelta({
    cause: "base-movement",
    observation: {
      coordinates: coordinates(),
      overlap: input.unavailable === true
        ? { status: "unavailable", reason: "classification-failed" }
        : {
            status: "available",
            substantivePaths: input.paths ?? [],
            regenerablePaths: [],
          },
    },
    ...(input.admitted === true
      ? {
          hostAdmission: {
            state: "mergeable" as const,
            coordinates: coordinates(),
            evidenceRef: "host://merge/42",
          },
        }
      : {}),
  });
}

describe("evidence applicability reducer", () => {
  it("makes unexplained movement fresh for every evidence kind", () => {
    const delta = composeEvidenceDelta({
      cause: "unexplained",
      candidateId: digest("a"),
      priorTarget: target(oid("a")),
      currentTarget: target(oid("b")),
      delta: { added: ["a.ts"], removed: [], changed: [] },
    });
    for (const evidence of EvidenceKindSchema.options) {
      expect(reduceEvidenceApplicability(delta, evidence)).toMatchObject({
        verdict: "fresh",
        judgmentRequired: false,
        residual: null,
      });
    }
  });

  it("maps approved verification scope without weakening review clearance", () => {
    const make = (approvedVerification: "targeted" | "focused" | "full") => composeEvidenceDelta({
      cause: "approved-fix",
      response: {
        candidateId: digest("a"),
        dispositionId: digest("b"),
        oldTarget: target(oid("a")),
        newTarget: target(oid("b")),
        approvedVerification,
      },
      delta: { added: [], removed: [], changed: ["a.ts"] },
    });
    expect(reduceEvidenceApplicability(make("targeted"), "verification"))
      .toMatchObject({ verdict: "carries", judgmentRequired: false });
    expect(reduceEvidenceApplicability(make("focused"), "verification"))
      .toMatchObject({ verdict: "supplemental", judgmentRequired: false });
    expect(reduceEvidenceApplicability(make("full"), "verification"))
      .toMatchObject({ verdict: "fresh", judgmentRequired: false });
    expect(reduceEvidenceApplicability(make("targeted"), "review-clearance"))
      .toMatchObject({ verdict: "fresh", judgmentRequired: false });
  });

  it("carries disjoint review and verification but escalates bounded overlap", () => {
    for (const evidence of ["review-clearance", "verification"] as const) {
      expect(reduceEvidenceApplicability(baseMovement({}), evidence))
        .toMatchObject({ verdict: "carries", judgmentRequired: false, residual: null });
      expect(reduceEvidenceApplicability(baseMovement({ unavailable: true }), evidence))
        .toMatchObject({ verdict: "fresh", judgmentRequired: false, residual: null });
      expect(reduceEvidenceApplicability(baseMovement({ paths: ["a.ts"] }), evidence))
        .toMatchObject({ verdict: "supplemental", judgmentRequired: true, residual: ["a.ts"] });
    }
  });

  it("keeps merge-safety mechanical and exact-admission-only", () => {
    expect(reduceEvidenceApplicability(baseMovement({ admitted: true }), "merge-safety"))
      .toMatchObject({ verdict: "carries", judgmentRequired: false });
    expect(reduceEvidenceApplicability(baseMovement({}), "merge-safety"))
      .toMatchObject({ verdict: "fresh", judgmentRequired: false });
    expect(reduceEvidenceApplicability(
      baseMovement({ admitted: true, paths: ["a.ts"] }),
      "merge-safety",
    )).toMatchObject({ verdict: "fresh", judgmentRequired: false });
  });

  it("reduces D4 relation rows without turning interaction into judgment", () => {
    const compose = (proof: {
      status: "accepted";
      proof: "tree-equality" | "mechanical-reapply";
    } | {
      status: "refused";
      reason: "contribution-diverged" | "contribution-conflicted";
      paths: string[];
    }) => composeEvidenceDelta({ cause: "member-rewrite", endpoints, proof });

    expect(reduceEvidenceApplicability(
      compose({ status: "accepted", proof: "tree-equality" }),
      "review-clearance",
    )).toMatchObject({ verdict: "carries", judgmentRequired: false });
    expect(reduceEvidenceApplicability(
      compose({ status: "accepted", proof: "mechanical-reapply" }),
      "verification",
    )).toMatchObject({ verdict: "carries", judgmentRequired: false });
    expect(reduceEvidenceApplicability(
      compose({ status: "refused", reason: "contribution-diverged", paths: ["a.ts"] }),
      "review-clearance",
    )).toMatchObject({ verdict: "supplemental", judgmentRequired: true, residual: ["a.ts"] });
    expect(reduceEvidenceApplicability(
      compose({ status: "refused", reason: "contribution-conflicted", paths: ["a.ts"] }),
      "verification",
    )).toMatchObject({ verdict: "fresh", judgmentRequired: false });
  });

  it("layers overlap over D4 relation without weakening unavailable rows", () => {
    const make = (
      overlapPaths: string[],
      proof: { status: "accepted"; proof: "tree-equality" } | {
        status: "refused";
        reason: "contribution-diverged";
        paths: string[];
      },
    ) => composeEvidenceDelta({
      cause: "base-merge",
      before: coordinates(),
      after: { ...coordinates(), base: oid("c") },
      overlap: { status: "available", substantivePaths: overlapPaths, regenerablePaths: [] },
      projection: { endpoints, proof },
    });

    expect(reduceEvidenceApplicability(
      make(["a.ts"], { status: "accepted", proof: "tree-equality" }),
      "verification",
    )).toMatchObject({ verdict: "supplemental", judgmentRequired: false });
    expect(reduceEvidenceApplicability(
      make([], { status: "accepted", proof: "tree-equality" }),
      "review-clearance",
    )).toMatchObject({ verdict: "carries", judgmentRequired: false });
    expect(reduceEvidenceApplicability(
      make(["a.ts"], {
        status: "refused",
        reason: "contribution-diverged",
        paths: ["a.ts"],
      }),
      "verification",
    )).toMatchObject({ verdict: "supplemental", judgmentRequired: true, residual: ["a.ts"] });
  });

  it("fails closed when overlapping evidence cannot carry a bounded residual", () => {
    const paths = Array.from(
      { length: 201 },
      (_, index) => `path-${String(index).padStart(3, "0")}.ts`,
    );
    expect(reduceEvidenceApplicability(baseMovement({ paths }), "verification"))
      .toMatchObject({ verdict: "fresh", judgmentRequired: false, residual: null });
  });

  it("rejects impossible result pairs and unknown evidence kinds", () => {
    expect(EvidenceKindSchema.safeParse("deployment").success).toBe(false);
    expect(EvidenceApplicabilityResultSchema.safeParse({
      verdict: "carries",
      judgmentRequired: true,
      residual: null,
      reason: "bounded-residual",
    }).success).toBe(false);
  });
});
