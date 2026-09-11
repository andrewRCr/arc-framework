/** Exception-filtered checkpoint interlock surface behavior. */

import { describe, expect, it } from "vitest";

import {
  composeCheckpointInterlockSurface,
  type CheckpointMachineSignal,
} from "../../../../src/scripts/integration/interlock-surface.js";

const oid = (character: string): string => character.repeat(40);

function signals(): CheckpointMachineSignal[] {
  return [
    { kind: "base-drift", label: "Base drift", clean: true, evidence: "Authoritative drift is clean." },
    { kind: "candidate", label: "Candidate", clean: true, evidence: "Candidate is current and converged." },
    { kind: "lifecycle", label: "Lifecycle", clean: true, evidence: "Lifecycle is complete." },
    { kind: "change-request", label: "Change request", clean: true, evidence: "The pull request is exact-head open." },
    { kind: "requirements", label: "Requirements", clean: true, evidence: "All requirements are satisfied." },
    { kind: "required-checks", label: "Required checks", clean: true, evidence: "Required checks are green." },
    { kind: "merge-method", label: "Merge method", clean: true, evidence: "Merge is allowed." },
    { kind: "settlement", label: "Settlement", clean: true, evidence: "No dispositions require settlement." },
    { kind: "checkpoint", label: "Checkpoint", clean: true, evidence: "Composition is persisted." },
  ];
}

describe("checkpoint interlock surface", () => {
  it("renders a fully clean decision surface without expanding all nine facts", () => {
    const result = composeCheckpointInterlockSurface({
      approvedHead: oid("a"),
      repository: "owner/repo",
      pullRequest: 42,
      baseRef: "main",
      observedBase: oid("b"),
      method: "merge",
      candidateTailReference: `${oid("b")}..${oid("a")}`,
      reviewLanding: "Local carrier `local-attestation`.",
      signals: signals(),
    });

    expect(result.machineEvidence.text).toContain(`Approve merge of ${oid("a")} via merge for owner/repo#42.`);
    expect(result.machineEvidence.text).toContain(`Named target: main at last observed base ${oid("b")}.`);
    expect(result.machineEvidence.text).toContain("Host policy controls base currency; ARC pins only the approved head.");
    expect(result.machineEvidence.text).toContain("Required checks are head-bound, not exact base/head-pair evidence.");
    expect(result.machineEvidence.text).toContain("Base movement during the host's in-call merge window remains a residual race.");
    expect(result.machineEvidence.text).not.toMatch(/base OID (?:is|was) pinned/iu);
    expect(result.machineEvidence.text).toContain("Machine evidence: 9 checks clean.");
    expect(result.machineEvidence.text).not.toContain("Authoritative drift is clean.");
    expect(result.extensionReport).toEqual({ label: "Extension report", content: null });
  });

  it("names the candidate tail so the approver can self-serve the diff", () => {
    const clean = composeCheckpointInterlockSurface({
      approvedHead: oid("a"),
      repository: "owner/repo",
      pullRequest: 42,
      baseRef: "main",
      observedBase: oid("b"),
      method: "merge",
      candidateTailReference: `${oid("b")}..${oid("a")}`,
      reviewLanding: "Local carrier `local-attestation`.",
      signals: signals(),
    });
    const evidence = signals();
    evidence[0] = { kind: "base-drift", label: "Base drift", clean: false, evidence: "The base advanced." };
    const exceptions = composeCheckpointInterlockSurface({
      approvedHead: oid("a"),
      repository: "owner/repo",
      pullRequest: 42,
      baseRef: "main",
      observedBase: oid("b"),
      method: "merge",
      candidateTailReference: `${oid("b")}..${oid("a")}`,
      reviewLanding: "Local carrier `local-attestation`.",
      signals: evidence,
    });

    for (const result of [clean, exceptions]) {
      expect(result.machineEvidence.text).toContain(`Candidate tail: ${oid("b")}..${oid("a")}`);
    }
  });

  it("names only the carrier or hosted source where review landed", () => {
    for (const reviewLanding of [
      "Local carrier `local-attestation`.",
      "Hosted source `coderabbit-pr`.",
    ]) {
      const result = composeCheckpointInterlockSurface({
        approvedHead: oid("a"),
        repository: "owner/repo",
        pullRequest: 42,
        baseRef: "main",
        observedBase: oid("b"),
        method: "merge",
        candidateTailReference: `${oid("b")}..${oid("a")}`,
        reviewLanding,
        signals: signals(),
      });
      const reviewLines = result.machineEvidence.text.split("\n")
        .filter((line) => line.startsWith("Review landed: "));
      expect(reviewLines).toEqual([`Review landed: ${reviewLanding}`]);
      expect(reviewLines[0]).not.toMatch(/passes|findings summary|dispositions/iu);
    }
  });

  it("expands any unclean signal with its evidence", () => {
    const evidence = signals();
    evidence[5] = {
      kind: "required-checks",
      label: "Required checks",
      clean: false,
      evidence: "Required checks are still pending on the exact head.",
    };
    const result = composeCheckpointInterlockSurface({
      approvedHead: oid("a"),
      repository: "owner/repo",
      pullRequest: 42,
      baseRef: "main",
      observedBase: oid("b"),
      method: "merge",
      candidateTailReference: `${oid("b")}..${oid("a")}`,
      reviewLanding: "Local carrier `local-attestation`.",
      signals: evidence,
    });

    expect(result.machineEvidence.text).toContain(
      "- Required checks: Required checks are still pending on the exact head.",
    );
    expect(result.machineEvidence.text).not.toContain("Candidate is current and converged.");
  });
});
