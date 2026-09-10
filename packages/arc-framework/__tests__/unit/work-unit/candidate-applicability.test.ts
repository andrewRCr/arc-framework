/** Candidate applicability classification over storage-neutral structural facts. */

import { describe, expect, it } from "vitest";

import { canonicalDigest } from "../../../src/lib/canonical/canonical-json.js";
import {
  MAX_CANDIDATE_APPLICABILITY_PATH_BYTES,
  MAX_CANDIDATE_APPLICABILITY_PATHS,
  candidateApplicabilityDigests,
  classifyCandidateApplicability,
} from "../../../src/lib/work-unit/candidate-applicability.js";
import { createCandidateSubjectSnapshot } from "../../../src/lib/work-unit/candidate-attestation.js";

const oid = (character: string): string => character.repeat(40);

function subject(source: string) {
  return createCandidateSubjectSnapshot([{
    path: "packages/arc-framework/src/example.ts",
    mode: "100644",
    digest: canonicalDigest({ source }),
    treatment: "reviewable",
  }]);
}

function request(currentSubject = subject("baseline")) {
  return {
    candidateId: canonicalDigest({ candidate: "example" }),
    baselineTarget: { revision: oid("a"), subject: subject("baseline") },
    currentTarget: { revision: oid("c"), subject: currentSubject },
    currentBase: oid("b"),
  };
}

function endpoints() {
  return {
    before: {
      predecessor: { head: oid("1"), tree: oid("2") },
      member: { head: oid("a"), tree: oid("3") },
    },
    after: {
      predecessor: { head: oid("b"), tree: oid("4") },
      member: { head: oid("c"), tree: oid("5") },
    },
  };
}

describe("Candidate applicability", () => {
  it("recognizes an exact new head as an operational-only advance when its subject is equal", () => {
    const input = request();
    const digests = candidateApplicabilityDigests({
      request: input,
      projection: null,
      verdict: "subject-equality",
      paths: [],
    });

    expect(classifyCandidateApplicability(input, null)).toEqual({
      schemaVersion: 1,
      mode: "candidate-applicability",
      candidateId: input.candidateId,
      baselineTarget: {
        revision: oid("a"),
        subjectDigest: input.baselineTarget.subject.subjectDigest,
      },
      currentTarget: {
        revision: oid("c"),
        subjectDigest: input.currentTarget.subject.subjectDigest,
      },
      currentBase: oid("b"),
      state: "applicable",
      nextAction: "recognize-current",
      proof: "subject-equality",
      projection: null,
      ...digests,
    });
  });

  it("recognizes the exact new head when D4 proves a mechanical reapply", () => {
    const input = request(subject("changed"));
    const projection = endpoints();
    const digests = candidateApplicabilityDigests({
      request: input,
      projection,
      verdict: "mechanical-reapply",
      paths: [],
    });

    expect(classifyCandidateApplicability(input, {
      endpoints: projection,
      proof: { status: "accepted", proof: "mechanical-reapply" },
    })).toMatchObject({
      state: "applicable",
      nextAction: "recognize-current",
      proof: "mechanical-reapply",
      currentTarget: { revision: oid("c") },
      projection,
      ...digests,
    });
  });

  it("recognizes a reapply whose exact residual contains only non-reviewable Candidate entries", () => {
    const currentSubject = createCandidateSubjectSnapshot([
      {
        path: "packages/arc-framework/src/example.ts",
        mode: "100644",
        digest: canonicalDigest({ source: "changed" }),
        treatment: "reviewable",
      },
      {
        path: ".arc/system/.internal/candidates/example.json",
        mode: "100644",
        digest: canonicalDigest({ source: "Candidate projection" }),
        treatment: "evidence-neutral",
      },
    ]);
    const input = request(currentSubject);

    expect(classifyCandidateApplicability(input, {
      endpoints: endpoints(),
      proof: {
        status: "refused",
        reason: "contribution-diverged",
        paths: [".arc/system/.internal/candidates/example.json"],
      },
    })).toMatchObject({
      state: "applicable",
      nextAction: "recognize-current",
      proof: "mechanical-reapply",
      currentTarget: { revision: oid("c"), subjectDigest: currentSubject.subjectDigest },
    });
  });

  it("returns complete exact-bound facts when clean reapplication diverges", () => {
    const input = request(subject("changed"));
    const projection = endpoints();
    const paths = ["packages/arc-framework/src/a.ts", "packages/arc-framework/src/b.ts"];
    const digests = candidateApplicabilityDigests({
      request: input,
      projection,
      verdict: "clean-divergence",
      paths,
    });
    const selectionOfferText = [
      `Candidate applicability is not mechanically decidable for ${input.candidateId}.`,
      `Prior target: ${oid("a")} (${input.baselineTarget.subject.subjectDigest})`,
      `Current target: ${oid("c")} (${input.currentTarget.subject.subjectDigest})`,
      `Current base: ${oid("b")}`,
      "Structural verdict: clean-divergence",
      `Bounded residual (2 paths): ${paths.join(", ")}`,
      `Projection digest: ${digests.projectionDigest}`,
      `Residual digest: ${digests.residualDigest}`,
      "Select one explicit authority outcome: covered | targeted-check | changed.",
    ].join("\n");

    expect(classifyCandidateApplicability(input, {
      endpoints: projection,
      proof: { status: "refused", reason: "contribution-diverged", paths },
    })).toMatchObject({
      state: "decision-required",
      nextAction: "request-authority",
      verdict: "clean-divergence",
      baselineTarget: {
        revision: oid("a"),
        subjectDigest: input.baselineTarget.subject.subjectDigest,
      },
      currentTarget: {
        revision: oid("c"),
        subjectDigest: input.currentTarget.subject.subjectDigest,
      },
      currentBase: oid("b"),
      projection,
      paths,
      choices: ["covered", "targeted-check", "changed"],
      selectionOfferText,
      recommendedActionText:
        "Recommend `covered` only when existing settled review and verification already cover the bounded "
        + "residual; recommend `targeted-check` when a completed bounded check can settle it; otherwise recommend "
        + "`changed`. Record only the operator's explicit selection.",
      selectionPromptText:
        "Select Candidate applicability: covered, targeted-check, or changed?",
      ...digests,
    });
  });

  it("returns the same exact-bound decision surface for structural interaction", () => {
    const input = request(subject("changed"));
    const projection = endpoints();
    const paths = ["packages/arc-framework/src/example.ts"];

    expect(classifyCandidateApplicability(input, {
      endpoints: projection,
      proof: { status: "refused", reason: "contribution-conflicted", paths },
    })).toMatchObject({
      state: "decision-required",
      nextAction: "request-authority",
      verdict: "interaction",
      baselineTarget: { revision: oid("a") },
      currentTarget: { revision: oid("c") },
      currentBase: oid("b"),
      projection,
      paths,
    });
  });

  it("stops as unavailable when a non-mechanical result has no residual paths", () => {
    expect(classifyCandidateApplicability(request(subject("changed")), {
      endpoints: endpoints(),
      proof: { status: "refused", reason: "contribution-diverged", paths: [] },
    })).toMatchObject({
      state: "classification-unavailable",
      nextAction: "stop",
      reason: "residual-empty",
    });
  });

  it("stops as unavailable when residual path evidence exceeds the count bound", () => {
    const paths = Array.from(
      { length: MAX_CANDIDATE_APPLICABILITY_PATHS + 1 },
      (_, index) => `packages/arc-framework/src/generated/${String(index).padStart(3, "0")}.ts`,
    );
    expect(classifyCandidateApplicability(request(subject("changed")), {
      endpoints: endpoints(),
      proof: { status: "refused", reason: "contribution-diverged", paths },
    })).toMatchObject({
      state: "classification-unavailable",
      nextAction: "stop",
      reason: "residual-unbounded",
    });
  });

  it("stops as unavailable when residual path evidence exceeds the byte bound", () => {
    const paths = [`packages/${"a".repeat(MAX_CANDIDATE_APPLICABILITY_PATH_BYTES)}.ts`];
    expect(classifyCandidateApplicability(request(subject("changed")), {
      endpoints: endpoints(),
      proof: { status: "refused", reason: "contribution-conflicted", paths },
    })).toMatchObject({
      state: "classification-unavailable",
      nextAction: "stop",
      reason: "residual-unbounded",
    });
  });

  it("routes an unavailable D4 capability to upgrade without an authority choice", () => {
    expect(classifyCandidateApplicability(request(subject("changed")), {
      endpoints: endpoints(),
      proof: { status: "refused", reason: "merge-tree-write-tree-unsupported" },
    })).toMatchObject({
      state: "classification-unsupported",
      nextAction: "upgrade",
      reason: "merge-tree-write-tree-unsupported",
    });
  });

  it("stops on a D4 Git failure without presenting an authority choice", () => {
    expect(classifyCandidateApplicability(request(subject("changed")), {
      endpoints: endpoints(),
      proof: { status: "refused", reason: "git-failure" },
    })).toMatchObject({
      state: "classification-failed",
      nextAction: "stop",
      reason: "git-failure",
    });
  });

  it("reruns the checkpoint when a pinned D4 snapshot is invalidated", () => {
    expect(classifyCandidateApplicability(request(subject("changed")), {
      endpoints: endpoints(),
      proof: { status: "refused", reason: "contribution-endpoints-unverified" },
    })).toMatchObject({
      state: "rerun-checkpoint",
      nextAction: "rerun-checkpoint",
      reason: "snapshot-invalidated",
      observed: null,
    });
  });
});
