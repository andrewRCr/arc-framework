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
    { kind: "review-record", label: "Review record", clean: true, evidence: "No dispositions require settlement." },
    { kind: "checkpoint", label: "Checkpoint", clean: true, evidence: "Composition is persisted." },
  ];
}

describe("checkpoint interlock surface", () => {
  it("renders a fully clean decision surface without expanding all nine facts", () => {
    const result = composeCheckpointInterlockSurface({
      approvedHead: oid("a"),
      repository: "owner/repo",
      pullRequest: 42,
      method: "merge",
      signals: signals(),
    });

    expect(result.machineEvidence.text).toContain(`Approve merge of ${oid("a")} via merge for owner/repo#42.`);
    expect(result.machineEvidence.text).toContain("Machine evidence: 9 checks clean.");
    expect(result.machineEvidence.text).not.toContain("Authoritative drift is clean.");
    expect(result.extensionReport).toEqual({ label: "Extension report", content: null });
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
      method: "merge",
      signals: evidence,
    });

    expect(result.machineEvidence.text).toContain(
      "- Required checks: Required checks are still pending on the exact head.",
    );
    expect(result.machineEvidence.text).not.toContain("Candidate is current and converged.");
  });
});
